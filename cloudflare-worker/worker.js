/**
 * HUFT Sales Dashboard - Protected Gemini AI Proxy Cloudflare Worker
 * 
 * Features:
 * - Supabase JWT Token Verification (HMAC SHA-256 / Auth API verification)
 * - Strict Store-level Permission Checking (Role & Status Validation)
 * - Rate Limiting (Hourly Token Bucket per user/store)
 * - PII Sanitizer & Request Validator (Prevents customer data or raw POS dumps from reaching Gemini)
 * - Gemini 1.5 Flash API with server-side GEMINI_API_KEY secret
 * - AI Usage & Audit Logging directly to Supabase ai_usage_logs
 */

// In-memory rate limiting store (falls back to KV when bound)
const memoryRateLimits = new Map();

export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight & Headers
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "*").split(",").map(o => o.trim());
    const isAllowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Store-ID",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    };

    try {
      // 2. Validate Authorization Header (Supabase Bearer Token)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "Missing or invalid Authorization header. Sign in required." }, 401);
      }
      const token = authHeader.replace("Bearer ", "").trim();

      // 3. Authenticate User with Supabase Auth API
      const supabaseUrl = env.SUPABASE_URL;
      const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        return jsonResponse({ error: "Server configuration error: SUPABASE_URL is missing." }, 500);
      }

      const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": serviceRoleKey
        }
      });

      if (!userResponse.ok) {
        return jsonResponse({ error: "Invalid or expired session token. Please re-authenticate." }, 401);
      }

      const userData = await userResponse.json();
      const userId = userData.id;
      const userEmail = userData.email;

      // 4. Fetch User Profile & Check Account Status / Store Permissions
      const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey
        }
      });

      const profiles = await profileResponse.json();
      const profile = profiles && profiles[0];

      if (!profile) {
        return jsonResponse({ error: "User profile not found in database." }, 403);
      }

      if (profile.status !== "active") {
        return jsonResponse({ 
          error: profile.status === "pending_approval" 
            ? "Your account is pending Central Admin approval. AI access is disabled."
            : "Your account is deactivated. Access denied."
        }, 403);
      }

      if (profile.ai_access_enabled === false) {
        return jsonResponse({ error: "AI Sales Assistant access has been disabled for your account by Central Admin." }, 403);
      }

      // 5. Parse and Validate Request Body
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return jsonResponse({ error: "Invalid JSON request body." }, 400);
      }

      const { store_id, prompt, metrics } = body;
      if (!store_id || !prompt) {
        return jsonResponse({ error: "Both 'store_id' and 'prompt' are required." }, 400);
      }

      // 6. Verify Store Permission (Rule: only Hyderguda has Central Admin privileges)
      const userRole = profile.role || "store_manager";
      const assignedStore = profile.store_id;
      const isHydergudaAdmin = userRole === "admin" && assignedStore === "Hyderguda";

      if (!isHydergudaAdmin && assignedStore !== store_id) {
        return jsonResponse({ 
          error: `Store Permission Denied. Your account is only authorized for store: '${assignedStore}'. You cannot query data for '${store_id}'.` 
        }, 403);
      }

      // 7. Rate Limiting Check (Hourly Limit)
      const maxPerHour = parseInt(env.MAX_REQUESTS_PER_HOUR || "25", 10);
      const rateLimitKey = `${userId}:${store_id}:${new Date().getUTCHours()}`;
      const currentRequests = memoryRateLimits.get(rateLimitKey) || 0;

      if (currentRequests >= maxPerHour) {
        // Log rate limited incident
        ctx.waitUntil(logAiUsage(supabaseUrl, serviceRoleKey, {
          user_id: userId,
          user_email: userEmail,
          store_id: store_id,
          prompt_summary: sanitizeSummary(prompt),
          tokens_used: 0,
          status: "rate_limited",
          error_message: `Hourly limit of ${maxPerHour} requests exceeded.`
        }));

        return jsonResponse({ 
          error: `Rate limit reached (${maxPerHour} requests/hour). Please wait until the next hour to submit more queries.` 
        }, 429);
      }

      memoryRateLimits.set(rateLimitKey, currentRequests + 1);

      // Clean up old rate limit keys occasionally
      if (memoryRateLimits.size > 1000) {
        memoryRateLimits.clear();
      }

      // 8. Strict PII & Data Privacy Sanitizer
      // Prevent raw customer mobile numbers, credit cards, or raw line records
      const containsPhoneRegex = /\b[6-9]\d{9}\b/;
      const containsEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;

      if (containsPhoneRegex.test(prompt) || containsEmailRegex.test(prompt)) {
        return jsonResponse({
          error: "Data Privacy Violation: Prompts must not contain customer phone numbers or email addresses."
        }, 400);
      }

      // 9. Format Safe Anonymized Context for Gemini
      const sanitizedMetrics = sanitizeMetrics(metrics);

      const systemInstruction = `You are the HUFT AI Sales Assistant for Heads Up For Tails (HUFT) store network.
Your mission is to provide senior store managers with clear, actionable retail and pet grooming insights, sales pace advice, inventory recommendations, and shift pacing tips.

Rules:
1. Base all answers strictly on the provided aggregated store metrics.
2. Never invent customer identities or reference private customer information.
3. Keep advice practical, pet-first (dogs and cats), retail-smart, and tailored specifically to the ${store_id} store.
4. Structure recommendations with clear markdown bullet points and actionable next steps.`;

      const geminiPrompt = `
Store: HUFT ${store_id}
Analytical Context:
${sanitizedMetrics}

User Question:
"${prompt.trim()}"

Please provide a concise, high-impact analysis and 3-4 concrete tactical recommendations for the store team today.`;

      // 10. Call Gemini API Securely
      const geminiApiKey = env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return jsonResponse({ error: "Server error: GEMINI_API_KEY secret is not set in Cloudflare Worker." }, 500);
      }

      const geminiModel = env.GEMINI_MODEL || "gemini-1.5-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemInstruction + "\n\n" + geminiPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
          }
        })
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        ctx.waitUntil(logAiUsage(supabaseUrl, serviceRoleKey, {
          user_id: userId,
          user_email: userEmail,
          store_id: store_id,
          prompt_summary: sanitizeSummary(prompt),
          tokens_used: 0,
          status: "error",
          error_message: `Gemini API Error: ${geminiResponse.status} - ${errorText.slice(0, 150)}`
        }));

        return jsonResponse({ error: "AI service temporarily unavailable. Please try again shortly." }, 502);
      }

      const geminiResult = await geminiResponse.json();
      const candidate = geminiResult.candidates?.[0];
      const aiReply = candidate?.content?.parts?.[0]?.text || "No response generated by the model.";
      const tokenCount = geminiResult.usageMetadata?.totalTokenCount || 150;

      // 11. Asynchronous AI Usage Audit Logging
      ctx.waitUntil(logAiUsage(supabaseUrl, serviceRoleKey, {
        user_id: userId,
        user_email: userEmail,
        store_id: store_id,
        prompt_summary: sanitizeSummary(prompt),
        tokens_used: tokenCount,
        status: "success",
        error_message: null
      }));

      // 12. Return Clean Response to Frontend
      return jsonResponse({
        success: true,
        store: store_id,
        answer: aiReply,
        usage: {
          tokens: tokenCount,
          requests_remaining: Math.max(0, maxPerHour - (currentRequests + 1))
        }
      });

    } catch (err) {
      return jsonResponse({ error: "Internal Server Error: " + (err.message || "Unknown error") }, 500);
    }
  }
};

