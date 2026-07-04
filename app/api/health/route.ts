import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Always evaluated per request — never statically cached or prerendered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("db ping timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Liveness + readiness probe for Railway's health check.
 * Returns 200 only when the app can reach its database; 503 otherwise, so a
 * deploy that can't talk to Postgres is never routed traffic.
 */
export async function GET() {
  let db: "up" | "down" = "down";
  try {
    await withTimeout(pool.query("select 1"), DB_TIMEOUT_MS);
    db = "up";
  } catch {
    db = "down";
  }

  const ok = db === "up";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      db,
      uptime: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
