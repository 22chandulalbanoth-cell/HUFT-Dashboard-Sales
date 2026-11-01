# HUFT Dashboard – Full Bug Report and Fix Guide

Repo: `HUFT-Dashboard-Sales-main`
Files reviewed: index.html (≈1.7 MB), admin.html, 18 Supabase edge functions, `_shared/auth.ts`, `_shared/cors.ts`, Cloudflare worker, SQL schemas, test suite, deploy workflow.

Status key: **FIXED** = already changed in `HUFT-Dashboard-Sales-fixed.zip` · **PARTIAL** = started, finish with the fix below · **OPEN** = not yet changed.
Line numbers are approximate and shift after edits; search for the quoted text instead.

---

## Summary

| Severity | Count | Fixed | Partial | Open |
|---|---|---|---|---|
| Critical (security) | 8 | 5 | 2 | 1 |
| High (security / architecture) | 6 | 0 | 1 | 5 |
| Medium (data contract, CI, tests) | 8 | 2 | 0 | 6 |
| Low (hygiene, docs) | 4 | 0 | 0 | 4 |

---

## A. Critical – Authentication and secrets

### A1. Master password printed on admin login page — FIXED
- **Where:** admin.html, login form.
- **Problem:** the password field was pre-filled with `[REDACTED_CREDENTIAL]`, placeholder showed it, and the page printed "Master Password: [REDACTED_CREDENTIAL]".
- **Fix applied:** value and placeholder removed; the printed line replaced with "Authorized personnel only."

### A2. Admin login accepts empty password and a hardcoded list — FIXED (fail-closed)
- **Where:** admin.html `handleAdminLogin`.
- **Problem:** accepted `""`, `[REDACTED_CREDENTIAL]`, `chandu@123`, `[REDACTED_CREDENTIAL]!`. Email allowed any address containing `22chandulal`. Error message revealed the password. Session saved to localStorage, so anyone could forge it.
- **Fix applied:** password check set to `false`, error text no longer reveals the password.
- **Still needed (OPEN in B-section, see B1):** real Supabase login.

### A3. Admin bypass in index.html (any 6+ char password) — FIXED
- **Where:** index.html, sign-in handler: `const isValidAdminPassword = password === "[REDACTED_CREDENTIAL]" || password === "[REDACTED_CREDENTIAL]" || password.length >= 6;`
- **Fix applied:** set to `false`. **Remaining step:** delete the whole "1. Check Central Admin (instant unlock)" block (see B1).

### A4. Default password fallback to `[REDACTED_CREDENTIAL]` — FIXED
- **Where:** index.html `signInUser`: `password: password || "[REDACTED_CREDENTIAL]"`.
- **Fix applied:** now `password: password`. Empty passwords now fail at Supabase.

### A5. Quick-demo login autofills the default password — FIXED
- **Where:** index.html `quickDemoLogin`: `pwdInput.value = "[REDACTED_CREDENTIAL]";`
- **Fix applied:** now empty.
- **Recommended:** delete `quickDemoLogin` and every button that calls it in production builds.

### A6. Portal password pre-filled with `[REDACTED_CREDENTIAL]` — FIXED
- **Where:** index.html portal login: `id="portalPassword" value="[REDACTED_CREDENTIAL]"`.
- **Fix applied:** value emptied.

### A7. Plaintext password in seeded localStorage account — PARTIAL
- **Where:** index.html, seed block `huft_store_accounts`, `password: "[REDACTED_CREDENTIAL]"`.
- **Fix applied:** password field removed from the seed.
- **Side effect fixed:** the local sign-in check was changed to fail closed (see A8), so the seeded admin can't log in via this path.
- **Finish:** delete all `huft_store_accounts` seeding; read accounts from Supabase only. Clear existing browsers with a one-time migration: `localStorage.removeItem("huft_store_accounts")`.

### A8. Local account sign-in skipped password check when none stored — FIXED
- **Where:** index.html, `if (matchedAccount.password && password && matchedAccount.password !== password)`.
- **Problem:** accounts without a stored password, or an empty password, logged in with only an email.
- **Fix applied:** `if (!password || !matchedAccount.password || matchedAccount.password !== password)`.

### A9. Admin role granted by email substring — PARTIAL
- **Where:** index.html, `signInUser` and a second copy in the same file:
  ```js
  const isAdminEmail = cleanEmail.includes("hyderguda") ||
                       cleanEmail.includes("chandu") ||
                       cleanEmail.includes("admin") || ...
  ```
  and the fallback `if (!profile && isAdminEmail) { profile = { role: "admin", ... } }`.
- **Problem:** anyone whose email contains "hyderguda", "chandu" or "admin" becomes admin when no profile is found.
- **Fix applied:** `cleanEmail.includes("admin")` replaced with `false`.
- **Finish:** delete `isAdminEmail` entirely and the fallback profile block. Role must come from `profiles.role` returned by the server:
  ```js
  let profile = await fetchUserProfile(data.user.id);
  if (!profile || profile.active !== true) {
    await supabaseClient.auth.signOut();
    throw new Error("Your account is pending approval or inactive.");
  }
  // role comes only from the database
  ```

