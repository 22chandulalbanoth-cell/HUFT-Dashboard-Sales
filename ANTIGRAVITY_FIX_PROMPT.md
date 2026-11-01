# Prompt for Antigravity – fix HUFT Dashboard security and bugs

You are working in the repo `HUFT-Dashboard-Sales` (GitHub Pages + Supabase + Cloudflare Worker). Read `BUG_REPORT.md` first. Some security fixes are already applied; finish the work below. Make small, reviewable commits, and run `node scripts/check-inline-js.js` and `node scripts/test-auth-security.js` after each step.

## Goal
1. Remove all client-side authentication shortcuts. Real authentication must happen only through Supabase Auth, and authorization must happen only on the server (edge functions + RLS).
2. Make the database, edge functions and client use one role and status contract.
3. Make CI fail on real problems and pass on a clean repo.

## Task 1 – Real authentication for admin.html and index.html
- Remove the client-side "instant unlock" for admin in index.html (the block with `isValidAdminPassword`, currently `false`). Delete it rather than leaving it disabled.
- In admin.html, replace `handleAdminLogin()` with `supabase.auth.signInWithPassword({ email, password })`. After login, call the `get-profile` edge function. Only show the dashboard if `profile.role === 'CENTRAL_ADMIN'` and `profile.active === true`. Otherwise sign out and show an error.
- Remove `sessionStorage`/`localStorage` admin sessions. Use the Supabase session instead.
- Remove the password field default and any text that reveals passwords.
- Remove the `[REDACTED_CREDENTIAL]!`, `[REDACTED_CREDENTIAL]` and `[REDACTED_CREDENTIAL]` strings everywhere. `check-inline-js.js` will fail if they remain.
- Delete the seeded `huft_store_accounts` localStorage data that contains passwords, and the `huft_approved_emails` override. Stop reading status from localStorage.
- Remove email-substring role checks (`includes("admin")`, `includes("chandu")`, `includes("hyderguda")`). Roles come from `profiles.role` only.

## Task 2 – Align the data contract
- Use the database values everywhere in the client: roles `CENTRAL_ADMIN`, `STORE_MANAGER`, `STORE_USER`; active state as `profiles.active` (boolean); registration status `PENDING`, `APPROVED`, `REJECTED`.
- Update `verifyAccountStatus()` and every `status === "pending" / "pending_approval" / "deactivated"` check to match.
- Pick ONE schema source (`supabase/schema.sql` + `supabase/migrations/`). Move the useful parts of `supabase_central_control_schema.sql` into a migration and delete the duplicate. Make sure RLS is enabled on every table (`ENABLE ROW LEVEL SECURITY`).

## Task 3 – Edge functions and CORS
- Restrict `supabase/functions/_shared/cors.ts` to the GitHub Pages origin (`https://22chandulalbanoth-cell.github.io`) instead of `*`. Do the same in `cloudflare-worker/worker.js`; remove the `*` fallback.
- Confirm every admin function calls `authenticateRequest` and `requireCentralAdmin`. Fix `requireCentralAdmin` to check `profile.role === 'CENTRAL_ADMIN'` and that the admin's store access includes Hyderguda, using the current schema column names.
- `health-check` and `request-*` functions are public by design. Add input validation and rate limiting (for example, on email length and format).

## Task 4 – Connect admin.html to live data
- Replace the mock arrays in admin.html (accounts, AI usage, login logs, devices, audit, system settings) with calls to `get-admin-dashboard`, `get-ai-usage`, `approve-registration`, `reject-registration`, `approve-password-reset`, `get-system-status`, using the signed-in session token.
- Show a clear loading state and an error state for each panel.

## Task 5 – Tests and CI
- Fix `scripts/test-auth-security.js`:
  - Tests 1–4: build the mock account list in the test itself, or load it from a fixtures file, so the expected accounts exist. Do not depend on hardcoded app data that has changed.
  - Tests 7 and 8: test the real `getActiveStore` / store-access function from the app, not local variables.
- Add tests for: no hardcoded passwords, fail-closed local login (empty password rejected), CORS origin not `*`, and `requireCentralAdmin` rejecting `STORE_MANAGER`.
- In `.github/workflows` / `deploy/workflows/deploy.yml`, keep the validate job required before deploy. Do not deploy `admin.html` publicly unless it requires Supabase login (the page already fails closed, so this is acceptable once Task 1 is done).

## Task 6 – Repository cleanup
- Keep one dashboard source file. Generate `HUFT_Sales_Report_Release_Version_*.html` from it in CI or delete the copies. Delete `index(20261029-125220).html`.
- Add `*.bak`, `index(*).html` and release copies to `.gitignore` as appropriate.
- Update README deployment steps to match the real file list.

## Acceptance criteria
- `grep -rn "[REDACTED_CREDENTIAL]\|[REDACTED_CREDENTIAL]\|[REDACTED_CREDENTIAL]\|service_role" index.html admin.html` returns nothing.
- `node scripts/check-inline-js.js` passes.
- `node scripts/test-auth-security.js` passes all tests.
- A non-admin account cannot load admin data from any edge function (returns 403).
- A store manager cannot see another store's records (RLS verified).
- Signing in with the admin email and a wrong password fails, and an empty password fails.

## Do not
- Do not put service-role keys, passwords or secrets in any HTML/JS file.
- Do not change the sales calculation logic (SPA accuracy, Sara's Gravy tracking) unless a test shows a bug there.
- Do not delete data tables or run destructive SQL against production without asking me first.

When you finish, list each change with the file it touched, and report any task you could not complete along with the reason.
