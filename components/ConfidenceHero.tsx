"use client";

import Link from "next/link";
import { fmtCurrency, fmtCompact } from "@/lib/au/format";
import { confidenceState, CONFIDENCE_EPS, type ConfidenceState } from "@/lib/au/confidence";

const ZONE = {
  bullet: "#0f9d6e",
  safe: "#34d399",
  amber: "#f59e0b",
  short: "#fb7185",
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A "what's already in this plan" chip: a committed life event or an applied strategy. */
export interface PlanChip {
  key: string;
  kind: "income" | "expense" | "strategy";
  label: string;
}

export interface ConfidenceHeroProps {
  goalTotal: number; // loan-inclusive annual income goal (today's $)
  loan: number; // ongoing home-loan cost baked into the goal
  central: number; // 50% tier, loan-inclusive (cheap — always present)
  safe: number; // 85% tier, loan-inclusive (falls back to central while pending)
  failsafe: number; // 95% tier, loan-inclusive (falls back to safe while pending)
  safeLiving: number; // living-only safe spend, applied by "Set my spend"
  confidencePct: number; // Monte Carlo chance the current goal lasts (0–100)
  assumedReturnPct: number; // the plan's assumed investment return (e.g. 7)
  lifeExpectancy: number;
  lastsToLE: boolean;
  depletedAge: number | null;
  pending: boolean; // safe/failsafe tiers recomputing after an edit (keep last numbers, shimmer)
  loading: boolean; // first load — no real safe/failsafe tier yet, so show a skeleton not fallbacks
  spendOverridden: boolean; // a What-If strategy sets spend → don't offer an inline set
  onSetSpend: (living: number) => void;
  whatIfHref: string;
  stressHref: string;
  // Folded-in scenario identity (see PlannerApp's Manage modal).
  scenarioName: string | null;
  hasNotes: boolean;
  onManage: (() => void) | null; // null in a read-only shared view
  dialExplainer?: React.ReactNode; // "how is this worked out?" affordance beside the dial
  // Signed-out "your plan is saved on this device only" prompt — shown in the right
  // column where a signed-out user has no scenario block (reclaims its old card).
  showSignupNudge?: boolean;
  onDismissNudge?: () => void;
  ioSlot?: React.ReactNode; // guest import/export buttons (local-first backup)
  chips?: PlanChip[]; // committed life events + applied strategies, shown at the foot
}

export default function ConfidenceHero({
  goalTotal,
  loan,
  central,
  safe,
  failsafe,
  safeLiving,
  confidencePct,
  assumedReturnPct,
  lifeExpectancy,
  lastsToLE,
  depletedAge,
  pending,
  loading,
  spendOverridden,
  onSetSpend,
  whatIfHref,
  stressHref,
  scenarioName,
  hasNotes,
  onManage,
  dialExplainer,
  showSignupNudge,
  onDismissNudge,
  ioSlot,
  chips,
}: ConfidenceHeroProps) {
  const state: ConfidenceState = confidenceState(goalTotal, { failsafe, safe, central });
  const headroom = safe - goalTotal; // + = room to spend more; − = above the safe level
  // One colour for the whole card's "where does your goal sit" signal — the range
  // zone, the dial and the verdict emphasis all use it: green at/below safe, amber
  // above safe, rose above central.
  const zoneColor =
    state === "ambitious" ? ZONE.amber : state === "short" ? ZONE.short : ZONE.safe;

  // ── Range positioning ──────────────────────────────────────────────────────
  // Zones anchor to the tier boundaries; the domain pads a little beyond failsafe
  // and central so the end markers aren't jammed against the edges. Guard the
  // degenerate case where the tiers collapse (a plan capped at the solver ceiling).
  const spread = Math.max(central - failsafe, goalTotal * 0.15, 8000);
  const lo = Math.min(failsafe, goalTotal) - spread * 0.28;
  const hi = Math.max(central, goalTotal) + spread * 0.14;
  const pos = (v: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
  const pFail = pos(failsafe);
  const pSafe = pos(safe);
  const pCent = pos(central);
  const pGoal = pos(goalTotal);
  // Bar ticks sit at the true positions, but the fixed-width tier CAPTIONS below would
  // overlap when tiers are close (e.g. failsafe ≈ safe on a strong plan). Spread the
  // caption anchors left-to-right to keep a minimum gap so their labels never collide.
  const labelPct = (() => {
    const MIN = 16; // min % between caption centres
    const p = [pFail, pSafe, pCent].map((x) => clamp(x, 6, 94));
    for (let i = 1; i < p.length; i++) if (p[i] - p[i - 1] < MIN) p[i] = p[i - 1] + MIN;
    const over = p[p.length - 1] - 94;
    if (over > 0) for (let i = 0; i < p.length; i++) p[i] = Math.max(6, p[i] - over);
    return p;
  })();
  const trackBg =
    `linear-gradient(90deg, ${ZONE.bullet} 0%, ${ZONE.bullet} ${pFail}%, ` +
    `${ZONE.safe} ${pFail}%, ${ZONE.safe} ${pSafe}%, ` +
    `${ZONE.amber} ${pSafe}%, ${ZONE.amber} ${pCent}%, ` +
    `${ZONE.short} ${pCent}%, ${ZONE.short} 100%)`;

  // ── Confidence dial ─────────────────────────────────────────────────────────
  // Colour by where the goal sits (zoneColor), so the donut matches the safe-spend
  // range and verdict; the label below still speaks to the likelihood %.
  const dialColor = zoneColor;
  const dialLabel = lastsToLE
    ? confidencePct >= 85
      ? "A high modelled chance, across market ups and downs."
      : confidencePct >= 60
        ? "A moderate modelled chance — not a sure thing."
        : "A real modelled risk of running short before your planning age."
    : depletedAge != null
      ? `On the assumed ${assumedReturnPct}% return, funds run low around age ${depletedAge}.`
      : "A modelled risk of running short before your planning age.";

  // ── Verdict copy ────────────────────────────────────────────────────────────
  const goalStr = fmtCurrency(goalTotal);
  const overspend = goalTotal - safe; // positive when spending above the safe level
  const eyebrow = "Retirement confidence · your plan today";
  // Copy is framed as modelled ESTIMATES, not conclusions/assurances — this is a
  // general-information calculator (ASIC Instrument 2022/603 / RG 276), not advice.
  let verdict: React.ReactNode;
  if (state === "bulletproof") {
    verdict = (
      <>
        Your plan looks <b>very resilient</b> — even the worst market on record funds your {goalStr} retirement income goal
        {headroom >= CONFIDENCE_EPS ? <>, with modelled room for <b>~{fmtCurrency(headroom)}/yr more</b></> : null}.
      </>
    );
  } else if (state === "safe") {
    verdict =
      headroom >= CONFIDENCE_EPS ? (
        <>
          Your plan is <b>projected to fund</b> your {goalStr} retirement income goal — with modelled room for{" "}
          <b>~{fmtCurrency(headroom)}/yr more</b> at the same 85% confidence.
        </>
      ) : (
        <>
          Your plan is <b>projected to fund</b> your {goalStr} retirement income goal — it sits right at your{" "}
          <b>prudent (85%) spending level</b>, modelled to last to your planning age of {lifeExpectancy} in
          about 85% of return scenarios, including poor ones.
        </>
      );
  } else if (state === "ambitious") {
    verdict = (
      <>
        Your {goalStr} retirement income goal is funded on the assumed {assumedReturnPct}% return, but sits{" "}
        <b>above your prudent (85%) level</b> — a higher modelled chance of running short if markets disappoint.
      </>
    );
  } else {
    verdict = (
      <>
        Your {goalStr} retirement income goal is <b>above even the central (50%) estimate</b>. Easing toward{" "}
        {fmtCompact(safe)}, or strengthening the plan, brings it back within your prudent (85%) level.
      </>
    );
  }

  // "Set my spend to the safe level" — up when there's headroom, down when over it.
  // Shown whenever the goal is meaningfully off the safe level. When a What-If strategy
  // owns the spend (spendOverridden), editing the base plan here would be a no-op, so
  // the button instead routes to What-If where that lever can be changed.
  const showSet = Math.abs(headroom) >= CONFIDENCE_EPS;
  const setVerb = headroom > 0 ? `Set my spend to ${fmtCompact(safe)}` : `Trim to ${fmtCompact(safe)}`;
  const setLabel = spendOverridden ? `${setVerb} in What-If` : setVerb;
  // The "leaving money on the table" nudge — only where there's real headroom.
  const showNudge = (state === "bulletproof" || state === "safe") && headroom >= 3000;

  // Active-scenario name: allow up to 50 characters (wrapping to two lines in the
  // column) before hard-truncating with an ellipsis.
  const fullName = scenarioName ?? "Working scenario";
  const displayName = fullName.length > 50 ? `${fullName.slice(0, 50).trimEnd()}…` : fullName;

  const marker = (leftPct: number, tone: string, big: string, small: string, note: string) => (
    <div
      className="absolute -translate-x-1/2 text-center"
      style={{ left: `${clamp(leftPct, 6, 94)}%`, width: 110 }}
    >
      <div className="text-[15px] font-bold tabular-nums text-white">{big}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone }}>{small}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-muted">{note}</div>
    </div>
  );

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-panel-2 to-panel p-6 shadow-xl sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        {/* ── LEFT: the answer ───────────────────────────────────────────── */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>

          {loading ? (
            /* First load: the Monte Carlo safe/failsafe tiers take a moment. Show a
               skeleton instead of the deterministic fallbacks, which would flash an
               over-optimistic verdict/range before snapping to the real numbers. */
            <div aria-busy="true">
              <div className="mt-2 flex items-center gap-2.5 text-slate-300">
                <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                <span className="text-lg font-semibold">Assessing your plan…</span>
              </div>
              <p className="mt-2 max-w-[38ch] text-sm text-muted">
                Working out the most you could safely spend and how likely your money is to last.
              </p>
              <div className="mt-6 h-4 w-full animate-pulse rounded-full bg-panel-2" />
              <div className="mt-3 flex gap-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-1 animate-pulse space-y-1.5">
                    <div className="h-4 w-14 rounded bg-panel-2" />
                    <div className="h-2.5 w-20 rounded bg-panel-2/60" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
          <p
            className="mt-2 text-xl font-semibold leading-snug text-white text-pretty sm:text-[26px] [&_b]:text-[color:var(--vc)]"
            style={{ "--vc": zoneColor } as React.CSSProperties}
          >
            {verdict}
          </p>

          {/* Three-tier range */}
          <div className={`mt-6 ${pending ? "animate-pulse opacity-70" : ""}`}>
            <div className="relative h-4 rounded-full shadow-inner" style={{ background: trackBg }}>
              {/* goal marker */}
              <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: `${clamp(pGoal, 4, 96)}%` }}>
                <span className="rounded-md border border-line bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
                  Your income goal {fmtCompact(goalTotal)}
                </span>
                <div className="text-[11px] leading-none text-white">▼</div>
              </div>
              {[pFail, pSafe, pCent].map((p, i) => (
                <div key={i} className="absolute -top-1.5 h-7 w-0.5 bg-ink/60" style={{ left: `${p}%` }} />
              ))}
            </div>
            <div className="relative mt-2 h-11">
              {marker(labelPct[0], ZONE.bullet, fmtCompact(failsafe), "Failsafe", "survives worst history")}
              {marker(labelPct[1], ZONE.safe, fmtCompact(safe), "Prudent · 85%", "≈85% of runs last")}
              {marker(labelPct[2], ZONE.amber, fmtCompact(central), "Central · 50%", `on ${assumedReturnPct}% returns`)}
            </div>
          </div>

          {showNudge && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
              <span aria-hidden className="text-base">💡</span>
              <p className="text-[13px] leading-snug text-slate-200">
                At the same 85% confidence, your plan models capacity for about{" "}
                <b className="text-amber-300">{fmtCurrency(headroom)}/yr</b> more than your current goal.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            {showSet &&
              (spendOverridden ? (
                // A What-If lever owns the spend — send them there to change it.
                <Link
                  href={whatIfHref}
                  className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
                >
                  {setLabel} <span aria-hidden>→</span>
                </Link>
              ) : (
                <button
                  onClick={() => onSetSpend(safeLiving)}
                  className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
                >
                  {setLabel} <span aria-hidden>→</span>
                </button>
              ))}
            <Link
              href={whatIfHref}
              className="rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-accent/50 hover:text-white"
            >
              Boost it with What-If&apos;s <span aria-hidden className="text-accent">→</span>
            </Link>
            <Link
              href={stressHref}
              className="rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-accent/50 hover:text-white"
            >
              Pressure test it with History <span aria-hidden className="text-accent">→</span>
            </Link>
          </div>
          </>
          )}
        </div>

        {/* ── RIGHT: confidence dial + folded-in scenario ─────────────────── */}
        <div className="flex flex-col gap-4 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex items-center gap-3">
            <div
              className="relative grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(${dialColor} ${confidencePct}%, #263048 ${confidencePct}% 100%)` }}
            >
              <div className="absolute inset-[7px] rounded-full bg-panel" />
              <span className="relative text-lg font-bold tabular-nums text-white">{confidencePct}%</span>
            </div>
            <p className="min-w-0 flex-1 text-xs leading-snug text-muted">
              <b className="font-semibold text-slate-200">
                {lastsToLE ? `Chance your money lasts to ${lifeExpectancy}+` : "Chance your money lasts"}
              </b>{" "}
              — {dialLabel}
            </p>
            {dialExplainer && <span className="shrink-0 self-start">{dialExplainer}</span>}
          </div>

          {/* Only signed-in users (who can Manage) get the active-scenario block —
              a signed-out guest has no named scenario to show or manage. */}
          {onManage && (
            <div className="border-t border-dashed border-line pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/70">Active scenario</div>
              {/* Full column width + up to two lines so ~50 characters can show before
                  the ellipsis (the name is also hard-capped at 50 chars). */}
              <div
                className="mt-1 line-clamp-2 break-words text-[15px] font-bold leading-snug text-white"
                title={scenarioName ?? undefined}
              >
                {displayName}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted/70">
                  saved automatically{hasNotes ? " · 📝 has notes" : ""}
                </span>
                {onManage && (
                  <button
                    onClick={onManage}
                    className="shrink-0 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-accent/50 hover:text-white"
                  >
                    ⚙ Manage
                  </button>
                )}
              </div>
            </div>
          )}

          {showSignupNudge && (
            <div className="relative border-t border-dashed border-line pt-4">
              {onDismissNudge && (
                <button
                  onClick={onDismissNudge}
                  aria-label="Dismiss"
                  className="absolute right-0 top-3 rounded p-1 text-muted/60 transition hover:text-white"
                >
                  ✕
                </button>
              )}
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300/80">
                💾 Saved on this device only
              </div>
              <p className="mt-1.5 pr-4 text-xs leading-snug text-muted">
                Create a free account to keep your plan safe and pick up where you left off on any device.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Link
                  href="/signup"
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
                >
                  Create free account
                </Link>
                <Link href="/login" className="text-xs font-medium text-slate-300 transition hover:text-white">
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {ioSlot && (
            <div className="border-t border-dashed border-line pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/70">
                Back up your plan
              </div>
              <div className="mt-2 flex flex-wrap gap-2">{ioSlot}</div>
            </div>
          )}
        </div>
      </div>

      {/* What's already baked into the numbers above — committed life events and
          applied What-If strategies (moved here from the old What-If promo card). */}
      {chips && chips.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            What-if boosts and life events already applied to this scenario
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={whatIfHref}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:brightness-125 ${
                  c.kind === "expense"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                    : "border-accent/40 bg-accent/10 text-accent"
                }`}
                title={c.kind === "strategy" ? "Edit this strategy in What-If" : "Edit this life event in What-If"}
              >
                <span aria-hidden>{c.kind === "strategy" ? "✓" : "📌"}</span>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
