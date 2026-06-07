# Sweet Crumbs SaaS — Complete Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PRODUCTION SETUP                      │
│                                                          │
│  Vercel (Frontend)  ──►  Render (Backend API)           │
│      React + Vite           Node.js + Express           │
│                                  │                       │
│                         Supabase (PostgreSQL)            │
│                     Database + Row Level Security        │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1 — Supabase Database Setup

1. Go to https://supabase.com → New Project
2. Choose region: **Mumbai (ap-south-1)** for India
3. Save your database password somewhere safe
4. Go to **SQL Editor** → paste the entire `database/schema.sql` → Run

After running, verify tables were created:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

5. Go to **Project Settings → API**:
   - Copy `Project URL` → this is your `SUPABASE_URL`
   - Copy `service_role` key → this is your `SUPABASE_SERVICE_ROLE_KEY`
   - Copy `DATABASE_URL` from **Project Settings → Database → Connection String → URI**

> ⚠️ **Important**: Use the **Transaction** connection string (port 6543) if using serverless.
> For Render (persistent server) use the **Session** string (port 5432).

---

## Step 2 — Backend on Render

### Option A — Using render.yaml (recommended)

1. Push the repo to GitHub
2. Go to https://render.com → New → Blueprint
3. Connect your GitHub repo — Render auto-reads `render.yaml`
4. Fill in the sync: false env vars (DATABASE_URL, FRONTEND_URL, etc.)
5. Deploy

### Option B — Manual setup

1. Go to https://render.com → New → Web Service
2. Connect GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - **Region**: Singapore (closest to India)
4. Add Environment Variables (from backend/.env.example):

| Key                   | Value                                    |
|-----------------------|------------------------------------------|
| NODE_ENV              | production                               |
| DATABASE_URL          | postgres://... (from Supabase)           |
| JWT_SECRET            | (generate: openssl rand -hex 32)         |
| JWT_REFRESH_SECRET    | (generate: openssl rand -hex 32)         |
| FRONTEND_URL          | https://your-app.vercel.app              |
| OTP_PROVIDER          | fast2sms (or console for testing)        |
| FAST2SMS_API_KEY      | (from fast2sms.com)                      |

5. Deploy → copy your Render URL (e.g. `https://sweet-crumbs-api.onrender.com`)

---

## Step 3 — Frontend on Vercel

1. Go to https://vercel.com → New Project → Import GitHub repo
2. Settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variables:

| Key          | Value                                              |
|--------------|----------------------------------------------------|
| VITE_API_URL | https://sweet-crumbs-api.onrender.com/api          |

4. Deploy

---

## Step 4 — WhatsApp Business API (Optional)

### Prerequisites
- Meta Business Account verified
- WhatsApp Business API approved

### Steps
1. Go to https://developers.facebook.com → My Apps → Create App
2. Add WhatsApp product
3. Get Phone Number ID and Business Account ID
4. Generate a **Permanent Access Token**
5. Set up webhook in Meta Dashboard:
   - **Callback URL**: `https://sweet-crumbs-api.onrender.com/api/whatsapp/webhook`
   - **Verify Token**: Same as `webhookVerifyToken` in your app settings
   - **Subscribe to**: messages
6. Enter these credentials in **WhatsApp → Configuration** page in your app

---

## Step 5 — OTP Setup (Fast2SMS)

1. Register at https://fast2sms.com
2. Get API key from Dashboard
3. Set `FAST2SMS_API_KEY` in Render env vars
4. Set `OTP_PROVIDER=fast2sms`

For development/testing, keep `OTP_PROVIDER=console` — OTP prints to server logs.

---

## Step 6 — Custom Domain (Optional)

### Vercel
- Vercel Dashboard → Your Project → Settings → Domains
- Add `app.sweetcrumbs.in` (or whatever you have)
- Follow DNS instructions

### Render
- Render Dashboard → Your Service → Settings → Custom Domains
- Add `api.sweetcrumbs.in`
- Add CNAME record in your DNS

Update `FRONTEND_URL` in Render and `VITE_API_URL` in Vercel after domain setup.

---

## Local Development

### Backend
```bash
cd backend
cp .env.example .env
# Fill in .env values (use DATABASE_URL from Supabase)
npm install
npm run dev
# API running at http://localhost:5000
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL=http://localhost:5000/api
npm install
npm run dev
# App running at http://localhost:5173
```

### Demo Login
After running the SQL seed:
- **Phone**: 9876543210
- **Password**: demo1234

---

## Production Checklist

- [ ] Schema deployed to Supabase
- [ ] `JWT_SECRET` is min 32 chars and random
- [ ] `FRONTEND_URL` matches your Vercel domain (for CORS)
- [ ] `VITE_API_URL` points to your Render backend
- [ ] `NODE_ENV=production` set on Render
- [ ] OTP provider configured (Fast2SMS or Twilio)
- [ ] HTTPS on both frontend and backend
- [ ] Test signup → login → create order flow end to end
- [ ] Test PDF download for invoice
- [ ] Remove demo seed data before going live

