# HUFT Dashboard – Bug Report & Fix Log

Scope: uploaded repo `HUFT-Dashboard-Sales-main` (index.html, admin.html, Supabase edge functions, Cloudflare worker, test suite, CI workflow).

## 1. Security (critical)

| # | Where | Bug | Status |
|---|-------|-----|--------|
| S1 | admin.html | Master password `[REDACTED_CREDENTIAL]` pre-filled in the password field and printed on the login screen. | FIXED: removed. |
| S2 | admin.html | Empty password accepted; any email containing `22chandulal` accepted; `[REDACTED_CREDENTIAL]!` hardcoded; session saved to localStorage (forgeable). | FIXED: login now fails closed. Needs Supabase Auth (see prompt). |
| S3 | index.html ~L20694 | Admin bypass: any password of 6+ characters unlocked Central Admin for chandu/admin emails. | FIXED: bypass disabled. |
| S4 | index.html ~L17974 | Supabase sign-in falls back to default password `[REDACTED_CREDENTIAL]` when the field is empty. | FIXED. |
| S5 | index.html ~L18504 | `quickDemoLogin()` auto-fills `[REDACTED_CREDENTIAL]`. | FIXED: field left blank. |
| S6 | index.html ~L5097 | Portal password field pre-filled with `[REDACTED_CREDENTIAL]`. | FIXED: blank. |
| S7 | index.html ~L20368 | Seeded admin account stores plaintext password in localStorage. Password removed from seed. | PARTIAL: seeded data still in localStorage; delete it in the migration to Supabase. |
| S8 | index.html ~L20753 | Local-account sign-in only compared passwords when both were set, so accounts with no password (or an empty one) logged in with email alone. | FIXED: fails closed. |
| S9 | index.html ~L17963 | Admin role granted by email substring (`admin`, `hyderguda`, `chandu`). | PARTIAL: `admin` removed; `hyderguda`/`chandu` substring checks remain. |
| S10 | index.html | Approved-user list kept in localStorage (`huft_approved_emails`) overrides real status checks. | OPEN. |
| S11 | supabase/functions/_shared/cors.ts | `Access-Control-Allow-Origin: *` on all edge functions. | OPEN. |
| S12 | cloudflare-worker/worker.js | Falls back to `*` CORS if no allowed origin matches. | OPEN. |
| S13 | Architecture | Admin dashboard (admin.html) uses mock data and a client-side login, not the protected edge functions. | OPEN (largest gap). |
| S14 | Deploy | GitHub Pages deploys the whole repo, including admin.html and 1.4 MB duplicate HTML copies. | OPEN. |

## 2. Build / CI

| # | Bug | Status |
|---|-----|--------|
| B1 | `scripts/test-auth-security.js` printed failures but exited 0, so CI never failed. | FIXED: exits 1 on any failure. |
| B2 | Test suite: 6/10 pass. Tests 1–4 expect mock accounts (hyderguda@example.test, banjarahills@example.test, pending@, deactivated@) that do not exist in `MOCK_STORE_ACCOUNTS`. | OPEN: seed test data or update tests. |
| B3 | Tests 7 and 8 test local variables, not app code (always pass). | OPEN. |
| B4 | Workflow step labelled "Syntax and Integrity Check" never compiled JavaScript. | FIXED: `scripts/check-inline-js.js` compiles all inline scripts, checks for secrets, and checks the engine marker. |
| B5 | Secret-leak guard checked index.html only. | FIXED: now also checks admin.html. |

## 3. Data-contract mismatches (client vs database)

| # | Bug |
|---|-----|
| D1 | Client roles are `admin` / `store_manager`; database (`supabase/schema.sql`) uses `CENTRAL_ADMIN` / `STORE_MANAGER` / `STORE_USER`. Client role checks never match real profiles. |
| D2 | Client status values (`pending`, `pending_approval`, `deactivated`, `rejected`) do not match the database (`active` boolean; `PENDING`/`APPROVED`/`REJECTED` in registration_requests). |
| D3 | Two different schemas exist: `supabase/schema.sql` + migration, and `supabase_central_control_schema.sql`. They define the same tables differently. |
| D5 | admin.html checks `22chandulalabanoth@gmail.com` in one place and `22chandulalbanoth@gmail.com` in another. |

## 4. Repository hygiene
- Three ~1.4–1.7 MB copies of the dashboard (`index.html`, `HUFT_Sales_Report_Release_Version_1_0_3/4.html`, `index(20261029-125220).html`) drift from each other. Keep one source and generate releases from it.
- README says upload `index.html`, `README.md`, `CHANGELOG.md`, `.gitignore`, but the repo also contains edge functions, SQL and admin.html.
- `.gitignore` does not exclude backup or release copies.

## Files changed in this pass
- index.html: S3, S4, S5, S6, S8 patches (about 13 lines).
- admin.html: S1, S2 patches (about 10 lines).
- scripts/test-auth-security.js: exits non-zero on failure (B1).
- scripts/check-inline-js.js: new (B4, B5).
- deploy/workflows/deploy.yml: uses the new checker and checks admin.html.
- BUG_REPORT.md: this file.

## Expected CI result after this pass
The validate job will still FAIL on the test suite (B2, B3). That is intentional: the suite now reports real problems instead of passing silently.
