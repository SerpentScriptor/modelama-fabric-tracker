# Modelama Fabric Shipment Tracker — Real Server Version

This is the full production version: a Node.js/Express server, a real PostgreSQL
database, and the dashboard as its frontend. Deploy it once and you get a permanent
link (e.g. `https://modelama-tracker.up.railway.app`) that anyone on your team can
open from a phone or computer — no installs needed on their end.

## What's in this folder
- `server.js` — the backend (API + serves the dashboard)
- `schema.sql` — creates the database tables automatically on first start
- `public/index.html` — the dashboard your team actually uses
- `package.json` — tells the host what to install
- `.env.example` — settings you can change (passcode, etc.)

## Deploy in ~10 minutes (Railway — no command line needed)

1. **Create a free account** at railway.app and click **New Project**.
2. Choose **Deploy from GitHub repo**. If you don't have this on GitHub yet:
   - Go to github.com → **New repository** → name it `modelama-tracker` → Create.
   - On the new repo page, click **uploading an existing file**, drag in every
     file from this folder (keep the `public` folder structure), and commit.
3. Back in Railway, pick that `modelama-tracker` repo. Railway will detect it's a
   Node app automatically.
4. Click **+ New** → **Database** → **Add PostgreSQL**. Railway creates it and
   automatically wires up a `DATABASE_URL` for your app — you don't need to type
   any connection string yourself.
5. Click on your app service → **Variables** tab → add:
   - `PGSSL` = `true`
   - `APP_PASSWORD` = a passcode you choose (this is what your team types in
     to log in — change it from the default before sharing the link)
6. Click **Deploy**. After a minute, Railway shows you a public URL under
   **Settings → Networking → Generate Domain**. That URL is the link for
   everyone — send it to your team along with the passcode.

That's it. Railway keeps it running, backs up the database, and gives you logs if
anything goes wrong (Project → your app → **Deployments** → **View Logs**).

## Alternative: Render.com
Same idea if you'd rather use Render instead of Railway:
1. New **Web Service** → connect the repo → Build command `npm install`,
   Start command `npm start`.
2. New **PostgreSQL** database (free tier) → copy its **Internal Database URL**.
3. In your web service **Environment**, add `DATABASE_URL` (paste it),
   `PGSSL=true`, `APP_PASSWORD=your-passcode`.
4. Deploy — Render gives you a `https://yourapp.onrender.com` link.

## Running it on your own company server instead
If IT would rather host this in-house:
1. Install Node.js 18+ and PostgreSQL on the server.
2. Create a database and user, then run `schema.sql` against it once
   (`psql -U youruser -d yourdb -f schema.sql`) — or just let the app run once,
   it creates the tables itself on startup.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `APP_PASSWORD`.
4. `npm install` then `npm start` (or run it under `pm2`/a Windows service so
   it restarts automatically and stays up).
5. Open the server's firewall on the chosen port (or put nginx in front of it
   on port 80/443) so people on the office network/VPN can reach it.

## Changing the shared passcode later
Just update the `APP_PASSWORD` variable on Railway/Render (or in `.env` on your
own server) and restart the app. Everyone logs in with the new passcode next time.

## Clearing the sample data
Log in as **Admin** → **Admin Tools** in the sidebar → **Clear sample data only**.
This removes the 5 demo shipments (INV-2025-0001–0005) without touching anything
real your team has entered.

## Troubleshooting: "ECONNREFUSED ::1:5432" in the logs

This means the app couldn't find `DATABASE_URL`, so it tried connecting to a
database on its own machine (which doesn't exist) instead of your real Postgres.
The app now prints a clear message about this in the logs instead of crashing
silently, and it retries a few times in case the database is just slow to start.

To fix it on Railway:
1. Make sure you have **two services** in the same Railway project: your app,
   and a **Postgres** database (Project page → "+ New" → "Database" →
   "Add PostgreSQL" if it's missing).
2. Click your **app service** (not the Postgres one) → **Variables** tab.
3. Add a variable named `DATABASE_URL`. Instead of typing a URL by hand, use
   Railway's variable reference: click "Add Reference" (or type
   `${{Postgres.DATABASE_URL}}` as the value) and pick your Postgres service.
   This keeps it correct automatically, even if Railway rotates the credentials.
4. Also add `PGSSL=true` and `APP_PASSWORD=your-chosen-passcode`.
5. Redeploy. Open `/healthz` on your app's URL (e.g.
   `https://yourapp.up.railway.app/healthz`) — it should return
   `{"ok":true,"database":"connected"}`. If it instead shows an error message,
   that message tells you exactly what's still wrong.

Common causes if it's still failing after this:
- The app and Postgres are in **different** Railway projects — they can only
  reference each other's variables within the same project.
- You typed the variable name as `DATABASE_URL ` with a trailing space, or
  pasted a stale/example URL instead of using the reference.
- Only one of `PGSSL` or `DATABASE_URL` was added — both are needed for hosted
  Postgres.

## How QR scanning actually works now

Each shipment's QR encodes a real link — `https://your-live-link/scan/SHP-2026-000145` —
not just plain text. That means:

- **No special app needed.** Any phone's normal camera app reads the QR and opens
  the link in the browser, exactly like a restaurant menu QR code.
- **The same physical QR updates itself forever.** The link always shows the
  shipment's *current* stage and details, pulled live from the database at the
  moment of scanning — nothing about the sticker changes, but what it shows does.
  Scan it at the gate: shows "Awaiting GRN." Scan the identical sticker a week
  later at Merchant Approval: shows that stage, live.
- **Actions are role-gated.** Whoever's logged in on that phone/device determines
  what they can do. A Lab technician's phone shows a "Complete Lab Shrinkage" form
  when scanning a shipment sitting in that stage; anyone else scanning the same
  QR only sees read-only status. Log in once per device with your name, role, and
  the shared company passcode — the login is remembered on that device after that,
  so it's a one-time setup per phone, not a re-login on every scan.
- **The GRN step works the same way.** The gate QR gets scanned by whoever's
  logged in as Store/GRN; the page shows a "Generate GRN Now" button, and tapping
  it creates the GRN number automatically — no typing.

Practically: print the QR from "New Shipment," stick it to the file, and each
department scans that same sticker with their own phone when it reaches them.
