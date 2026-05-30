# ✈️ FlightSense AI

A full-stack flight tracking web application with AI-powered deal recommendations, price alerts, and trend analysis.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Flight Data | Amadeus API (free tier) |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Notifications | Nodemailer (SMTP email) |
| Scheduler | node-cron (hourly price checks) |
| Auth | JWT (jsonwebtoken + bcryptjs) |

---

## ✈️ Features

1. **Flight Search** — Search by route, dates, and passengers. Results sorted cheapest-first with filter sidebar (price, stops, layover, airline). "Best Deal" badge highlights the best price/layover balance.
2. **Price Alerts** — Set alerts for routes with a max-price threshold and stop count. Cron job checks every hour and emails you when a deal is found.
3. **AI Recommendations** — Claude analyzes search results against your preferences and past history, returning top 3 picks with reasoning. Chat widget lets you ask free-form questions.
4. **Price History & Trends** — Line chart of 30-day price history per route. Trend label (📈 Rising / 📉 Dropping) based on 7-day linear regression.
5. **User Preferences** — Home airport, budget range, max layover tolerance, preferred/blacklisted airlines, notification settings.
6. **Dashboard** — Stats cards, top deals, quick search, recent search history.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### 1. Clone and install

```bash
git clone <repo-url>
cd flightSenseAI

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Configure environment variables

```bash
cd ../server
cp .env.example .env
# Edit .env with your API keys (see sections below)
```

### 3. Start the development servers

Open two terminals:

```bash
# Terminal 1 — Backend (port 5000)
cd server
npm run dev

# Terminal 2 — Frontend (port 3000)
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** The app works without any API keys — it runs in mock mode with realistic sample data. Configure keys for live data.

---

## 🔑 API Keys Setup

### Amadeus API (Free Flight Data)

1. Go to [https://developers.amadeus.com](https://developers.amadeus.com)
2. Click **Get started for free** and create an account
3. Go to **My Apps** → **Create new app**
4. Choose the **Self-Service** category (free tier)
5. Copy your **API Key** and **API Secret**
6. Add to `.env`:
   ```
   AMADEUS_CLIENT_ID=your_api_key_here
   AMADEUS_CLIENT_SECRET=your_api_secret_here
   AMADEUS_HOSTNAME=test
   ```
   > Use `AMADEUS_HOSTNAME=test` for the sandbox (free). Switch to `production` for live data (requires Amadeus approval).

### Anthropic Claude API (AI Recommendations)

1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Go to **API Keys** → **Create Key**
4. Copy the key and add to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### Email Notifications (Gmail Example)

1. Use a Gmail account with **2-Factor Authentication** enabled
2. Go to Google Account → Security → **App Passwords**
3. Create an app password for "Mail"
4. Add to `.env`:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_16_char_app_password
   ```

### JWT Secret

Generate a secure random string:
```bash
openssl rand -hex 64
```
Add to `.env`:
```
JWT_SECRET=your_generated_secret_here
```

---

## 📁 Project Structure

```
flightSenseAI/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js        # Axios instance with JWT interceptor
│   │   ├── components/
│   │   │   ├── AIChatWidget.jsx  # Fixed chat bubble widget
│   │   │   ├── AlertModal.jsx    # Create/edit alert modal
│   │   │   ├── FlightCard.jsx    # Individual flight result card
│   │   │   ├── Layout.jsx        # Sidebar + nav shell
│   │   │   └── PriceChart.jsx    # Recharts price history chart
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # JWT auth state + login/register
│   │   ├── pages/
│   │   │   ├── AlertsPage.jsx    # Alert management
│   │   │   ├── DashboardPage.jsx # Home / overview
│   │   │   ├── LoginPage.jsx
│   │   │   ├── ProfilePage.jsx   # User preferences
│   │   │   ├── RegisterPage.jsx
│   │   │   └── SearchPage.jsx    # Flight search + results
│   │   ├── App.jsx               # Router + protected routes
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                     # Express backend
│   ├── db/
│   │   └── database.js         # SQLite init, schema, seed data
│   ├── middleware/
│   │   └── auth.js             # JWT verification middleware
│   ├── routes/
│   │   ├── ai.js               # /api/ai — recommend + chat
│   │   ├── alerts.js           # /api/alerts — CRUD
│   │   ├── auth.js             # /api/auth — register/login/me
│   │   ├── flights.js          # /api/flights — search + history
│   │   ├── preferences.js      # /api/preferences — user settings
│   │   └── priceHistory.js     # /api/priceHistory — charts + trends
│   ├── services/
│   │   ├── amadeus.js          # Amadeus API wrapper + mock fallback
│   │   ├── claude.js           # Anthropic Claude wrapper + mock fallback
│   │   ├── cron.js             # Hourly price alert checker
│   │   └── mailer.js           # Nodemailer email sender
│   ├── index.js                # App entry point
│   ├── package.json
│   └── .env.example            # Template for all env vars
│
└── README.md
```

---

## 🗄️ Database Schema

The SQLite database is auto-created at `server/db/flightsense.db` on first run.

| Table | Purpose |
|---|---|
| `users` | Email/password auth accounts |
| `user_preferences` | Per-user settings (home airport, budget, etc.) |
| `alerts` | Price alert rules with status tracking |
| `price_history` | Historical price snapshots per route |
| `search_history` | Log of past searches per user |

**Seed data:** Two example alerts are pre-seeded (CLE→HOU and CLE→IAH) so the dashboard shows data immediately.

---

## 🔄 Cron Job

The cron job runs **every hour** (`0 * * * *`) and:
1. Fetches all `active` alerts from the database
2. Searches current prices for each alert's route via Amadeus
3. If price ≤ `max_price` AND stops ≤ `max_stops`: marks alert as `triggered`, sends email
4. Records every price check in `price_history` for trend charts
5. Updates `last_checked` and `current_price` on the alert

> In development mode, the cron job also runs **5 seconds after startup** for easy testing.

---

## 🧪 Running Without API Keys

All three external services (Amadeus, Claude, email) fall back gracefully:

- **No Amadeus keys** → returns 5 realistic mock flights for the searched route
- **No Anthropic key** → returns pre-written AI recommendation text
- **No email config** → logs the alert to console instead of sending email

This means you can run and develop the full UI without any paid API access.

---

## 🔐 Authentication

- Register with name + email + password
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens expire in 7 days
- Token stored in `localStorage`, attached to all API requests via Axios interceptor
- Protected routes redirect to `/login` if token is absent or invalid

---

## 📱 Mobile Responsive

- Desktop: sidebar navigation
- Mobile: bottom tab bar
- All pages use responsive Tailwind breakpoints (`sm:`, `md:`, `lg:`)

---

## 🚢 Production Deployment Notes

1. Set `NODE_ENV=production` in `.env`
2. Set `AMADEUS_HOSTNAME=production` for live flight data
3. Build the frontend: `cd client && npm run build`
4. Serve `client/dist` as static files from Express (or a separate web server)
5. Use a process manager like PM2: `pm2 start server/index.js`
6. Consider migrating from SQLite to PostgreSQL for multi-instance deployments
