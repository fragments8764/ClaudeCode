# Production on Render: exact steps

Steps marked 🖱️ **YOU** need your Render account. Everything else is already in the repo. Allow about 20 minutes.

**What this fixes:** without a disk, every deploy wipes sightings, shared plans, alert subscriptions and beta feedback. Without fixed push keys, every deploy silently breaks everyone's alerts.

## 0. Generate your push (VAPID) keys, once
On your own computer, with Node installed:

```bash
npx web-push generate-vapid-keys
```

You get a **Public Key** and a **Private Key**. Keep the private key secret (a password manager is ideal). Don't paste it into chats or commit it.

## 1. Choose: keep your existing service, or recreate it from the Blueprint

### A. You already have a Render web service (the usual case)
1. 🖱️ **YOU:** Render dashboard → your service → **Settings** → **Instance type** → choose **Starter** or higher. Disks need a paid instance, about US$7/month at the time of writing.
2. 🖱️ **YOU:** **Disks** (left menu) → **Add disk**:
   - Name: `nordurljos-data`
   - Mount path: `/data`
   - Size: `1` GB
   - → Save
3. 🖱️ **YOU:** **Environment** → **Add environment variable**, one per row:

| Key | Value |
| --- | --- |
| `DATA_DIR` | `/data` |
| `VAPID_PUBLIC_KEY` | public key from step 0 |
| `VAPID_PRIVATE_KEY` | private key from step 0 |
| `VAPID_SUBJECT` | `mailto:your-real-email` |
| `ADMIN_TOKEN` | a long random string. Click **Generate** if offered, or use a password manager's 32-character password. |
| `CONTACT_EMAIL` | your real email (MET Norway's terms ask for it) |
| `OPEN_METEO_API_KEY` | only if you have a paid Open-Meteo plan. Leave it out for personal or non-commercial use. |
| `NODE_VERSION` | `22` |

   → **Save changes**. Render redeploys automatically.
4. 🖱️ **YOU:** **Settings** → **Health Check Path** → `/api/health` → Save.

### B. Start fresh from the Blueprint
1. 🖱️ **YOU:** Render → **New** → **Blueprint** → connect this GitHub repo. Render reads `render.yaml`, which sets the disk, region (Frankfurt), build and start commands, health check and `DATA_DIR`, and generates `ADMIN_TOKEN`.
2. 🖱️ **YOU:** It asks for the values marked secret: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CONTACT_EMAIL`, and optionally `OPEN_METEO_API_KEY`. Fill them in → **Apply**.
3. This creates a new service with a new web address. Delete the old service afterwards so you don't pay twice. Phones installed from the old address need to be added to the Home Screen again.

## 2. Check it worked (2 min)
1. 🖱️ **YOU:** Service → **Logs**. Near the top of the latest deploy you should see:
   `[nordurljos] production settings: all good ✓`
   If you see a box of `!!!!` lines instead, it lists exactly what's missing and how to fix it.
2. Open `https://<your-app>.onrender.com/api/health` → `"config": { "ok": true, "issues": [] }`.
3. Open `https://<your-app>.onrender.com/admin?token=<ADMIN_TOKEN>` → the dashboard opens, with "Production settings: all good ✓" at the top.
4. On your phone: Settings → Alerts → turn alerts off and on once (the push keys changed), then **Send a test notification**.

## 3. After this, every update is just
Push to the branch → Render auto-deploys → phones auto-update within about 30 minutes. Data and alerts survive deploys.

## Getting your ADMIN_TOKEN later
🖱️ **YOU:** Service → **Environment** → `ADMIN_TOKEN` → click the eye icon. Bookmark `https://<your-app>.onrender.com/admin?token=<that value>` on your phone. Anyone with the link can see admin data, so don't share it.
