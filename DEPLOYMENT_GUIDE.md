# Heads Up For Tails (HUFT) - Sales Dashboard Security & AI Deployment Guide

This guide details the step-by-step instructions to configure and deploy the **Multi-Store Authentication System**, **Central Administrator Panel**, **Supabase Database with Row Level Security (RLS)**, and the **Protected Gemini AI Proxy on Cloudflare Workers**.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                         │
│  • HUFT Sales Dashboard (Standalone HTML or GitHub Pages)   │
│  • Multi-Store Login & Store Isolation Parser               │
│  • IndexedDB Partitioned Storage per Store                  │
│  • PII Sanitization (Customer Phones Masked)                │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
    Supabase Auth & Session JWT      Anonymized Metrics + JWT
               │                               │
               ▼                               ▼
┌───────────────────────────────┐  ┌───────────────────────────────────┐
│     Supabase PostgreSQL       │  │        Cloudflare Worker          │
│  • auth.users (Encrypted PWD) │  │  • Supabase JWT Token Auth        │
│  • profiles (Roles & Stores)  │  │  • Store Permission Validation    │
│  • Row Level Security (RLS)   │  │  • Hourly Rate Limiter (25 req/hr)│
│  • user_login_logs (Audit)    │  │  • PII Regex Guard (No phones)    │
│  • ai_usage_logs (Telemetry)  │  │  • Server-Side GEMINI_API_KEY     │
└───────────────────────────────┘  └─────────────────┬─────────────────┘
                                                     │
                                        Approved Anonymized Prompts
                                                     │
                                                     ▼
                                           ┌───────────────────┐
                                           │ Google Gemini 1.5 │
                                           │  Flash API Engine │
                                           └───────────────────┘
