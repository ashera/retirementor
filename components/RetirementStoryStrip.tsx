"use client";

import Link from "next/link";
import Bert from "@/components/Bert";
import { ageGapInfo, agesAt } from "@/components/ageAxis";
import { fmtCompact } from "@/lib/au/format";
import { oldestCurrentAge, type RetirementPlan, type SimResult } from "@/lib/au/types";

// Spending-smile chapter colours — matched to the balance chart's bands so the two read
// as the same story told two ways.
const CH = { gogo: "#34d399", slowgo: "#f59e0b", nogo: "#a78bfa" } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Node {
  age: number; // oldest-person axis position
  label: string;
  tone: string; // dot colour
  who: "both" | 0 | 1; // whose event — "both" (shared-time, e.g. retire) shows both ages; a person index shows only that person's age
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
  // The projection horizon (oldest-person axis) — the last simulated row. For an
  // age-gapped couple the engine carries past the oldest's life expectancy to the
  // YOUNGER partner's, so use the real last row rather than plan.lifeExpectancy.
  const lastRowAge = result.rows.length ? result.rows[result.rows.length - 1].age : plan.lifeExpectancy;
  const life = Math.max(lastRowAge, retire + 1);
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

  // ── Milestone beats ────────────────────────────────────────────────────────
  // Per-person events (super unlocks, Age Pension) are attributed to the member they
  // apply to and show only THAT person's age. A couple reaches each at a different time,
  // so labelling both partners' ages would wrongly imply it happens to both at once
  // (e.g. the older "waiting" to 64 to unlock super, or the younger getting the pension
  // at 64). Shared-time beats (retire together, the final horizon) keep both ages.
  const anchor = oldestCurrentAge(plan);
  const people = plan.people;
  const multi = people.length > 1;
  const whoFor = (i: number): Node["who"] => (multi ? ((i === 0 ? 0 : 1) as 0 | 1) : "both");

  // Super unlocks — only for a member whose super unlocks AFTER they retire (someone who
  // retires before preservation age). Prefer the per-person array; fall back to the single.
  const suAges: (number | null)[] =
    (result.superUnlockAges ?? []).some((a) => a != null)
      ? result.superUnlockAges
      : result.superUnlockAge != null
        ? result.superUnlockIsPartner
          ? [null, result.superUnlockAge]
          : [result.superUnlockAge]
        : [];
  const suNodes: Node[] = suAges.flatMap((a, i) =>
    a != null && a > retire && a <= life ? [{ age: Math.round(a), label: "Super unlocks", tone: "#2dd4bf", who: whoFor(i) }] : [],
  );

  // Age Pension — the eligibility-age milestone, each partner at their own 67 (different
  // times). A universal life beat for residents, even if the means test pays $0 for a
  // while; hidden only when the household can't claim it at all (non-resident, not claiming).
  const claimsAgePension = plan.taxResidency !== "non-resident" || !!plan.claimAgePensionAbroad;
  const apNodes: Node[] = !claimsAgePension
    ? []
    : people.flatMap((p, i) => {
        const axisAge = Math.round(anchor + (result.agePensionAge - p.currentAge));
        return axisAge >= retire && axisAge <= life ? [{ age: axisAge, label: "Age Pension", tone: "#38bdf8", who: whoFor(i) }] : [];
      });

  // Aged care — a single-member event; attribute it to the member entering care.
  const acNode: Node | null =
    plan.agedCare?.enabled && plan.agedCare.entryAge >= retire && plan.agedCare.entryAge <= life
      ? { age: plan.agedCare.entryAge, label: "Aged care", tone: "#f472b6", who: whoFor(plan.agedCare.person ?? 0) }
      : null;

  const retireNode: Node = { age: retire, label: couple ? "You both retire" : "You retire", tone: "#e2e8f0", who: "both" };

  // How it ends — the emotional payoff beat (a shared time point → both ages).
  const endNode: Node =
    result.depletedAge != null
      ? { age: result.depletedAge, label: `Funds run low ~${result.depletedAge}`, tone: "#ef4444", who: "both" }
      : result.bridgeShortfallAge != null
        ? { age: life, label: `Lasts to ${life} · bridge gap`, tone: "#f59e0b", who: "both" }
        : { age: life, label: `Lasts to ${life}`, tone: "#34d399", who: "both" };

  // Sort, then drop near-duplicate ages (same-age couples collapse per-person beats to one).
  const nodes: Node[] = [];
  for (const n of [retireNode, ...suNodes, ...apNodes, ...(acNode ? [acNode] : []), endNode].sort((a, b) => a.age - b.age)) {
    if (!nodes.some((m) => Math.abs(m.age - n.age) < 0.5)) nodes.push(n);
  }

  // Age-gapped couples show the relevant age(s): "both" beats show both partners'
  // ("You 61 · Ptnr 58"); a per-person beat shows only that member's ("Ptnr · 60").
  const gap = ageGapInfo(plan);
  const ageSub = (n: Node): string => {
    if (!gap) return `age ${n.age}`;
    const { you, partner } = agesAt(gap, n.age);
    if (n.who === "both") return `You ${you} · Ptnr ${partner}`;
    return n.who === 0 ? `You · ${you}` : `Ptnr · ${partner}`;
  };
  const rAges = gap ? agesAt(gap, retire) : null;
  const retireRef = rAges ? `${rAges.you} and ${rAges.partner}` : `${retire}`;

  // A narrative teaser — the opening line of the story, trailing off so it reads straight
  // into the "Read year by year →" CTA. Mood-matched to the real outcome; falls back to a
  // number-free line if super at retirement isn't a usable figure yet.
  const who = couple ? "you both" : "you";
  const Who = couple ? "You both" : "You";
  // For an age-gapped couple the super-unlock age is on the oldest's axis, so drop the
  // specific figure to avoid implying it's both partners'.
  const unlockClause = gap ? "before your super unlocks" : `before super unlocks at ${result.superUnlockAge}`;
  const superOk = Number.isFinite(result.superAtRetirement) && result.superAtRetirement > 0;
  const superStr = fmtCompact(result.superAtRetirement);
  const teaser =
    result.depletedAge != null
      ? `${Who} retire at ${retireRef} — but there's a gap to close. See how the story goes…`
      : result.bridgeShortfallAge != null
        ? `${Who} retire at ${retireRef}, before your super unlocks — but the early years fall short. See the story…`
        : result.superUnlockAge != null && result.superUnlockAge > retire
          ? `${Who} retire at ${retireRef}, ${unlockClause} — see how the bridge holds…`
          : superOk
            ? `At ${retireRef}, ${who} finish work with ${superStr} behind you — then the years begin to unfold…`
            : `At ${retireRef}, ${who} step back from work — here's how the years unfold…`;

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
          <div className="line-clamp-2 text-[13px] leading-snug text-slate-200">{teaser}</div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-accent/20 sm:inline-flex">
          Read year by year <span aria-hidden className="text-accent transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>

      {/* Timeline track — scrolls on very narrow screens rather than squishing. */}
      <div className="mt-5 overflow-x-auto pb-1">
        <div className="relative" style={{ minWidth: gap ? 560 : 460 }}>
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
                <div key={`lbl-${i}`} className="absolute" style={{ left: `${left}%`, width: gap ? 104 : 92, top: lower ? 26 : 0, transform }}>
                  <div className="truncate text-[11px] font-semibold leading-tight text-slate-200" style={{ textAlign: align }}>{n.label}</div>
                  <div className="whitespace-nowrap text-[10px] leading-tight text-muted" style={{ textAlign: align }}>{ageSub(n)}</div>
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
