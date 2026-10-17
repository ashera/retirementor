"use client";

import Link from "next/link";
import Bert from "@/components/Bert";
import type { RetirementPlan, SimResult } from "@/lib/au/types";

// Spending-smile chapter colours — matched to the balance chart's bands so the two read
// as the same story told two ways.
const CH = { gogo: "#34d399", slowgo: "#f59e0b", nogo: "#a78bfa" } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Node {
  age: number;
  label: string;
  tone: string; // dot colour
}

/**
 * A compact, milestone-driven timeline of the retirement — the Go-go / Slow-go / No-go
 * chapters as coloured segments, with the key beats (retire, super unlocks, Age Pension,
 * aged care, how it ends) pinned along it. The whole strip links to the full narrated
 * story (/timeline). Distinct from the balance chart: this is the subway map, not the
 * balance line — a glanceable "here's your journey, tap to read it".
 */
export default function RetirementStoryStrip({
  plan,
  result,
  href,
  couple,
}: {
  plan: RetirementPlan;
  result: SimResult;
  href: string;
  couple: boolean;
}) {
  const retire = result.retirementAge;
  const life = Math.max(plan.lifeExpectancy, retire + 1);
  const span = life - retire || 1;
  const pos = (age: number) => clamp(((age - retire) / span) * 100, 0, 100);

  const staged = plan.spendingMode === "stages";
  const s = plan.spendingStages;
  // Chapters as [from,to) segments; clipped to the horizon and only kept if non-empty.
  const chapters = (
    staged
      ? [
          { label: "Go-go", from: retire, to: Math.min(s.slowGoAge, life), color: CH.gogo },
          { label: "Slow-go", from: Math.max(retire, s.slowGoAge), to: Math.min(s.noGoAge, life), color: CH.slowgo },
          { label: "No-go", from: Math.max(retire, s.noGoAge), to: life, color: CH.nogo },
        ]
      : [{ label: "Retirement", from: retire, to: life, color: CH.gogo }]
  ).filter((c) => c.to > c.from + 0.01);

  // Milestone beats along the line (deduped by age; only those within the horizon).
  const agedCare = plan.agedCare?.enabled ? plan.agedCare.entryAge : null;
  const pensionAge = result.firstAgePensionAge ?? result.agePensionAge;
  const raw: (Node | null)[] = [
    { age: retire, label: couple ? "You both retire" : "You retire", tone: "#e2e8f0" },
    result.superUnlockAge != null && result.superUnlockAge > retire
      ? { age: result.superUnlockAge, label: "Super unlocks", tone: "#2dd4bf" }
      : null,
    pensionAge != null && pensionAge >= retire && pensionAge <= life
      ? { age: pensionAge, label: "Age Pension", tone: "#38bdf8" }
      : null,
    agedCare != null && agedCare >= retire && agedCare <= life
      ? { age: agedCare, label: "Aged care", tone: "#f472b6" }
      : null,
  ];
  // How it ends — the emotional payoff beat.
  const endNode: Node =
    result.depletedAge != null
      ? { age: result.depletedAge, label: `Funds run low ~${result.depletedAge}`, tone: "#ef4444" }
      : result.bridgeShortfallAge != null
        ? { age: life, label: `Lasts to ${life} · bridge gap`, tone: "#f59e0b" }
        : { age: life, label: `Lasts to ${life}`, tone: "#34d399" };

  // Build the final node list, drop near-duplicate ages, keep sorted.
  const nodes: Node[] = [];
  for (const n of [...raw.filter(Boolean) as Node[], endNode].sort((a, b) => a.age - b.age)) {
    if (!nodes.some((m) => Math.abs(m.age - n.age) < 0.5)) nodes.push(n);
  }

  const headline =
    result.depletedAge != null
      ? `Retire at ${retire} · a gap to close`
      : `Retire at ${retire} · your money lasts to ${life}`;

  return (
    <Link
      href={href}
      className="group mb-6 block overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-panel-2 to-panel p-5 shadow-sm transition hover:border-accent/60 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bert pose="bicycle" size={44} className="shrink-0 transition-transform group-hover:-translate-y-0.5" priority />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden>📖</span>
            <span className="text-sm font-bold uppercase tracking-[0.1em] text-accent">
              {couple ? "Our retirement story" : "Your retirement story"}
            </span>
          </div>
          <div className="truncate text-[13px] text-muted">{headline}</div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-accent/20 sm:inline-flex">
          Read year by year <span aria-hidden className="text-accent transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>

      {/* Timeline track — scrolls on very narrow screens rather than squishing. */}
      <div className="mt-5 overflow-x-auto pb-1">
        <div className="relative min-w-[460px]">
          {/* Milestone labels ABOVE the track — staggered onto two rows so adjacent beats
              (often only a year or two apart, e.g. retire then super unlocks) never collide.
              A faint tick connects each label to its dot on the track below. */}
          <div className="relative h-14">
            {nodes.map((n, i) => {
              const left = clamp(pos(n.age), 0, 100);
              const lower = i % 2 === 1; // alternate rows so adjacent labels don't collide
              // Edge labels anchor to their edge (not centred) so they never overflow the strip.
              // Anchor by POSITION, not index — any beat near an edge aligns to it so its
              // label can't overflow the strip (matters most on narrow screens).
              const anchor = left < 12 ? "start" : left > 88 ? "end" : "mid";
              const transform = anchor === "start" ? "none" : anchor === "end" ? "translateX(-100%)" : "translateX(-50%)";
              const align = anchor === "start" ? "left" : anchor === "end" ? "right" : "center";
              const connector = anchor === "start" ? { left: 1 } : anchor === "end" ? { right: 1 } : { left: "50%", transform: "translateX(-50%)" };
              return (
                <div key={`lbl-${i}`} className="absolute" style={{ left: `${left}%`, width: 92, top: lower ? 26 : 0, transform }}>
                  <div className="truncate text-[11px] font-semibold leading-tight text-slate-200" style={{ textAlign: align }}>{n.label}</div>
                  <div className="text-[10px] leading-tight text-muted" style={{ textAlign: align }}>age {n.age}</div>
                  <div className="absolute w-px bg-line" style={{ top: "100%", height: lower ? 4 : 30, ...connector }} aria-hidden />
                </div>
              );
            })}
          </div>

          {/* The track: coloured chapter segments + milestone dots */}
          <div className="relative h-2.5 rounded-full bg-panel-2">
            {chapters.map((c, i) => (
              <div
                key={`ch-${i}`}
                className="absolute top-0 h-full"
                style={{
                  left: `${pos(c.from)}%`,
                  width: `${pos(c.to) - pos(c.from)}%`,
                  background: c.color,
                  borderRadius: 999,
                  opacity: 0.9,
                }}
                title={`${c.label} years`}
              />
            ))}
            {nodes.map((n, i) => (
              <div
                key={`dot-${i}`}
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink"
                style={{ left: `${clamp(pos(n.age), 1, 99)}%`, background: n.tone }}
              />
            ))}
          </div>

          {/* Chapter labels BELOW the track */}
          <div className="relative mt-2 h-4">
            {chapters.map((c, i) => {
              const mid = (pos(c.from) + pos(c.to)) / 2;
              return (
                <div
                  key={`clab-${i}`}
                  className="absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wide"
                  style={{ left: `${clamp(mid, 6, 94)}%`, color: c.color }}
                >
                  {c.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile CTA (the header one is hidden on small screens) */}
      <div className="mt-3 flex sm:hidden">
        <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-white">
          Read your story year by year <span aria-hidden className="text-accent">→</span>
        </span>
      </div>
    </Link>
  );
}
