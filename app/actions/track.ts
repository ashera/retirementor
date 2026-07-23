"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { lookupGeoDetail } from "@/lib/geo";
import { classifyBot } from "@/lib/botDetect";

const VISITOR_COOKIE = "rw_visitor";
const VISITOR_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export type VisitEvent = "visit" | "super" | "budget" | "whatif" | "stress";

interface TrackInput {
  event: VisitEvent;
  // Only meaningful for the "super"/"budget" milestones; captured as a value too.
  value?: number;
  // Client automation signal (navigator.webdriver) — a strong bot indicator that
  // headless scrapers can't easily hide, even when they spoof a normal UA.
  webdriver?: boolean;
}

/** Pull best-effort location from whatever the proxy/CDN injected. Railway sits
 *  behind Cloudflare-style edges for some setups; we read the common header names
 *  and keep whatever's present (all null is fine — we just store what we have). */
async function readContext() {
  const h = await headers();
  const first = (v: string | null) => (v ? v.split(",")[0].trim() : null);
  const ip =
    first(h.get("x-forwarded-for")) ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null;
  // Prefer a proxy-provided geo header when present (Cloudflare/Vercel); otherwise
  // resolve the country/region/city from the IP with the offline GeoLite database —
  // this is what actually populates on Railway, whose edge doesn't tag geo.
  const geo = lookupGeoDetail(ip);
  const cfCountry = h.get("cf-ipcountry");
  const vercelCountry = h.get("x-vercel-ip-country");
  const hdrCountry = cfCountry || vercelCountry || null;
  const hdrRegion = h.get("x-vercel-ip-country-region") || h.get("cf-region") || null;
  const hdrCity = h.get("cf-ipcity") || h.get("x-vercel-ip-city") || null;
  const country = hdrCountry || geo?.country || null;
  const region = hdrRegion ? decodeURIComponent(hdrRegion) : geo?.region || null;
  const city = hdrCity ? decodeURIComponent(hdrCity) : geo?.city || null;
  // Record how `country` was determined so the admin can see the basis.
  const geoSource = !country
    ? null
    : hdrCountry
      ? `header:${cfCountry ? "cf-ipcountry" : "x-vercel-ip-country"}`
      : "geoip";
  const locale = first(h.get("accept-language"));
  const ua = h.get("user-agent");
  return {
    ip: ip?.slice(0, 60) ?? null,
    country: country?.slice(0, 4) ?? null,
    region: region?.slice(0, 80) ?? null,
    city: city?.slice(0, 120) ?? null,
    geo_source: geoSource,
    lat: geo?.coordinates?.[0] ?? null,
    lon: geo?.coordinates?.[1] ?? null,
    locale: locale?.slice(0, 40) ?? null,
    user_agent: ua?.slice(0, 400) ?? null,
  };
}

function cleanAmount(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  // Guard against absurd inputs; store to the nearest dollar.
  return Math.round(Math.min(Math.max(v, 0), 1_000_000_000));
}

/**
 * Record a milestone in the anonymous-visitor funnel. No-op for signed-in users
 * (except that a signed-in request with a lingering visitor cookie marks that
 * browser as converted and stops tracking it). Never throws to the caller — a
 * tracking failure must never break the page.
 */
