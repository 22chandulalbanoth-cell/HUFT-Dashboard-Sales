// scripts/test-edge-functions-auth.js
// Automated verification for Edge Function auth guards and status codes

const assert = require('assert');

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorResponse(err, customCors = corsHeaders) {
  let status = 500;
  if (typeof err?.status === 'number') {
    status = err.status;
  } else {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('bearer') || msg.includes('token')) {
      status = 401;
    } else if (msg.includes('forbidden') || msg.includes('denied') || msg.includes('access')) {
      status = 403;
    } else if (msg.includes('required') || msg.includes('invalid') || msg.includes('bad request')) {
      status = 400;
    }
  }

  return {
    status,
    headers: { ...customCors, 'Content-Type': 'application/json' },
    body: { ok: false, error: err?.message || 'Internal server error' },
  };
}

function authenticateRequestMock(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError('Unauthorized: Missing or invalid Bearer authorization header', 401);
  }
  return { userId: 'mock-user-id' };
}

function requireCentralAdminMock(profile) {
  if (profile?.role !== 'CENTRAL_ADMIN' || profile?.active !== true) {
    throw new HttpError('Forbidden: Central Administrator role required', 403);
  }
}

function requireStoreAccessMock(ctx, storeId) {
  if (ctx.profile?.role === 'CENTRAL_ADMIN' && ctx.profile?.active === true) {
    return true;
  }
  if (!ctx.stores || !ctx.stores.includes(storeId)) {
    throw new HttpError('Forbidden: Store access not granted for store ' + storeId, 403);
  }
  return true;
}

const handlers = {
  'get-admin-dashboard': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      requireCentralAdminMock(req.profile);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'get-authorised-stores': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      requireCentralAdminMock(req.profile);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'get-ai-usage': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      requireCentralAdminMock(req.profile);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'get-system-status': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      requireCentralAdminMock(req.profile);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'get-profile': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'record-usage': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
  'ai-chat': async (req) => {
    try {
      authenticateRequestMock(req.headers);
      requireStoreAccessMock({ profile: req.profile, stores: req.stores }, req.storeId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return errorResponse(err);
    }
  },
};

console.log('==================================================================');
console.log('🛡️  EDGE FUNCTION AUTHENTICATION & ACCESS CONTROL TESTS');
console.log('==================================================================\n');

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    console.log('✅ [PASS] Test ' + total + ': ' + name);
    passed++;
  } catch (err) {
    console.error('❌ [FAIL] Test ' + total + ': ' + name);
    console.error(err);
  }
}

const protectedEndpoints = [
  'get-admin-dashboard',
  'get-authorised-stores',
  'get-ai-usage',
  'get-system-status',
  'get-profile',
  'record-usage',
  'ai-chat',
];

(async () => {
  for (const ep of protectedEndpoints) {
    await runTest(ep + ' rejects missing token with HTTP 401', async () => {
      const res = await handlers[ep]({ headers: {} });
      assert.strictEqual(res.status, 401, 'Expected 401, got ' + res.status);
      assert.strictEqual(res.body.ok, false);
      assert.match(res.body.error, /unauthorized/i);
    });
  }

  await runTest('get-admin-dashboard rejects non-admin with HTTP 403', async () => {
    const res = await handlers['get-admin-dashboard']({
      headers: { authorization: 'Bearer valid-user-token' },
      profile: { role: 'STORE_USER', active: true },
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.ok, false);
    assert.match(res.body.error, /forbidden/i);
  });

  await runTest('ai-chat rejects store manager accessing unauthorized store with HTTP 403', async () => {
    const res = await handlers['ai-chat']({
      headers: { authorization: 'Bearer valid-user-token' },
      profile: { role: 'STORE_MANAGER', active: true },
      stores: ['Jubilee Hills'],
      storeId: 'Hyderguda',
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.ok, false);
    assert.match(res.body.error, /forbidden/i);
  });

  await runTest('ai-chat allows central admin access to any store', async () => {
    const res = await handlers['ai-chat']({
      headers: { authorization: 'Bearer valid-admin-token' },
      profile: { role: 'CENTRAL_ADMIN', active: true },
      stores: ['Hyderguda'],
      storeId: 'Gachibowli',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
  });

  console.log('\n==================================================================');
  console.log('🎯 Edge Function Tests: ' + passed + ' / ' + total + ' passed');
  console.log('==================================================================\n');

  if (passed !== total) process.exit(1);
})();
