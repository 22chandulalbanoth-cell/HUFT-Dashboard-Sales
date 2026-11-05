/**
 * HUFT Sales Dashboard - Sentry Error Monitoring & Performance Tracking
 * 
 * Strict Data Privacy & Compliance:
 * - NEVER captures passwords, auth tokens, session keys.
 * - NEVER captures customer PII (phone numbers, addresses, names, personal emails).
 * - NEVER captures financial, invoice, or sales figures.
 * - Auto-redacts sensitive keywords from payloads, URLs, and breadcrumbs.
 */
(function() {
  'use strict';

  // Comprehensive substring regex for sensitive keys
  const SENSITIVE_KEY_REGEX = /(password|passwd|pin|token|access_?token|refresh_?token|apiKey|anon_?key|service_?role|secret|auth|bearer|sales|retail|spa|invoice|bill|amount|target|achievement|revenue|turnover|customer|phone|mobile|card|cvv)/i;
  
  // Value patterns to scrub
  const SENSITIVE_VALUE_REGEX = /(Bearer\s+[A-Za-z0-9\-._~+/]+=*|sb_publishable_[A-Za-z0-9_\-]+|eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:password|passwd|secret|pin)\s*[:= ]\s*\S+)/gi;

  function deepScrub(obj, depth = 0) {
    if (!obj || depth > 8) return obj;
    if (typeof obj === 'string') {
      return obj.replace(SENSITIVE_VALUE_REGEX, '[REDACTED]');
    }
    if (Array.isArray(obj)) {
      return obj.map(item => deepScrub(item, depth + 1));
    }
    if (typeof obj === 'object') {
      const scrubbed = {};
      for (const [key, val] of Object.entries(obj)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
          scrubbed[key] = '[REDACTED]';
        } else {
          scrubbed[key] = deepScrub(val, depth + 1);
        }
      }
      return scrubbed;
    }
    return obj;
  }

  function sanitizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      const url = new URL(rawUrl, window.location.origin);
      // Strip sensitive query parameters
      ['token', 'access_token', 'refresh_token', 'password', 'key', 'apikey'].forEach(p => {
        if (url.searchParams.has(p)) url.searchParams.set(p, '[REDACTED]');
      });
      // Strip fragment hash if it looks like an OAuth callback
      if (url.hash && (url.hash.includes('access_token') || url.hash.includes('refresh_token'))) {
        url.hash = '#[REDACTED_AUTH_FRAGMENT]';
      }
      return url.toString();
    } catch (_) {
      return rawUrl.split('?')[0]; // fallback: remove all query params if invalid URL
    }
  }

  // Safe Fallback Interface in case Sentry is not loaded or blocked by ad-blockers
  window.HUFT_SENTRY = {
    initialized: false,
    captureException: function(err, context) {
      if (window.Sentry && window.HUFT_SENTRY.initialized) {
        try {
          window.Sentry.captureException(err, { extra: deepScrub(context || {}) });
        } catch (_) {}
      } else {
        console.warn('[HUFT Sentry Fallback] Handled Exception:', err?.message || err);
      }
    },
    captureMessage: function(msg, level = 'info', context) {
      if (window.Sentry && window.HUFT_SENTRY.initialized) {
        try {
          window.Sentry.captureMessage(String(msg), { level, extra: deepScrub(context || {}) });
        } catch (_) {}
      } else {
        console.log(`[HUFT Sentry Fallback][${level}]`, msg);
      }
    },
    captureApiError: function(endpoint, status, statusText, details) {
      const scrubbedUrl = sanitizeUrl(endpoint);
      const err = new Error(`API Error [${status}]: ${statusText || 'Request Failed'} at ${scrubbedUrl}`);
      this.captureException(err, {
        status,
        statusText,
        endpoint: scrubbedUrl,
        details: deepScrub(details || {})
      });
    },
    testIntegration: function() {
      console.log('[HUFT Sentry] Running Integration Self-Test...');
      const samplePayload = {
        test: 'ok',
        password: 'PlainSecretPassword123!',
        access_token: 'sb_publishable_test_token_12345',
        sales_figures: {
          retail_sales: 540000,
          spa_sales: 120000,
          invoice_no: 'INV-2026-999',
          invoice_amount: 15400
        },
        user_metadata: {
          customer_phone: '+91 9999999999',
          customer_name: 'Test Customer'
        }
      };
      const cleaned = deepScrub(samplePayload);
      console.log('[HUFT Sentry] Scrubbing Verification Result:', cleaned);
      const isScrubbed = cleaned.password === '[REDACTED]' &&
                        cleaned.access_token === '[REDACTED]' &&
                        cleaned.sales_figures === '[REDACTED]' &&
                        cleaned.user_metadata.customer_phone === '[REDACTED]' &&
                        cleaned.user_metadata.customer_name === '[REDACTED]';
      console.log('[HUFT Sentry] Privacy Protection Status:', isScrubbed ? 'PASSED ✅' : 'FAILED ❌');
      return { success: isScrubbed, cleanedPayload: cleaned };
    }
  };

  // Determine current page name
  function getPageName() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('dashboard')) return 'store_dashboard';
    if (path.includes('admin')) return 'admin_console';
    if (path.includes('reset-password')) return 'reset_password';
    return 'store_login';
  }

  // Determine environment
  function getEnvironment() {
    const host = window.location.hostname.toLowerCase();
    if (host === 'huft-sales-dashboard.pages.dev') return 'production';
    if (host.includes('localhost') || host === '127.0.0.1') return 'development';
    return 'staging';
  }

  // Initialize Sentry SDK if present
  function initSentry() {
    if (typeof window.Sentry === 'undefined') {
      console.info('[HUFT Sentry] Sentry CDN SDK not loaded. Standalone mode active.');
      return;
    }

    const config = window.HUFT_CONFIG || {};
    const dsn = config.sentryDsn || '';

    if (!dsn || dsn.includes('YOUR_SENTRY_DSN')) {
      console.info('[HUFT Sentry] Sentry SDK ready. Awaiting DSN configuration in app-config.js.');
      return;
    }

    try {
      const integrations = [];
      if (typeof window.Sentry.browserTracingIntegration === 'function') {
        integrations.push(window.Sentry.browserTracingIntegration());
      }

      window.Sentry.init({
        dsn: dsn,
        environment: getEnvironment(),
        release: 'huft-sales-dashboard@' + (config.appVersion || '2.0.0'),
        integrations: integrations,
        tracesSampleRate: getEnvironment() === 'production' ? 0.2 : 1.0,
        tracePropagationTargets: [
          'localhost',
          'huft-sales-dashboard.pages.dev',
          /wyqksfncdlwjduyispmb\.supabase\.co/
        ],
        sendDefaultPii: false, // Strict zero-PII default

        // Privacy Filter 1: beforeSend
        beforeSend: function(event, hint) {
          // Scrub exception messages from accidental sensitive exposure
          if (event.exception && event.exception.values) {
            event.exception.values.forEach(v => {
              if (v.value) {
                v.value = v.value.replace(SENSITIVE_VALUE_REGEX, '[REDACTED]');
              }
            });
          }

          // Scrub request headers and URLs
          if (event.request) {
            if (event.request.url) event.request.url = sanitizeUrl(event.request.url);
            if (event.request.headers) {
              for (const header in event.request.headers) {
                if (/auth|cookie|token|key/i.test(header)) {
                  event.request.headers[header] = '[REDACTED]';
                }
              }
            }
            if (event.request.data) {
              event.request.data = deepScrub(event.request.data);
            }
          }

          // Scrub extra contexts and breadcrumbs
          if (event.extra) {
            event.extra = deepScrub(event.extra);
          }
          if (event.contexts) {
            event.contexts = deepScrub(event.contexts);
          }
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map(b => {
              if (b.data) b.data = deepScrub(b.data);
              if (b.message) b.message = b.message.replace(SENSITIVE_VALUE_REGEX, '[REDACTED]');
              return b;
            });
          }

          return event;
        },

        // Privacy Filter 2: beforeBreadcrumb
        beforeBreadcrumb: function(breadcrumb, hint) {
          // Drop UI interaction breadcrumbs on sensitive input fields (password, mobile, sales)
          if (breadcrumb.category && breadcrumb.category.startsWith('ui.')) {
            const target = hint?.event?.target;
            if (target && target.tagName === 'INPUT') {
              const inputType = (target.type || '').toLowerCase();
              const inputId = (target.id || '').toLowerCase();
              const inputName = (target.name || '').toLowerCase();
              if (inputType === 'password' || SENSITIVE_KEY_REGEX.test(inputId + ' ' + inputName)) {
                return null; // drop breadcrumb completely
              }
            }
          }

          // Scrub HTTP Fetch / XHR breadcrumbs
          if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
            if (breadcrumb.data && breadcrumb.data.url) {
              breadcrumb.data.url = sanitizeUrl(breadcrumb.data.url);
              // If auth endpoint, wipe body data
              if (/\/auth\/v1\/(token|signup|recover)/i.test(breadcrumb.data.url)) {
                delete breadcrumb.data.request_body;
                delete breadcrumb.data.response_body;
              }
            }
          }

          // Deep scrub any other breadcrumb data
          if (breadcrumb.data) {
            breadcrumb.data = deepScrub(breadcrumb.data);
          }

          return breadcrumb;
        }
      });

      // Set global tags for context
      window.Sentry.setTag('page_name', getPageName());
      window.Sentry.setTag('app_name', 'huft-sales-dashboard');
      window.HUFT_SENTRY.initialized = true;
      console.log(`[HUFT Sentry] Initialized successfully for ${getPageName()} (${getEnvironment()}).`);
    } catch (initErr) {
      console.warn('[HUFT Sentry] Initialization warning:', initErr.message);
    }
  }

  // Intercept global Fetch to monitor failed API requests safely
  function instrumentFetch() {
    if (typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      let url = '';
      try {
        url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      } catch (_) {}

      try {
        const response = await originalFetch.apply(this, args);
        // Track HTTP 4xx / 5xx API errors
        if (!response.ok && response.status >= 400) {
          try {
            const clone = response.clone();
            clone.text().then(text => {
              let parsed = null;
              try { parsed = JSON.parse(text); } catch (_) { parsed = text.slice(0, 200); }
              window.HUFT_SENTRY.captureApiError(url, response.status, response.statusText, parsed);
            }).catch(() => {
              window.HUFT_SENTRY.captureApiError(url, response.status, response.statusText, null);
            });
          } catch (_) {
            window.HUFT_SENTRY.captureApiError(url, response.status, response.statusText, null);
          }
        }
        return response;
      } catch (networkError) {
        window.HUFT_SENTRY.captureException(networkError, {
          type: 'NetworkFailure',
          url: sanitizeUrl(url)
        });
        throw networkError;
      }
    };
  }

  // Execute
  instrumentFetch();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSentry);
  } else {
    initSentry();
  }
})();
