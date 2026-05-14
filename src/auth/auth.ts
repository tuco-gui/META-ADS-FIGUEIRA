import crypto from "node:crypto";
import { env } from "../config/env.js";

const COOKIE_NAME = "meta_ads_figueira_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function authStatus() {
  return {
    configured: Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET),
    email: env.ADMIN_EMAIL
  };
}

export function requireAuth(req: any, res: any, next: any) {
  if (!authStatus().configured) {
    res.status(503).json({
      error: "auth_not_configured",
      message:
        "Login ainda não configurado. Defina ADMIN_EMAIL, ADMIN_PASSWORD_HASH e SESSION_SECRET no ambiente."
    });
    return;
  }

  const token = readCookie(req.headers?.cookie ?? "", COOKIE_NAME);
  if (!token || !verifySessionToken(token)) {
    res.status(401).json({
      error: "unauthorized",
      message: "Faça login para continuar."
    });
    return;
  }

  next();
}

export function login(req: any, res: any) {
  if (!authStatus().configured) {
    res.status(503).json({
      error: "auth_not_configured",
      message:
        "Login ainda não configurado. Defina ADMIN_EMAIL, ADMIN_PASSWORD_HASH e SESSION_SECRET no ambiente."
    });
    return;
  }

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (email !== env.ADMIN_EMAIL.toLowerCase() || !verifyPassword(password)) {
    res.status(401).json({
      error: "invalid_credentials",
      message: "E-mail ou senha inválidos."
    });
    return;
  }

  const token = createSessionToken();
  res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, token, SESSION_TTL_MS));
  res.json({ ok: true, email: env.ADMIN_EMAIL });
}

export function logout(_req: any, res: any) {
  res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, "", 0));
  res.json({ ok: true });
}

export function me(req: any, res: any) {
  const token = readCookie(req.headers?.cookie ?? "", COOKIE_NAME);
  const authenticated = Boolean(token && verifySessionToken(token));
  res.json({
    authenticated,
    email: authenticated ? env.ADMIN_EMAIL : null,
    configured: authStatus().configured
  });
}

function verifyPassword(password: string): boolean {
  const [scheme, salt, expected] = String(env.ADMIN_PASSWORD_HASH ?? "").split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return (
    actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer)
  );
}

function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: env.ADMIN_EMAIL,
      exp: Date.now() + SESSION_TTL_MS
    })
  ).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): boolean {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.sub === env.ADMIN_EMAIL && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", String(env.SESSION_SECRET)).update(payload).digest("base64url");
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function serializeCookie(name: string, value: string, maxAgeMs: number): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (env.AUTH_COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}
