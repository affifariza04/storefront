import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless admin session: `<expiry>.<hmac(expiry)>`, stored in an httpOnly
 * cookie. Good enough for a single shop owner; multi-user admin would need
 * real accounts and roles.
 */

const TTL_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("ADMIN_SESSION_SECRET must be set");
  return "dev-admin-session-secret";
}

const mac = (value: string, key: string) => createHmac("sha256", key).update(value).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "admin");
  // Compare MACs so length differences don't leak through timing.
  return expected.length > 0 && safeEqual(mac(candidate, "pw"), mac(expected, "pw"));
}

export function createSession(now = Date.now(), key = secret()): string {
  const expires = String(now + TTL_MS);
  return `${expires}.${mac(expires, key)}`;
}

export function verifySession(token: string | undefined, now = Date.now(), key = secret()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !safeEqual(signature, mac(expires, key))) return false;
  return Number(expires) > now;
}

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_TTL_SECONDS = TTL_MS / 1000;
