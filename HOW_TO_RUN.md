# How to run Vestige Chat (web)

Vestige Chat has two repositories that run together:

| Repository | What it is | Port |
|---|---|---|
| `temy_backend` | Node.js API + Socket.IO (real-time) + MySQL | 4000 |
| `temy_frontend` | React web app (Vite) | 5173 |

Clone both into the same parent folder:

```
vestige/
├── temy_backend/
└── temy_frontend/
```

Commands are for **Windows PowerShell**. On macOS/Linux use `cp` instead of `Copy-Item`.

---

## 1. Install the tools

| Tool | Version | Check with |
|---|---|---|
| Node.js (includes npm) | 20.12 or newer | `node -v` |
| MySQL 8.0+ or MariaDB 10.4+ (XAMPP works) | | running on port 3306 |
| Chrome, Edge, Firefox or Safari | recent | needed for calls (camera / microphone) |

- Node.js: https://nodejs.org (LTS installer).
- MySQL: MySQL Community Server, **or** XAMPP → press **Start** next to **MySQL**. XAMPP's login is user `root` with an empty password.

---

## 2. Backend (`temy_backend`)

### 2.1 Install packages

```powershell
cd temy_backend
npm install
```

### 2.2 Create the settings file

```powershell
Copy-Item .env.example .env
```

### 2.3 Edit `temy_backend/.env`

Change these lines and leave the rest as they are:

```ini
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=temu

JWT_ACCESS_SECRET=<paste the value from the command below>
REQUIRE_EMAIL_VERIFICATION=false
OTP_DEV_DISPLAY=true
STORAGE_DRIVER=local
```

- `DB_USER` / `DB_PASSWORD`: your MySQL login (empty password for XAMPP).
- `JWT_ACCESS_SECRET`: generate one and paste it in:

  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

- `REQUIRE_EMAIL_VERIFICATION=false`: registering signs the user in directly. Set `true` to ask for an email code first.
- `OTP_DEV_DISPLAY=true`: one-time codes (email verification, forgot / reset password) are shown on screen, so no email server is needed locally.
- `STORAGE_DRIVER=local`: every file (chat files, photos, wallpapers, call recordings) is stored in `temy_backend/uploads/`. For S3 see section 6.

Optional, browser push notifications when the tab is closed:

```powershell
npm run vapid
```

Copy the two printed keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

### 2.4 Create the database and tables

```powershell
npm run migrate
npm run migrate:status
```

This creates the `temu` database and applies migrations 001 to 028. Every line of `migrate:status` must start with ✔.

### 2.5 Start the backend

```powershell
npm run dev
```

Leave this window open. Check http://localhost:4000/api/health shows `{"status":"ok"}`.

---

## 3. Frontend (`temy_frontend`)

Open a **second** PowerShell window.

```powershell
cd temy_frontend
npm install
Copy-Item .env.example .env
npm run dev
```

`temy_frontend/.env` must contain `VITE_API_PROXY_TARGET=http://localhost:4000`.

Open http://localhost:5173.

---

## 4. Try it

1. Create an account on http://localhost:5173.
2. Open a **second browser profile or an incognito window** and create a second account.
3. Add each other as contacts and chat (messages are end-to-end encrypted).
4. Calls: phone / camera buttons in the chat header. Allow camera and microphone.
5. Group calls: create a group with 3+ people and use the call buttons in the group header (up to 6 people). During a group call, **Share screen** shows your screen to everyone (one person at a time).

### From a phone on the same Wi-Fi (optional)

Phones allow the camera only on HTTPS pages:

```powershell
npm run dev:https
```

1. Find the PC's address with `ipconfig` → **IPv4 Address** (e.g. `192.168.1.20`).
2. Add it to `CLIENT_ORIGIN` in `temy_backend/.env` (comma-separated, no spaces) and restart the backend:

   ```ini
   CLIENT_ORIGIN=http://localhost:5173,https://localhost:5173,https://192.168.1.20:5173
   ```

3. On the phone open `https://192.168.1.20:5173` and accept the certificate warning.

---

## 5. Run the tests

### Backend (261 tests)

They use their own database, `temu_test`, which is **wiped every run**. The real `temu` database is never touched.

```powershell
cd temy_backend
npm test
```

Takes 2 to 4 minutes. The summary must show `ℹ fail 0`.

### Frontend

```powershell
cd temy_frontend
node --test src/calls/chunkUploader.test.js
npm run build
```

---

## 6. Production

### Frontend (Vercel)

`vercel.json` sends `/api` and `/uploads` to the backend (`https://temy-backend.onrender.com`). Change that address if the backend moves. Build locally with `npm run build` (output in `dist/`).

### Backend (Render, EC2, …)

```bash
npm ci --omit=dev
npm run migrate
npm start
```

Production `.env` needs at least:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CLIENT_ORIGIN` | the web app's address, e.g. `https://your-app.vercel.app` |
| `DB_*` | production database (`DB_SSL=true` for a managed MySQL) |
| `JWT_ACCESS_SECRET` | a new random value (never the local one) |
| `TRUST_PROXY` | `1` behind Render / a load balancer |
| `SMTP_*`, `MAIL_FROM` | email server, so users receive their codes |
| `STORAGE_DRIVER` | `s3`, with `S3_BUCKET`, `S3_REGION`, optional `S3_PREFIX` |

- **Files:** with `STORAGE_DRIVER=local` on Render, uploaded files are **lost on every redeploy** (the disk is temporary). Use `s3` in production. Paths inside the bucket: `attachments/…`, `avatars/…`, `wallpapers/…`, `recordings/<yyyy>/<mm>/…`.
- **Upload size:** the web app allows videos and files up to 1 GB. The server's limits must match: `MAX_VIDEO_MB=1024`, `MAX_FILE_MB=1024`, `MAX_UPLOAD_MB_PER_DAY=5120` (already in `.env.example`; set them on the live server too). Without them the server stops at 100 MB.
- **Codes on screen for a demo:** `OTP_DEMO_DISPLAY=true` shows one-time codes on screen even in production. Demo only. Remove it before real users sign up, because anyone could then reset anyone's password.

All settings are explained in `temy_backend/.env.example`.

---

## 7. Common problems

| Message or symptom | Fix |
|---|---|
| `Missing required environment variable: JWT_ACCESS_SECRET` / `at least 32 characters` / `still the example value` | Generate a secret (2.3) and put it in `temy_backend/.env`. |
| `Database is not ready. Did you run "npm run migrate"?` | Start MySQL, then `npm run migrate`. |
| `Access denied for user` | Wrong `DB_USER` / `DB_PASSWORD`. |
| `ECONNREFUSED 127.0.0.1:3306` or `ETIMEDOUT` | MySQL isn't running, or `DB_HOST` is wrong (use `127.0.0.1` locally). |
| `EADDRINUSE :::4000` | Another backend is running. Close it, or change `PORT` and `VITE_API_PROXY_TARGET`. |
| `Port 5173 is already in use` | Close the other app, or run `npx vite --port 5174` and add `http://localhost:5174` to `CLIENT_ORIGIN`. |
| Login works but the chat says offline / doesn't update | The web app's address is missing from `CLIENT_ORIGIN`. Add it and restart the backend. |
| No code on screen | `OTP_DEV_DISPLAY=true` in `temy_backend/.env` (local only). |
| Camera or microphone blocked | Allow them from the address bar icon. On phones use `npm run dev:https`. |
| "File too large" for a big video | Raise `MAX_VIDEO_MB` / `MAX_FILE_MB` on the backend (section 6). |
