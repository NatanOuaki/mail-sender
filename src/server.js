import express from "express";
import pinoHttp from "pino-http";
import pino from "pino";
import { z } from "zod";
import { requireServiceJwt } from "./auth.js";
import { sendMail, testSmtp } from "./mailer.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp({ logger }));

// ---------- Health (public) ----------
app.get("/health", (_req, res) => res.json({ ok: true, service: "mycab360-mail-service", uptime: process.uptime() }));

// ---------- Schemas ----------
const SmtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().nullish(),
  // Either raw plaintext (for /test-smtp from settings UI) or AES-GCM ciphertext
  // produced by the Lovable app via APP_ENCRYPTION_KEY.
  password: z.string().nullish(),
});

const SenderSchema = z.object({
  name: z.string().nullish(),
  email: z.string().email(),
});

const SendBodySchema = z.object({
  smtp: SmtpSchema,
  sender: SenderSchema,
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  replyTo: z.string().email().optional(),
  subject: z.string().min(1).max(998),
  html: z.string().min(1),
  text: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(), // base64
    encoding: z.literal("base64").default("base64"),
    contentType: z.string().optional(),
  })).optional(),
  // Optional metadata for logs / future queue
  context: z.object({
    firm_id: z.string().uuid().optional(),
    kind: z.enum(["transactional", "signature", "reminder", "test"]).optional(),
    template_key: z.string().optional(),
  }).optional(),
});

// ---------- Routes (auth required) ----------
app.post("/test-smtp", requireServiceJwt, async (req, res) => {
  const parsed = SmtpSchema.safeParse(req.body?.smtp ?? req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.message });
  try {
    await testSmtp(parsed.data);
    res.json({ ok: true });
  } catch (e) {
    req.log.warn({ err: e?.message }, "smtp test failed");
    res.status(200).json({ ok: false, error: e?.message ?? "verify failed" });
  }
});

async function handleSend(req, res, kindDefault) {
  const parsed = SendBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.message });
  const ctx = { ...(parsed.data.context ?? {}), kind: parsed.data.context?.kind ?? kindDefault };
  try {
    const result = await sendMail(parsed.data);
    req.log.info({ ctx, messageId: result.messageId }, "email sent");
    res.json(result);
  } catch (e) {
    req.log.error({ ctx, err: e?.message }, "email send failed");
    res.status(200).json({ ok: false, error: e?.message ?? "send failed" });
  }
}

app.post("/send-email",    requireServiceJwt, (req, res) => handleSend(req, res, "transactional"));
app.post("/send-reminder", requireServiceJwt, (req, res) => handleSend(req, res, "reminder"));
app.post("/send-signature",requireServiceJwt, (req, res) => handleSend(req, res, "signature"));

// ---------- Boot ----------
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => logger.info({ port }, "mail service listening"));