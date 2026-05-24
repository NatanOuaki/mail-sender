// SMTP transport + retry logic. Works with ANY SMTP provider:
// OVH, Gmail, Outlook, Ionos, Infomaniak, custom...
import nodemailer from "nodemailer";
import { decryptSecret, isCipherString } from "./crypto.js";

function buildTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: !!smtp.secure, // true for 465, false for 587/STARTTLS
    auth: smtp.username
      ? { user: smtp.username, pass: smtp.password ?? "" }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function resolvePassword(rawOrCipher) {
  if (!rawOrCipher) return "";
  return isCipherString(rawOrCipher) ? (decryptSecret(rawOrCipher) ?? "") : rawOrCipher;
}

function fromHeader(name, email) {
  return name ? `"${name}" <${email}>` : email;
}

async function withRetry(fn, { tries = 3, baseMs = 500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const transient = /timeout|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|421|450|451|452/i.test(e?.message ?? "");
      if (!transient || i === tries - 1) break;
      await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw last;
}

export async function testSmtp(smtp) {
  const tr = buildTransport({ ...smtp, password: resolvePassword(smtp.password) });
  await tr.verify();
  return { ok: true };
}

export async function sendMail({ smtp, sender, to, subject, html, text, replyTo, cc, bcc, attachments }) {
  const tr = buildTransport({ ...smtp, password: resolvePassword(smtp.password) });
  const info = await withRetry(() => tr.sendMail({
    from: fromHeader(sender?.name, sender?.email),
    to, cc, bcc, replyTo, subject, html, text, attachments,
  }));
  return { ok: true, messageId: info?.messageId ?? null, accepted: info?.accepted ?? [], rejected: info?.rejected ?? [] };
}