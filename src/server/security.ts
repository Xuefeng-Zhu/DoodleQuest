import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt, lt, sql } from "drizzle-orm";
import { db, ready, transaction } from "./db";
import { sessions, projects, gifts, rateLimits } from "./schema";
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
export async function owner(req: NextRequest) {
  await ready();
  const raw = req.cookies.get("dq_owner")?.value;
  const s = raw
    ? (
        await db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.id, digest(raw)),
              gt(sessions.expiresAt, Date.now()),
            ),
          )
      )[0]
    : null;
  if (!s)
    throw new HttpError(
      401,
      "Your creator session has expired. Start a new draft in this browser.",
    );
  return s;
}
export async function createSession(req: NextRequest) {
  await ready();
  let existing;
  try {
    existing = await owner(req);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
  }
  if (existing)
    return NextResponse.json({ ready: true, unlocked: !!existing.unlocked });
  const raw = token(),
    now = Date.now();
  await db
    .insert(sessions)
    .values({
      id: digest(raw),
      createdAt: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 90,
      unlocked: 0,
    });
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
export async function owned(id: string, ownerId: string) {
  await ready();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.owner, ownerId)));
  if (!project)
    throw new HttpError(
      404,
      "This draft was not found in your creator session.",
    );
  return project;
}
export async function shared(t: string) {
  await ready();
  const [gift] = await db
    .select()
    .from(gifts)
    .where(and(eq(gifts.token, t), eq(gifts.revoked, 0)));
  if (!gift) throw new HttpError(404, "This gift link is no longer available.");
  return gift;
}
export async function rateLimit(key: string, limit: number, windowMs: number) {
  await transaction(async () => {
    const now = Date.now();
    await db.delete(rateLimits).where(lt(rateLimits.untilAt, now));
    const [current] = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, key));
    if (current && current.count >= limit)
      throw new HttpError(429, "A little pause, please. Try again later.");
    await db
      .insert(rateLimits)
      .values({ key, count: 1, untilAt: now + windowMs })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: sql`${rateLimits.count} + 1` },
      });
  });
}
export async function unlock(id: string, code: string) {
  await rateLimit("access-global", 30, 15 * 60_000);
  await rateLimit("access:" + id, 5, 15 * 60_000);
  if (!env.code)
    throw new HttpError(503, "The host has not configured creator access.");
  if (
    !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(digest(env.code)))
  )
    throw new HttpError(403, "That access code didn’t match.");
  await db.update(sessions).set({ unlocked: 1 }).where(eq(sessions.id, id));
}