```

---

## Step 1: Supabase Configuration

### 1.1 Create Supabase Project
1. Log in to [Supabase Console](https://supabase.com/dashboard).
2. Click **New Project** and select your organization.
3. Name the project `huft-sales-dashboard` and choose a secure database password.
4. Select the region closest to your stores (e.g. `ap-south-1` Mumbai).

### 1.2 Execute Database Schema & RLS
1. In the Supabase Dashboard, open the **SQL Editor** from the left navigation.
2. Open the file [`supabase/schema.sql`](file:///C:/Users/Arun/.gemini/antigravity/scratch/huft-sales-dashboard/supabase/schema.sql) in this repository.
3. Copy and paste the entire script into the SQL Editor and click **Run**.
4. This script sets up:
   - Stores catalog: `Hyderguda`, `Banjara Hills`, `Madhapur`, `Golden Mile`, `Himayathnagar`.
   - `profiles` table with user roles (`admin`, `store_manager`, `store_staff`) and statuses (`pending_approval`, `active`, `deactivated`).
   - Automated registration trigger `on_auth_user_created`.
   - `user_login_logs` and `ai_usage_logs` audit tables.
   - Row Level Security (RLS) policies enforcing store data isolation at the database layer.

### 1.3 Configure Authentication Settings
1. Go to **Authentication -> URL Configuration**:
   - **Site URL**: `https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/`
   - **Redirect URLs**: Add your domain and local test URLs:
     - `https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/*`
     - `http://localhost:3000/*`
     - `http://127.0.0.1:3000/*`
2. Go to **Authentication -> Email Templates**:
   - Ensure the **Reset Password** template points to `{{ .SiteURL }}#type=recovery&access_token={{ .TokenHash }}`.

---

## Step 2: Central Administrator Account Bootstrapping

**Hyderguda** (`hyderguda@huft.com`) is the sole designated Central Administrator store by default. All other stores (`Banjara Hills`, `Madhapur`, `Golden Mile`, `Himayathnagar`) are strictly assigned `store_manager` roles and cannot access administrative features.

### Option A: Automatic Registration
1. In `supabase/schema.sql`, the trigger automatically assigns `role = 'admin'` and `status = 'active'` exclusively to `hyderguda@huft.com`.
2. Registering with email `hyderguda@huft.com` will immediately grant Central Admin status for the store network.

### Option B: Via SQL Editor
To manually ensure Hyderguda is the central administrator:
```sql
UPDATE public.profiles
SET role = 'admin', status = 'active', store_id = 'Hyderguda'
WHERE email = 'hyderguda@huft.com';
```

---

## Step 3: Cloudflare Worker Deployment

The Cloudflare Worker acts as the secure gateway to Google Gemini 1.5 Flash. It validates Supabase user tokens, enforces store permissions, prevents customer PII transmission, and keeps `GEMINI_API_KEY` hidden.

### 3.1 Install Cloudflare Wrangler CLI
```bash
npm install -g wrangler
# or use npx wrangler
wrangler login
```

### 3.2 Configure Environment Variables
Open [`cloudflare-worker/wrangler.toml`](file:///C:/Users/Arun/.gemini/antigravity/scratch/huft-sales-dashboard/cloudflare-worker/wrangler.toml) and update the `[vars]` section with your Supabase URL:
```toml
name = "huft-sales-ai-worker"
main = "worker.js"
compatibility_date = "2024-10-01"

[vars]
SUPABASE_URL = "https://your-project-id.supabase.co"
ALLOWED_ORIGINS = "https://22chandulalbanoth-cell.github.io,http://localhost:3000"
MAX_REQUESTS_PER_HOUR = "25"
GEMINI_MODEL = "gemini-1.5-flash"
```

### 3.3 Set Cloudflare Secrets (Secure Vault)
Run the following commands in terminal to store your keys safely in Cloudflare's encrypted secret store:
```bash
cd cloudflare-worker

# 1. Google Gemini API Key
wrangler secret put GEMINI_API_KEY
# Enter your Gemini API key when prompted

# 2. Supabase Service Role Key (from Supabase Dashboard -> Project Settings -> API)
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Enter your service role secret key
```

### 3.4 Deploy Worker
```bash
wrangler deploy
```
After deployment, Cloudflare will output your public worker URL:
`https://huft-sales-ai-worker.<your-subdomain>.workers.dev`

---

## Step 4: Frontend Configuration & Deployment

### 4.1 Update API Configuration (Production Mode)
In your browser console or frontend settings, set your deployed Supabase and Worker endpoints:
```javascript
localStorage.setItem("huft_supabase_url", "https://your-project-id.supabase.co");
localStorage.setItem("huft_supabase_anon_key", "eyJhbGciOi...");
localStorage.setItem("huft_worker_url", "https://huft-sales-ai-worker.<your-subdomain>.workers.dev");
```
*(When no custom endpoints are set, the application operates in **Secure Standalone Demo Mode** using in-memory mock accounts for instant offline security evaluation).*

### 4.2 Compile Standalone Bundle
To bundle all scripts, CSS, and authentication panels into a single distribution HTML file:
```bash
node scripts/build.js
```
The compiled file is created at:
[`dist/HUFT-Hourly-Sale-Dashboard-Standalone.html`](file:///C:/Users/Arun/.gemini/antigravity/scratch/huft-sales-dashboard/dist/HUFT-Hourly-Sale-Dashboard-Standalone.html)

### 4.3 Deploy to GitHub Pages
1. Push repository changes to GitHub:
   ```bash
   git add .
   git commit -m "feat: multi-store authentication, central admin, and protected AI assistant"
   git push origin main
   ```
2. In your GitHub repository:
   - Navigate to **Settings -> Pages**.
   - Set **Source** to Deploy from a branch (`main` root or `/dist`).
   - Save. Your updated dashboard will be live at `https://22chandulalbanoth-cell.github.io/HUFT-Dashboard-Sales/`.

---

## Step 5: Security Verification Checklist

| Requirement | Test Scenario | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **Store Login** | Enter `hyderguda@huft.com` with valid password | Successfully logs in; badge displays `Hyderguda` | ✅ |
| **Invalid Password** | Enter incorrect password | Login fails with user-friendly error; attempts logged | ✅ |
| **Pending Approval** | Sign in as `pending@huft.com` | Blocked with message: *"Account Pending Central Admin Approval"* | ✅ |
| **Deactivated User** | Sign in as `deactivated@huft.com` | Blocked with message: *"Account Deactivated"* | ✅ |
| **Central Admin** | Sign in as `admin@huft.com` | Full store switcher enabled; Central Admin panel accessible | ✅ |
| **Admin Approval** | Admin clicks "Approve" on pending account | Status transitions to `active`; user can now sign in | ✅ |
| **Store Isolation** | Hyderguda manager uploads Banjara Hills POS file | Parser blocks upload: *"Store Isolation Policy: Access Denied"* | ✅ |
| **PII Phone Mask** | Ingest POS file with customer phone numbers | Numbers masked immediately to `******1234` | ✅ |
| **Worker PII Filter** | User sends prompt with phone number or email | Cloudflare Worker rejects prompt with 400 Bad Request | ✅ |
| **Rate Limiting** | Exceed 25 requests within 1 hour | Cloudflare Worker returns HTTP 429 Too Many Requests | ✅ |
| **Password Reset** | Click "Forgot Password" and submit email | Dispatch recovery email; URL token opens password reset view | ✅ |
| **Preservation** | Upload Excel sales file | All charts, retail/SPA metrics, food comparison, and WhatsApp report remain 100% operational | ✅ |

---

## 🔒 Security & Data Privacy Assurances

1. **Passwords**: Handled exclusively via Supabase Auth with bcrypt hashing and encrypted transport. No plain-text passwords exist in frontend or database tables.
2. **Raw POS Files**: Original Excel sheets and customer records remain strictly on the local client device within store-isolated IndexedDB databases (`HUFT_Sale_DB_<StoreKey>`). They are never transmitted over the network to Gemini.
3. **Gemini API Secret**: `GEMINI_API_KEY` is stored solely as an encrypted Cloudflare Worker secret and is never exposed in client JavaScript.
4. **AI Prompts**: Only approved analytical metrics (totals, run-rates, food quantities) are forwarded to Gemini. All phone numbers and personal identifiers are scrubbed at the edge.
