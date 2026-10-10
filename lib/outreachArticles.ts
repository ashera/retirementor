import { SITE_URL } from "./site";

// The /learn articles the Reddit-outreach pipeline matches, and the prefill params
// each one's calculator accepts. Mirrors the ARTICLES registry in
// scripts/reddit-match.mjs — keep the field keys in sync with the calculators'
// URL-param reading. Used by the admin editor (field schema) and the server action
// (rebuild the prefilled link from edited values). Safe to import on the client.
export interface OutreachField {
  key: string;
  label: string;
  min: number;
  max: number;
}
export interface OutreachArticle {
  path: string;
  fields: OutreachField[];
}

export const OUTREACH_ARTICLES: Record<string, OutreachArticle> = {
  "super-on-track": {
    path: "/learn/super-on-track",
    fields: [
      { key: "age", label: "Age", min: 18, max: 66 },
      { key: "super", label: "Super $", min: 0, max: 5_000_000 },
      { key: "income", label: "Income $/yr", min: 0, max: 1_000_000 },
    ],
  },
  "average-australian": {
    path: "/learn/average-australian-retirement",
    fields: [
      { key: "age", label: "Age", min: 18, max: 60 },
      { key: "retire", label: "Retire at", min: 50, max: 75 },
      { key: "income", label: "Income $/yr", min: 0, max: 1_000_000 },
      { key: "super", label: "Super $", min: 0, max: 5_000_000 },
    ],
  },
  "early-super": {
    path: "/learn/early-super-access",
    fields: [
      { key: "age", label: "Age", min: 18, max: 66 },
      { key: "retire", label: "Retire at", min: 50, max: 75 },
      { key: "oneoff", label: "One-off $", min: 0, max: 100_000 },
    ],
  },
};

/** Build the prefilled page link for an article from a set of parsed values. Only
 *  valid, in-range numbers are included; null/absent fields are left off (so the
 *  calculator falls back to its defaults). */
export function buildPrefilledUrl(slug: string, parsed: Record<string, number | null | undefined>): string {
  const a = OUTREACH_ARTICLES[slug];
  const base = `${SITE_URL}${a ? a.path : ""}`;
  if (!a) return base;
  const qs = new URLSearchParams();
  for (const f of a.fields) {
    const v = parsed[f.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) qs.set(f.key, String(Math.round(v)));
  }
  // early-super: a one-off amount implies the one-off mode.
  if (slug === "early-super" && qs.has("oneoff")) qs.set("mode", "oneoff");
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
