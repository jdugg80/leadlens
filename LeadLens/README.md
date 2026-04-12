# LeadLens – Setup Guide

Field prospecting app with cloud sync, multi-user support, and admin dashboard.

---

## Step 1 — Create a Supabase Project (5 min)

1. Go to **supabase.com** and create a free account
2. Click **"New Project"** — name it `leadlens`
3. Choose a region close to you, set a database password, click Create
4. Wait ~2 minutes for it to spin up
5. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public key** (long string starting with `eyJ...`)

---

## Step 2 — Run the Database Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open `supabase_schema.sql` from this folder, copy the entire contents, paste it in
4. Click **Run**

---

## Step 3 — Add Your Supabase Keys

**In the mobile app** — open `src/utils/supabase.js` and replace:
```js
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

**In the web dashboard** — open `admin-dashboard.html` and replace the same two lines near the top of the script block.

---

## Step 4 — Create Your Admin Account

1. Go to Supabase → **Authentication → Users → Invite User** and enter your email
2. Set your password from the invite email
3. Go to **Table Editor → profiles**, find your row, change `role` to `admin`
4. Open `admin-dashboard.html` in your browser and sign in

---

## Step 5 — Build the App

```bash
npm install
eas build --platform android --profile preview
```

Reps create accounts inside the app on the **"Create Account"** tab.

---

## File Overview

```
LeadLens/
├── App.js
├── admin-dashboard.html        # Web admin dashboard — open in any browser
├── supabase_schema.sql         # Run once in Supabase SQL Editor
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js      # Sign in / create account
│   │   ├── DashboardScreen.js  # Queue + team view for admins
│   │   ├── CaptureScreen.js    # In-app camera with scan effect
│   │   ├── ReviewScreen.js     # Edit + save to Supabase
│   │   ├── ExportScreen.js     # Email or share xlsx
│   │   └── AdminExportScreen.js
│   └── utils/
│       ├── supabase.js         # ← PUT YOUR KEYS HERE
│       ├── claudeApi.js
│       └── exportXlsx.js
```

---

## Roles

| Role | Access |
|------|--------|
| `rep` | Own leads only |
| `admin` | All reps' leads + Team tab + Admin Export |

To promote someone: Supabase → Table Editor → profiles → set `role` to `admin`.
