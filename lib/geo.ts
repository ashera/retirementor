import "server-only";
import geoip from "geoip-lite";

export interface GeoResult {
  country: string | null; // 2-letter ISO code, e.g. "AU"
  region: string | null;
  city: string | null;
}

/** Best-effort IP → location via the bundled MaxMind GeoLite data (fully offline —
 *  no network call, no rate limit, no third-party IP sharing). Returns nulls for
 *  private / loopback / unknown IPs. Country is a 2-letter ISO code. */
export function lookupGeo(ip: string | null | undefined): GeoResult | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, "").trim(); // unwrap IPv4-mapped IPv6
  if (!clean || clean === "::1" || clean === "127.0.0.1") return null;
  try {
    const r = geoip.lookup(clean);
    if (!r || !r.country) return null;
    return { country: r.country, region: r.region || null, city: r.city || null };
  } catch {
    return null;
  }
}

/** Just the country code for an IP (convenience). */
export function countryFromIp(ip: string | null | undefined): string | null {
  return lookupGeo(ip)?.country ?? null;
}
