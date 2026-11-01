import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let currentUser: any = null;
  let targetStore = 'Hyderguda';

  try {
    const { user, profile } = await authenticateRequest(req);
    currentUser = user;

    const { store_id, prompt, metrics, chat_history } = await req.json();
    targetStore = store_id || 'Hyderguda';

    if (!prompt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'prompt is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check store permission
    const isCentralAdmin = profile.role === 'CENTRAL_ADMIN' &&
      profile.user_store_access?.some((s: any) => s.store_id === 'Hyderguda');
    const hasAccess = isCentralAdmin || profile.user_store_access?.some((s: any) => s.store_id === targetStore);

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ ok: false, error: `Forbidden: No access to store ${targetStore}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const adminClient = getSupabaseAdmin();

    // 1. Check Rate Limit (25 requests/hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await adminClient
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if ((count || 0) >= 25) {
      await adminClient.from('ai_usage_logs').insert({
        user_id: user.id,
        store_id: targetStore,
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        request_count: 1,
        token_usage: 0,
        status: 'RATE_LIMITED',
      });
      return new Response(
        JSON.stringify({ ok: false, error: 'Hourly AI request quota exceeded (25 requests/hour limit).' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // 2. Strict PII Sanitization
    const phoneRegex = /\b\d{10}\b|\b\+?91[\-\s]?\d{10}\b/g;
    const sanitizedPrompt = String(prompt).replace(phoneRegex, '******[PHONE_REDACTED]');

    // 3. Check Cloud AI Sales Sharing Consent
    const { data: consentSetting } = await adminClient
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'cloud_ai_sales_sharing')
      .single();

    const isSalesSharingEnabled = consentSetting?.setting_value?.enabled === true;
    const safeMetrics = isSalesSharingEnabled ? metrics : {
      store_name: targetStore,
      note: 'Cloud transmission of raw sales figures is disabled by Central Administrator policy.',
    };

    // 4. Contact Gemini or Groq via Secure Server-Side Secrets
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY');

    let answer = '';
    let providerUsed = 'gemini';
    let modelUsed = 'gemini-1.5-flash';
    let tokensEst = 350;

    if (geminiKey) {
      providerUsed = 'gemini';
      modelUsed = 'gemini-1.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelUsed}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      const systemPrompt = `You are the HUFT (Heads Up For Tails) Sales & Operations AI Assistant for store: ${targetStore}.
Answer concisely with actionable retail advice. Do not reveal customer PII or raw numbers unless permitted.
Store context: ${JSON.stringify(safeMetrics)}`;

      const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: `Ready to assist HUFT ${targetStore} store.` }] },
        ...(chat_history || []).slice(-4),
        { role: 'user', parts: [{ text: sanitizedPrompt }] },
      ];

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } }),
      });

      if (!resp.ok) {
        throw new Error(`Gemini API HTTP ${resp.status}`);
      }

      const gData = await resp.json();
      answer = gData?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    } else if (groqKey) {
      providerUsed = 'groq';
      modelUsed = 'llama-3.1-70b-versatile';
      const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: modelUsed,
          messages: [
            { role: 'system', content: `HUFT Sales Assistant for store: ${targetStore}.` },
            { role: 'user', content: sanitizedPrompt },
          ],
          max_tokens: 600,
        }),
      });

      if (!resp.ok) throw new Error(`Groq API HTTP ${resp.status}`);
      const grData = await resp.json();
      answer = grData?.choices?.[0]?.message?.content || 'No response generated.';
    } else {
      throw new Error('AI backend keys (GEMINI_API_KEY / GROQ_API_KEY) are not configured in Supabase Edge Secrets.');
    }

    // 5. Log AI Usage
    await adminClient.from('ai_usage_logs').insert({
      user_id: user.id,
      store_id: targetStore,
      provider: providerUsed,
      model: modelUsed,
      request_count: 1,
      token_usage: tokensEst,
      status: 'SUCCESS',
    });

    return new Response(
      JSON.stringify({
        ok: true,
        store: targetStore,
        answer: answer,
        provider: providerUsed,
        usage: { requests_remaining: Math.max(0, 24 - (count || 0)) },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    if (currentUser) {
      const adminClient = getSupabaseAdmin();
      await adminClient.from('ai_usage_logs').insert({
        user_id: currentUser.id,
        store_id: targetStore,
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        request_count: 1,
        token_usage: 0,
        status: 'ERROR',
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