### A10. Approved-user override stored in localStorage — OPEN
- **Where:** index.html, `huft_approved_emails` read in `signInUser`; `isApprovedOverride` turns `pending` into `active`.
- **Problem:** any user can add their email to localStorage and bypass approval.
- **Fix:** delete the `huft_approved_emails` read/write. Approval state comes only from `profiles.active` / `registration_requests.status` on the server.

---

## B. High – Architecture and authorization

### B1. admin.html is a mock dashboard with client-side login — OPEN (largest gap)
- **Where:** admin.html, whole file: mock arrays (`accounts`, `logs`, `devices`, `audit`, settings), `sessionStorage`/`localStorage` admin session, Supabase client created but barely used. The Supabase URL and publishable key are hardcoded (acceptable for the publishable key, but the login must still be server-verified).
- **Fix:**
  ```js
  async function handleAdminLogin(e) {
    e?.preventDefault();
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    if (!email || !password) return showLoginError("Enter email and password.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return showLoginError("Invalid credentials.");
    const { data: profile, error: pErr } = await supabase.functions.invoke("get-profile");
    if (pErr || profile?.role !== "CENTRAL_ADMIN" || profile?.active !== true) {
      await supabase.auth.signOut();
      return showLoginError("This account is not authorized for Central Control.");
    }
    showAdminApp(profile);
    loadAdminData();          // calls get-admin-dashboard with the session token
  }
  ```
  Then delete `sessionStorage`/`localStorage` admin session code and all mock arrays. Replace each panel with a call to the matching edge function: `get-admin-dashboard`, `get-ai-usage`, `get-system-status`, `approve-registration`, `reject-registration`, `approve-password-reset`.

### B3. Edge-function CORS allows any origin — OPEN
- **Where:** `supabase/functions/_shared/cors.ts`: `'Access-Control-Allow-Origin': '*'`.
- **Fix:**
  ```ts
  const ALLOWED = ['https://22chandulalbanoth-cell.github.io'];
  export function corsFor(req: Request) {
    const origin = req.headers.get('Origin') || '';
    return {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Vary': 'Origin',
    };
  }
  ```
  Update the callers (`corsHeaders` / `handleCors`) to use `corsFor(req)`.

### B4. Cloudflare worker falls back to `*` CORS — OPEN
- **Where:** cloudflare-worker/worker.js line ~24: `"Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*"`.
- **Fix:** `"Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0]` and make sure `allowedOrigins` is never empty (throw at startup if it is).

### B5. AI worker accepts requests without a verified session — PARTIAL
- **Where:** worker.js fetches `/auth/v1/user` (good) but also builds prompts from client data.
- **Fix:** keep the Supabase token check, and reject requests where `Authorization` is missing or the user's `active` is false. Limit prompt size (e.g. 4 KB) and rate-limit per user.

### B6. Service and anon keys referenced in client files — OPEN (verify)
- **Where:** Supabase URL and publishable key are in index.html and admin.html; `SUPABASE_SERVICE_ROLE_KEY` is referenced only in server code (correct).
- **Fix:** keep only the publishable (anon) key in the client. Add a CI check (already added in `scripts/check-inline-js.js` for `service_role`). Rotate the key if any service key was ever committed to git history: `git log -p | grep -i service_role`.

---

## C. Medium – Data contract, CI and tests

### C1. Client role and status names don't match the database — OPEN
- **Client uses:** `admin`, `store_manager`, `store_user`, status `pending`, `pending_approval`, `deactivated`, `rejected`.
- **Database uses:** `profiles.role` = `CENTRAL_ADMIN` / `STORE_MANAGER` / `STORE_USER`; `profiles.active` boolean; `registration_requests.status` = `PENDING` / `APPROVED` / `REJECTED`.
- **Fix:** add one mapping module and use it everywhere:
  ```js
  export const ROLE = { CENTRAL_ADMIN: "CENTRAL_ADMIN", STORE_MANAGER: "STORE_MANAGER", STORE_USER: "STORE_USER" };
  export const REG = { PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" };
  export const isActive = (p) => p?.active === true;
  ```
  Replace `status === "pending"`, `"pending_approval"`, `"deactivated"` checks. `verifyAccountStatus(profile)` becomes `if (!profile.active) throw new Error("ACCOUNT PENDING OR DEACTIVATED: ...")`.

### C2. Two conflicting database schemas — OPEN
- **Where:** `supabase/schema.sql` + `supabase/migrations/20261101_initial_backend_schema.sql` vs `supabase_central_control_schema.sql` (different columns, enum type `user_role_type`, different `registration_requests`).
- **Fix:** keep `supabase/migrations/` as the only source. Port any missing columns or policies from `supabase_central_control_schema.sql` into a new numbered migration, then delete the file. Verify with `supabase db reset` on a staging project.