---

## Folder Structure

```
sweet-crumbs-saas/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # PostgreSQL connection pool
│   │   ├── controllers/
│   │   │   ├── authController.js    # Signup, login, OTP, refresh
│   │   │   ├── ordersController.js  # Full order CRUD + status workflow
│   │   │   ├── inventoryController.js # Inventory + stock movements
│   │   │   ├── salesController.js   # Daily sales register
│   │   │   ├── customersController.js # CRM + loyalty + birthdays
│   │   │   ├── billingController.js # GST invoices + PDF generation
│   │   │   ├── reportsController.js # Dashboard, daily, monthly, profit
│   │   │   ├── whatsappController.js # Meta API + bot state machine
│   │   │   └── notificationsController.js
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT verify + role guard
│   │   │   ├── auditLog.js          # Mutation audit trail
│   │   │   ├── errorHandler.js      # Global error + asyncHandler
│   │   │   └── validate.js          # express-validator wrapper
│   │   ├── routes/
│   │   │   └── index.js             # All API routes
│   │   ├── utils/
│   │   │   ├── jwt.js               # Token generation/verification
│   │   │   ├── otp.js               # Fast2SMS / Twilio / console
│   │   │   ├── logger.js            # Winston logger
│   │   │   └── response.js          # Standardised API responses
│   │   └── server.js                # Express app entry point
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── layout/
│   │   │       └── Layout.jsx       # Header + bottom nav + notifications
│   │   ├── context/
│   │   │   └── AuthContext.jsx      # Global auth state + token refresh
│   │   ├── pages/
│   │   │   ├── auth/                # LoginPage, SignupPage
│   │   │   ├── dashboard/           # DashboardPage
│   │   │   ├── orders/              # OrdersPage (CRUD + status)
│   │   │   ├── inventory/           # InventoryPage (CRUD + stock adjust)
│   │   │   ├── sales/               # SalesPage (register + chart)
│   │   │   ├── customers/           # CustomersPage (CRM + birthdays)
│   │   │   ├── billing/             # BillingPage (invoices + PDF)
│   │   │   ├── reports/             # ReportsPage (daily/monthly/profit)
│   │   │   └── whatsapp/            # WhatsAppPage (config + broadcast)
│   │   ├── services/
│   │   │   ├── api.js               # Axios client + token refresh interceptor
│   │   │   └── index.js             # All API service methods
│   │   ├── App.jsx                  # Router + auth guards
│   │   ├── main.jsx
│   │   └── index.css               # Tailwind + component classes
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── vercel.json
│
├── database/
│   └── schema.sql                   # Full PostgreSQL schema + seed
│
├── render.yaml                      # Render deployment config
└── DEPLOYMENT.md                    # This file
```

---

## API Reference Summary

| Method | Endpoint                       | Auth  | Description                    |
|--------|--------------------------------|-------|--------------------------------|
| POST   | /api/auth/signup               | ✗     | Create bakery + owner account  |
| POST   | /api/auth/login                | ✗     | Password login                 |
| POST   | /api/auth/otp/send             | ✗     | Send OTP to phone              |
| POST   | /api/auth/otp/verify           | ✗     | Verify OTP + get tokens        |
| POST   | /api/auth/refresh              | ✗     | Refresh access token           |
| GET    | /api/auth/me                   | ✓     | Get current user + bakery info |
| GET    | /api/orders                    | ✓     | List orders (filter, search)   |
| POST   | /api/orders                    | ✓     | Create order                   |
| PATCH  | /api/orders/:id/status         | ✓     | Update order status            |
| GET    | /api/inventory                 | ✓     | List inventory items           |
| POST   | /api/inventory/:id/adjust      | ✓     | Stock in/out/adjustment        |
| GET    | /api/sales/summary             | ✓     | Revenue chart data             |
| GET    | /api/customers/birthdays/upcoming | ✓  | Upcoming birthdays             |
| POST   | /api/customers/:id/loyalty     | ✓     | Adjust loyalty points          |
| GET    | /api/billing/invoices/:id/pdf  | ✓     | Download GST invoice PDF       |
| GET    | /api/reports/dashboard         | ✓     | Full dashboard stats           |
| GET    | /api/reports/profit            | owner | Profit/loss report             |
| POST   | /api/whatsapp/webhook          | ✗     | Meta webhook receiver          |
| POST   | /api/whatsapp/broadcast        | owner | Send broadcast to customers    |

---

## Security Notes

- All tenant data is isolated by `tenant_id` — users only see their bakery's data
- Supabase RLS is enabled — even if someone bypasses the API, DB enforces isolation
- JWT access tokens expire in 15 minutes; refresh tokens in 30 days (rotated on use)
- Passwords hashed with bcrypt (cost factor 12)
- Rate limiting on auth routes (10 requests / 15 min)
- Audit log records every mutation with user ID, IP, and timestamp
- CORS restricted to your Vercel domain
