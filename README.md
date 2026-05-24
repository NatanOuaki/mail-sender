# MyCab360 Mail Service

Standalone Node.js microservice that handles **SMTP** sending for the
MyCab360 Lovable app. SMTP TCP connections aren't reliable inside the
Lovable/Supabase serverless runtime, so all SMTP execution lives here.
Works with **any SMTP provider** (OVH, Gmail, Outlook, Ionos,
Infomaniak, custom).

## Endpoints

All endpoints (except `/health`) require `Authorization: Bearer <jwt>`
signed with `MAIL_SERVICE_JWT_SECRET` (HS256).

| Method | Path             | Purpose                                  |
|--------|------------------|------------------------------------------|
| GET    | `/health`        | Liveness probe                           |
| POST   | `/test-smtp`     | Verify SMTP credentials                  |
| POST   | `/send-email`    | Generic transactional email              |
| POST   | `/send-reminder` | Reminder email (same payload shape)      |
| POST   | `/send-signature`| Signature-flow email (same payload shape)|

### Body shape (`/send-*`)
```json
{
  "smtp": {
    "host": "ssl0.ovh.net", "port": 465, "secure": true,
    "username": "noreply@firm.fr",
    "password": "enc:v1:<iv>:<tag>:<ct>"   // AES-256-GCM ciphertext from the app
  },
  "sender": { "name": "MyCab360", "email": "noreply@firm.fr" },
  "to": "client@example.com",
  "subject": "...", "html": "<p>...</p>", "text": "..."
}
```

`password` may be either AES-256-GCM ciphertext (preferred — encrypted by the
app with `APP_ENCRYPTION_KEY`) or raw plaintext for first-time SMTP tests.

## Environment

| Var                       | Required | Notes                                                                  |
|---------------------------|----------|------------------------------------------------------------------------|
| `APP_ENCRYPTION_KEY`      | yes      | **Same value** as the Lovable app — needed to decrypt SMTP passwords.  |
| `MAIL_SERVICE_JWT_SECRET` | yes      | Shared HMAC secret used by the app to sign service-to-service JWTs.    |
| `PORT`                    | no       | Default `8080`.                                                        |
| `LOG_LEVEL`               | no       | `info` by default.                                                     |

## Run locally
```bash
cp .env.example .env  # then edit values
npm install
npm run dev
# health check
curl http://localhost:8080/health
```

## Deploy
- **Docker**: `docker build -t mycab360-mail . && docker run -p 8080:8080 --env-file .env mycab360-mail`
- **Railway**: connect repo, point at `mail-service/`, set env vars. `railway.json` is provided.
- **Render**: `render.yaml` provided (Docker runtime).
- **VPS / OVH**: any Node 20+ host. `npm install --omit=dev && npm start` behind a reverse proxy with TLS.

## Security

- SMTP passwords are **never** sent to the frontend.
- Stored encrypted at rest in the app database.
- Decrypted only inside this service.
- Service-to-service auth via short-lived HS256 JWT.
- Retries with exponential backoff on transient SMTP failures.
- Structured JSON logs via pino.