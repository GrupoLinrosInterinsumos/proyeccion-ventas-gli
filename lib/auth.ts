import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { queryOne } from "./db";
import type { Region } from "./regions";

const COOKIE_NAME = "gli_session";
const secretValue = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
const secret = new TextEncoder().encode(secretValue);

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  /** Null only for an admin account with no personal projection of their own. */
  vendedor: string | null;
  region: Region | null;
  isAdmin: boolean;
  isSpot: boolean;
};

export type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  vendedor: string | null;
  region: Region | null;
  is_admin: boolean;
  is_spot: boolean;
};

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
}

export async function createSessionCookie(user: UserRow) {
  const token = await new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    vendedor: user.vendedor,
    region: user.region,
    isAdmin: user.is_admin,
    isSpot: user.is_spot,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