### C3. RLS not confirmed on all tables — OPEN
- **Fix:** add a migration that runs, for each table in `public`:
  ```sql
  ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
  ```
  and a CI query that lists tables with RLS disabled (`pg_tables where rowsecurity = false` must be empty for `public`).

### C4. Test suite exited 0 on failure — FIXED
- **Fix applied:** `process.exit(1)` when any test fails.

### C5. Deploy "syntax check" never checked JavaScript — FIXED
- **Fix applied:** `scripts/check-inline-js.js` compiles all inline scripts, checks the engine marker, and scans for forbidden secrets. Workflow updated.

### C6. Secret guard only checked index.html — FIXED
- **Fix applied:** guard runs on `index.html` and `admin.html`.

### C7. Test suite fails 4 of 10 — OPEN
- **Where:** tests 1–4 expect accounts `hyderguda@example.test`, `banjarahills@example.test`, `pending@example.test`, `deactivated@example.test` in `MOCK_STORE_ACCOUNTS`; the app's seed contains only the admin account.
- **Fix:** create `scripts/fixtures/accounts.js` with these four accounts and load it in the test instead of the app seed. Add the same accounts to the test environment's seed SQL, not to production.

### C8. Tests 7 and 8 are tautological — OPEN
- **Where:** tests 7 and 8 compute a value from local variables and assert on it, so they can never fail.
- **Fix:** call the app's real function, for example `sandbox.getActiveStore`, `sandbox.canAccessStore(profile, store)`. If no such function exists, create it in the engine and test it.
  ```js
  assert.strictEqual(sandbox.canAccessStore({ role: "STORE_MANAGER", store_id: "Banjara Hills" }, "Hyderguda"), false);
  assert.strictEqual(sandbox.canAccessStore({ role: "CENTRAL_ADMIN", store_id: "Hyderguda" }, "Madhapur"), true);
  ```

---

## D. Low – Hygiene and documentation

### D1. Three duplicate dashboard copies (1.4–1.7 MB each) — OPEN
- **Files:** `index.html`, `HUFT_Sales_Report_Release_Version_1_0_3.html`, `HUFT_Sales_Report_Release_Version_1_0_4.html`, `index(20261029-125220).html`. They already drift from each other.
- **Fix:** keep `index.html` as the single source. Generate release copies in CI, or delete them. Delete `index(20261029-125220).html`.

### D2. Backup and release copies not ignored — OPEN
- **Fix:** add to `.gitignore`: `index(*).html`, `*.bak`, `HUFT_Sales_Report_Release_Version_*.html` (if generated).

### D3. README file list doesn't match the repo — OPEN
- **Fix:** update the README "Repository Structure" section to list `admin.html`, `supabase/`, `cloudflare-worker/`, `scripts/`, `deploy/`, and the docs.

### D4. Deploy publishes the whole repo — OPEN
- **Where:** `deploy/workflows/deploy.yml`, `upload-pages-artifact` with `path: '.'`.
- **Fix:** publish only the frontend. Use a `dist/` folder:
  ```yaml
  - name: Build Pages artifact
    run: |
      mkdir -p dist
      cp index.html admin.html dist/
      cp -r assets dist/ 2>/dev/null || true
  - uses: actions/upload-pages-artifact@v3
    with:
      path: dist
  ```
  This keeps `supabase/`, `cloudflare-worker/`, SQL and scripts off the public site.

---

## E. Verification checklist (run after all fixes)

```bash
node scripts/check-inline-js.js            # must pass
node scripts/test-auth-security.js         # must pass 10/10
grep -rn "[REDACTED_CREDENTIAL]\|[REDACTED_CREDENTIAL]\|[REDACTED_CREDENTIAL]\|service_role" index.html admin.html   # must be empty
grep -rn "Access-Control-Allow-Origin.*'\*'\|\"\*\"" supabase cloudflare-worker             # must be empty
grep -rn "isApprovedOverride\|huft_approved_emails\|huft_store_accounts" index.html          # must be empty
```

Manual checks:
- Sign in to admin.html with the admin email and an empty password: must fail.
- Sign in with a store-manager account to admin.html: must show "not authorized".
- Call `get-admin-dashboard` with a store-manager token: must return 403.
- A store manager cannot read another store's records.

---

## F. Order of work

1. A1–A10: remove remaining client-side auth (finish A7, A9, A10, B1).
2. B3, B4: lock CORS.
3. C1, C2, C3: align roles and schema, enable RLS.
4. C7, C8: make tests meaningful, then get CI green.
5. D1–D4: cleanup and safe deploy.
6. Then run `ANTIGRAVITY_CLOUD_ENCRYPTION_PROMPT.md` (encryption and cloud work).