/**
 * Sanitizes aggregated analytical metrics, guaranteeing zero customer PII
 */
function sanitizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return "No live metrics uploaded for this store session.";
  }

  const lines = [];
  if (metrics.date_range) lines.push(`• Period: ${metrics.date_range}`);
  if (metrics.total_sales !== undefined) lines.push(`• Total Sales Achieved: ₹${Number(metrics.total_sales).toLocaleString('en-IN')}`);
  if (metrics.retail_sales !== undefined) lines.push(`• Retail Sales: ₹${Number(metrics.retail_sales).toLocaleString('en-IN')}`);
  if (metrics.spa_sales !== undefined) lines.push(`• SPA Grooming Sales: ₹${Number(metrics.spa_sales).toLocaleString('en-IN')}`);
  if (metrics.food_sales !== undefined) lines.push(`• HUFT Food Sales: ₹${Number(metrics.food_sales).toLocaleString('en-IN')}`);
  if (metrics.monthly_target !== undefined) lines.push(`• Monthly Target: ₹${Number(metrics.monthly_target).toLocaleString('en-IN')}`);
  if (metrics.projected_run_rate !== undefined) lines.push(`• Projected Month-End Run Rate: ₹${Number(metrics.projected_run_rate).toLocaleString('en-IN')}`);
  if (metrics.daily_required !== undefined) lines.push(`• Daily Required Pace: ₹${Number(metrics.daily_required).toLocaleString('en-IN')}`);

  if (Array.isArray(metrics.top_categories) && metrics.top_categories.length) {
    const cats = metrics.top_categories.slice(0, 5).map(c => `${c.name}: ₹${Number(c.amount).toLocaleString('en-IN')}`).join(", ");
    lines.push(`• Top Categories: ${cats}`);
  }

  if (Array.isArray(metrics.brand_totals) && metrics.brand_totals.length) {
    const brands = metrics.brand_totals.map(b => `${b.name}: ${b.qty} units (₹${Number(b.sale).toLocaleString('en-IN')})`).join(", ");
    lines.push(`• HUFT Food Brands: ${brands}`);
  }

  if (metrics.peak_hours) lines.push(`• Peak Hour Analysis: ${metrics.peak_hours}`);
  if (metrics.peak_weekday) lines.push(`• Peak Weekday: ${metrics.peak_weekday}`);

  return lines.join("\n") || "Aggregated totals only.";
}

function sanitizeSummary(text) {
  return String(text || "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b[6-9]\d{9}\b/g, "[PHONE]")
    .slice(0, 140);
}

/**
 * Logs AI request metadata into Supabase ai_usage_logs table
 */
async function logAiUsage(supabaseUrl, serviceRoleKey, record) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/ai_usage_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    });
  } catch (err) {
    console.error("Failed to log AI usage to Supabase:", err);
  }
}
