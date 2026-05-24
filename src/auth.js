// Shared-secret JWT auth between the Lovable app and this microservice.
// The app signs short-lived HS256 tokens with MAIL_SERVICE_JWT_SECRET; we verify them here.
import jwt from "jsonwebtoken";

export function requireServiceJwt(req, res, next) {
  const secret = process.env.MAIL_SERVICE_JWT_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: "MAIL_SERVICE_JWT_SECRET not configured" });
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "missing bearer token" });
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    req.serviceCaller = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "invalid token" });
  }
}