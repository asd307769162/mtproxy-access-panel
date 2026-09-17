import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "mtp_admin";

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("SESSION_SECRET至少需要32个字符");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function createAdminSession() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const payload = String(expires);
  (await cookies()).set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 12 * 60 * 60,
  });
}

export async function isAdmin() {
  const value = (await cookies()).get(COOKIE_NAME)?.value || "";
  const [payload, signature] = value.split(".");
  if (!payload || !signature || Number(payload) < Date.now()) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