export async function trackVisit(input: TrackInput): Promise<void> {
  try {
    const store = await cookies();
    const key = store.get(VISITOR_COOKIE)?.value ?? null;

    // Only track signed-out visitors. Conversion (marking a visitor as signed-up
    // and dropping the cookie) is handled once at sign-in, in createSession.
    const user = await getCurrentUser();
    if (user) return;

    // Ensure a stable visitor key + cookie. If the client already set one (so its
    // events could attach immediately), adopt that key and (re)set it httpOnly so
    // it's no longer JS-readable.
    let visitorKey = key;
    {
      if (!visitorKey) visitorKey = randomBytes(18).toString("base64url");
      store.set(VISITOR_COOKIE, visitorKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(Date.now() + VISITOR_TTL_MS),
      });
    }

    const ctx = await readContext();
    const amount = cleanAmount(input.value);
    const isVisit = input.event === "visit";
    const bot = classifyBot(ctx.user_agent, { webdriver: input.webdriver });

    await query(
      `insert into visitors (
         visitor_key, first_seen_at, last_seen_at, visits,
         set_super_balance, super_balance, set_budget_income, budget_income,
         visited_what_if, visited_stress_test,
         country, region, city, ip, locale, user_agent, geo_source, lat, lon,
         is_bot, bot_reason
       ) values (
         $1, now(), now(), 1,
         $2, $3, $4, $5,
         $6, $7,
         $8, $9, $10, $11, $12, $13, $14, $16, $17,
         $18, $19
       )
       on conflict (visitor_key) do update set
         last_seen_at = now(),
         visits = visitors.visits + $15,
         is_bot = coalesce(visitors.is_bot, false) or $18,
         bot_reason = coalesce(visitors.bot_reason, $19),
         set_super_balance = visitors.set_super_balance or excluded.set_super_balance,
         super_balance = coalesce(excluded.super_balance, visitors.super_balance),
         set_budget_income = visitors.set_budget_income or excluded.set_budget_income,
         budget_income = coalesce(excluded.budget_income, visitors.budget_income),
         visited_what_if = visitors.visited_what_if or excluded.visited_what_if,
         visited_stress_test = visitors.visited_stress_test or excluded.visited_stress_test,
         country = coalesce(excluded.country, visitors.country),
         region = coalesce(excluded.region, visitors.region),
         city = coalesce(excluded.city, visitors.city),
         ip = coalesce(excluded.ip, visitors.ip),
         locale = coalesce(excluded.locale, visitors.locale),
         user_agent = coalesce(excluded.user_agent, visitors.user_agent),
         geo_source = coalesce(excluded.geo_source, visitors.geo_source),
         lat = coalesce(excluded.lat, visitors.lat),
         lon = coalesce(excluded.lon, visitors.lon)`,
      [
        visitorKey,
        input.event === "super",
        input.event === "super" ? amount : null,
        input.event === "budget",
        input.event === "budget" ? amount : null,
        input.event === "whatif",
        input.event === "stress",
        ctx.country,
        ctx.region,
        ctx.city,
        ctx.ip,
        ctx.locale,
        ctx.user_agent,
        ctx.geo_source,
        isVisit ? 1 : 0,
        ctx.lat,
        ctx.lon,
        bot.isBot,
        bot.reason,
      ],
    );
  } catch {
    // Analytics is best-effort; swallow everything so tracking can never break
    // the page it's attached to.
  }
}

const MAX_EVENTS_PER_VISITOR = 800; // storage guard against a runaway/hostile client

/**
 * Append one action to a signed-out visitor's activity log (page views + named UI
 * events tee'd from the client analytics). Identity comes from the rw_visitor cookie
 * that trackVisit establishes — if it isn't set yet we skip, so this never creates a
 * competing visitor row. No-op for signed-in users. Best-effort; never throws.
 */
export async function logVisitorEvent(input: {
  event: string;
  path?: string;
  props?: Record<string, unknown>;
}): Promise<void> {
  try {
    const event = (input.event || "").slice(0, 80);
    if (!event) return;

    const store = await cookies();
    const key = store.get(VISITOR_COOKIE)?.value;
    if (!key) return; // trackVisit owns identity; no cookie yet → skip

    const user = await getCurrentUser();
    if (user) return;

    const path = input.path ? input.path.slice(0, 200) : null;
    let props: string | null = null;
    if (input.props && typeof input.props === "object") {
      try {
        const s = JSON.stringify(input.props);
        if (s && s.length <= 2000) props = s;
      } catch {
        /* non-serialisable props — drop them */
      }
    }

    await query(
      `insert into visitor_events (visitor_id, event, path, props)
         select v.id, $2, $3, $4::jsonb from visitors v
          where v.visitor_key = $1
            and (select count(*) from visitor_events e where e.visitor_id = v.id) < ${MAX_EVENTS_PER_VISITOR}`,
      [key, event, path, props],
    );
    await query("update visitors set last_seen_at = now() where visitor_key = $1", [key]);
  } catch {
    /* best-effort */
  }
}
