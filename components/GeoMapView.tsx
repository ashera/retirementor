"use client";

import { useMemo, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import CountryFlag from "@/components/CountryFlag";
import { countryName } from "@/lib/countryName";
import { NUMERIC_TO_ALPHA2 } from "@/lib/isoNumeric";
import world from "@/lib/world-110m.json";
import type { CountryCount } from "@/lib/adminGeoCounts";

const W = 900;
const H = 450;

type Metric = "all" | "users" | "visitors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any;
const FEATURES: { id: string; name: string; d: string | null }[] = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = feature(topo, topo.objects.countries) as any;
  const projection = geoEqualEarth().fitExtent(
    [
      [8, 8],
      [W - 8, H - 8],
    ],
    fc,
  );
  const path = geoPath(projection);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fc.features.map((f: any) => ({
    id: String(f.id).padStart(3, "0"),
    name: f.properties?.name ?? "",
    d: path(f),
  }));
})();

function valueFor(c: CountryCount | undefined, metric: Metric): number {
  if (!c) return 0;
  return metric === "users" ? c.users : metric === "visitors" ? c.visitors : c.users + c.visitors;
}

export default function GeoMapView({ counts }: { counts: CountryCount[] }) {
  const [metric, setMetric] = useState<Metric>("all");

  const byAlpha2 = useMemo(() => {
    const m = new Map<string, CountryCount>();
    for (const c of counts) m.set(c.country, c);
    return m;
  }, [counts]);

  const max = useMemo(
    () => Math.max(1, ...counts.map((c) => valueFor(c, metric))),
    [counts, metric],
  );

  const ranked = useMemo(
    () =>
      [...counts]
        .map((c) => ({ ...c, v: valueFor(c, metric) }))
        .filter((c) => c.v > 0)
        .sort((a, b) => b.v - a.v),
    [counts, metric],
  );

  const totals = useMemo(() => {
    const users = counts.reduce((s, c) => s + c.users, 0);
    const visitors = counts.reduce((s, c) => s + c.visitors, 0);
    return { users, visitors, countries: counts.length };
  }, [counts]);

  const fillFor = (alpha2: string | undefined) => {
    const v = valueFor(alpha2 ? byAlpha2.get(alpha2) : undefined, metric);
    if (v <= 0) return "#141c2e";
    const t = Math.sqrt(v / max); // sqrt so small counts stay visible
    const a = 0.2 + 0.8 * t;
    return `rgba(45, 212, 191, ${a.toFixed(3)})`;
  };

  const seg = (m: Metric, label: string) => (
    <button
      type="button"
      onClick={() => setMetric(m)}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        metric === m ? "bg-accent font-semibold text-ink" : "font-medium text-muted hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg border border-line bg-panel-2 p-1">
          {seg("all", "All")}
          {seg("users", `Accounts (${totals.users})`)}
          {seg("visitors", `Visitors (${totals.visitors})`)}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Fewer</span>
          <span className="h-3 w-24 rounded" style={{ background: "linear-gradient(90deg, #141c2e, rgba(45,212,191,1))" }} />
          <span>More</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="World map of user and visitor locations">
            <g>
              {FEATURES.map((f, i) => {
                if (!f.d) return null;
                const alpha2 = NUMERIC_TO_ALPHA2[f.id];
                const c = alpha2 ? byAlpha2.get(alpha2) : undefined;
                return (
                  <path
                    key={i}
                    d={f.d}
                    fill={fillFor(alpha2)}
                    stroke="#243049"
                    strokeWidth={0.5}
                    className="transition-[fill] hover:stroke-accent"
                  >
                    <title>
                      {f.name}
                      {c ? ` — ${c.users} account${c.users === 1 ? "" : "s"}, ${c.visitors} visitor${c.visitors === 1 ? "" : "s"}` : " — none"}
                    </title>
                  </path>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Top locations
          </div>
          <ul className="max-h-[430px] divide-y divide-line/60 overflow-y-auto">
            {ranked.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No location data yet.</li>}
            {ranked.map((c) => (
              <li key={c.country} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <CountryFlag code={c.country} showName />
                </span>
                <span className="shrink-0 tabular-nums text-slate-200" title={`${c.users} accounts · ${c.visitors} visitors`}>
                  {c.v}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Countries are shaded by count ({metric === "all" ? "accounts + visitors" : metric}). Hover a country for its
        breakdown. Locations come from IP geolocation (see any flag for the basis); a handful of small territories may
        appear in the list but not on the map.
      </p>
    </>
  );
}
