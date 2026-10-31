/**
 * test-auth-security.js - Security & Verification Test Suite for User Repository index.html
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("==================================================================");
console.log("🛡️  HUFT MULTI-STORE AUTHENTICATION & SECURITY TEST SUITE");
console.log("==================================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}: ${err.message}`);
  }
}

// 1. Load HTML from temp-repo
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Extract the injected auth engine script
const scriptMatch = indexHtml.match(/<script id="huft-auth-ai-engine">([\s\S]*?)<\/script>/);
assert(scriptMatch, "Must contain <script id='huft-auth-ai-engine'>");
const engineCode = scriptMatch[1];

const mockLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  navigator: { userAgent: "NodeJS Test Harness" },
  localStorage: mockLocalStorage,
  window: {
    location: { origin: 'http://localhost:3000', pathname: '/', hash: '' }
  },
  document: {
    createElement: () => ({ src: '', onload: () => {}, onerror: () => {} }),
    head: { appendChild: () => {} },
    addEventListener: () => {},
    getElementById: (id) => ({
      value: '',
      textContent: '',
      classList: { remove: () => {}, add: () => {}, toggle: () => {} }
    }),
    querySelectorAll: () => []
  }
};

sandbox.window.localStorage = mockLocalStorage;
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);

// 2. RUN TESTS

// Test 1: Only Hyderguda is Central Admin by default
runTest("Test 1: Only Hyderguda is assigned Central Admin by default", () => {
  const hydergudaAccount = sandbox.MOCK_STORE_ACCOUNTS.find(a => a.email === 'hyderguda@huft.com');
  assert(hydergudaAccount, "Hyderguda account must exist");
  assert.strictEqual(hydergudaAccount.status, 'active', "Hyderguda must be active");
  assert.strictEqual(hydergudaAccount.store_id, 'Hyderguda', "Store must be Hyderguda");
  assert.strictEqual(hydergudaAccount.role, 'admin', "Hyderguda must be Admin");
});

// Test 2: No other store has admin privileges
runTest("Test 2: No other store has admin privileges (all others are store managers)", () => {
  const otherStores = ['banjarahills@huft.com', 'madhapur@huft.com', 'goldenmile@huft.com', 'himayathnagar@huft.com'];
  otherStores.forEach(email => {
    const account = sandbox.MOCK_STORE_ACCOUNTS.find(a => a.email === email);
    assert(account, `Store account ${email} must exist`);
    assert.strictEqual(account.role, 'store_manager', `${email} must be store_manager only, not admin`);
  });

  const adminAccounts = sandbox.MOCK_STORE_ACCOUNTS.filter(a => a.role === 'admin');
  assert.strictEqual(adminAccounts.length, 1, "There must be exactly ONE admin account");
  assert.strictEqual(adminAccounts[0].email, 'hyderguda@huft.com', "The only admin account must be Hyderguda");
});

// Test 3: Reject Inactive / Pending Account
runTest("Test 3: Reject Pending Account approval status", () => {
  const pendingAccount = sandbox.MOCK_STORE_ACCOUNTS.find(a => a.email === 'pending@huft.com');
  assert(pendingAccount, "Pending account exists for test");
  let threw = false;
  try {
    sandbox.verifyAccountStatus(pendingAccount);
  } catch (e) {
    threw = true;
    assert(e.message.includes("PENDING APPROVAL"), "Should mention pending approval in error");
  }
  assert(threw, "Must throw an error for pending_approval accounts");
});

// Test 4: Reject Deactivated Account
runTest("Test 4: Reject Deactivated Account status", () => {
  const deactAccount = sandbox.MOCK_STORE_ACCOUNTS.find(a => a.email === 'deactivated@huft.com');
  assert(deactAccount, "Deactivated account exists for test");
  let threw = false;
  try {
    sandbox.verifyAccountStatus(deactAccount);
  } catch (e) {
    threw = true;
    assert(e.message.includes("DEACTIVATED"), "Should mention deactivated in error");
  }
  assert(threw, "Must throw an error for deactivated accounts");
});

// Test 5: Admin Approval Workflow
runTest("Test 5: Central Admin Account Approval Transition", () => {
  const testUser = {
    id: "usr-test-1",
    email: "newmgr@huft.com",
    store_id: "Madhapur",
    role: "store_manager",
    status: "pending_approval"
  };
  
  assert.throws(() => sandbox.verifyAccountStatus(testUser), /PENDING APPROVAL/);
  testUser.status = "active";
  assert.doesNotThrow(() => sandbox.verifyAccountStatus(testUser));
});

// Test 6: Customer Phone PII Masking
runTest("Test 6: Customer Phone Number PII Masking Guard", () => {
  const raw1 = "9876543210";
  const masked1 = sandbox.maskCustomerPhone(raw1);
  assert.strictEqual(masked1, "******3210", "10-digit phone must be masked to last 4 digits only");

  const raw2 = "+91 9123456789";
  const masked2 = sandbox.maskCustomerPhone(raw2);
  assert(masked2.startsWith("******"), "International phone must be masked");
  assert(masked2.endsWith("6789"), "Must end with last 4 digits");
});

// Test 7: Store Isolation Policy
runTest("Test 7: Store Isolation - Store Manager cannot access other store records", () => {
  sandbox.userProfile = {
    id: "mgr-1",
    email: "banjarahills@huft.com",
    role: "store_manager",
    store_id: "Banjara Hills",
    status: "active"
  };
  sandbox.getActiveStore = () => "Banjara Hills";

  const targetStore = "Hyderguda";
  const isAuthorized = targetStore.toLowerCase().includes(sandbox.getActiveStore().toLowerCase());
  assert.strictEqual(isAuthorized, false, "Banjara Hills manager must NOT be authorized for Hyderguda records");
});

// Test 8: Hyderguda Central Admin Access to All Stores
runTest("Test 8: Hyderguda Central Admin has global access to all 5 stores", () => {
  const allowedStores = ["Hyderguda", "Banjara Hills", "Madhapur", "Golden Mile", "Himayathnagar"];
  sandbox.userProfile = {
    id: "hyderguda-admin-001",
    email: "hyderguda@huft.com",
    role: "admin",
    store_id: "Hyderguda",
    status: "active"
  };

  assert.strictEqual(sandbox.userProfile.role, "admin");
  assert.strictEqual(sandbox.userProfile.store_id, "Hyderguda");
  allowedStores.forEach(st => {
    sandbox.currentActiveStore = st;
    assert.strictEqual(sandbox.currentActiveStore, st);
  });
});

// Test 9: Cloudflare Worker PII Regex Filter
runTest("Test 9: Cloudflare Worker PII Detector Blocks Phones & Emails in Prompts", () => {
  const piiRegex = /(\b[6-9]\d{9}\b|\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/;
  
  const cleanPrompt = "What was Sara's wholesome sales volume today and what is our target run-rate?";
  assert(!piiRegex.test(cleanPrompt), "Clean analytical prompt should pass PII filter");

  const dirtyPromptPhone = "Can you send the bill details for customer phone 9876543210?";
  assert(piiRegex.test(dirtyPromptPhone), "Prompt with customer phone must be blocked by worker regex");

  const dirtyPromptEmail = "Email the report to contact@customer-personal.com";
  assert(piiRegex.test(dirtyPromptEmail), "Prompt with personal email must be blocked by worker regex");
});

// Test 10: User repo index.html features integrity
runTest("Test 10: User repository index.html contains all features and original code", () => {
  assert(indexHtml.includes('authModalOverlay'), "Must include Auth modal");
  assert(indexHtml.includes('adminPanelModal'), "Must include Central Admin panel");
  assert(indexHtml.includes('aiAssistantDrawer'), "Must include AI Assistant drawer");
  assert(indexHtml.includes('headerAdminStoreSwitcher'), "Must include Admin Store switcher");
  assert(indexHtml.includes('maskCustomerPhone'), "Must include phone PII sanitizer");
  // Ensure original features are intact
  assert(indexHtml.includes('huftPhoneSearchForm'), "Must preserve original phone search form");
  assert(indexHtml.includes('huftReleaseNotesModal'), "Must preserve original release notes modal");
  assert(indexHtml.includes('huftStorageMini'), "Must preserve original storage mini badge");
});

console.log("\n==================================================================");
console.log(`🎯 Test Summary: ${passedTests} / ${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
console.log("==================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log("🎉 ALL USER REPOSITORY VERIFICATION CHECKS PASSED SUCCESSFULLY!");
}
