import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { db, sqlite } from "./db";
import { sessions, projects, gifts } from "./schema";
import { env } from "./env";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function sameOrigin(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(env.origin).origin)
    throw new HttpError(403, "This action must come from this website.");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site action denied.");
}
export function owner(req: NextRequest) {
  const raw = req.cookies.get("dq_owner")?.value;
  const s = raw
    ? db
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.id, digest(raw)), gt(sessions.expiresAt, Date.now())),
        )
        .get()
    : null;
  if (!s)
    throw new HttpError(
      401,
      "Your creator session has expired. Start a new draft in this browser.",
    );
  return s;
}
export function createSession(req: NextRequest) {
  let s;
  try {
    s = owner(req);
  } catch {}
  if (s) return NextResponse.json({ ready: true, unlocked: !!s.unlocked });
  const raw = token(),
    now = Date.now();
  db.insert(sessions)
    .values({
      id: digest(raw),
      createdAt: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 90,
      unlocked: 0,
    })
    .run();
  const res = NextResponse.json({ ready: true, unlocked: false });
  res.cookies.set("dq_owner", raw, {
    httpOnly: true,
    secure: env.production,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
export function owned(id: string, ownerId: string) {
  const p = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.owner, ownerId)))
    .get();
  if (!p)
    throw new HttpError(
      404,
      "This draft was not found in your creator session.",
    );
  return p;
}
export function shared(t: string) {
  const g = db
    .select()
    .from(gifts)
    .where(and(eq(gifts.token, t), eq(gifts.revoked, 0)))
    .get();
  if (!g) throw new HttpError(404, "This gift link is no longer available.");
  return g;
}
export function rateLimit(key: string, limit: number, windowMs: number) {
  sqlite
    .transaction(() => {
      const now = Date.now();
      sqlite.prepare("DELETE FROM rate_limits WHERE untilAt < ?").run(now);
      const r = sqlite
        .prepare("SELECT count FROM rate_limits WHERE key=?")
        .get(key) as { count: number } | undefined;
      if (r && r.count >= limit)
        throw new HttpError(429, "A little pause, please. Try again later.");
      sqlite
        .prepare(
          "INSERT INTO rate_limits(key,count,untilAt) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        )
        .run(key, now + windowMs);
    })
    .immediate();
}
export function unlock(id: string, code: string) {
  rateLimit("access-global", 30, 15 * 60_000);
  rateLimit("access:" + id, 5, 15 * 60_000);
  if (!env.code)
    throw new HttpError(503, "The host has not configured creator access.");
  const a = Buffer.from(digest(code)),
    b = Buffer.from(digest(env.code));
  if (!timingSafeEqual(a, b))
    throw new HttpError(403, "That access code didn’t match.");
  db.update(sessions).set({ unlocked: 1 }).where(eq(sessions.id, id)).run();
}
