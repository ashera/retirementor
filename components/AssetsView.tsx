import Link from "next/link";
import type { RetirementPlan } from "@/lib/au/types";
import { getIncomeStreams, getInvestmentProperties, startingSuperBalances } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";

interface Item {
  label: string;
  value: number;
  sub?: string;
}

function Row({ label, value, sub, tone = "text-slate-200", strong = false }: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-line pt-2" : ""}`}>
      <span className={`text-sm ${strong ? "font-semibold text-white" : "text-slate-300"}`}>
        {label}
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${strong ? "font-bold text-white" : tone}`}>{value}</span>
    </div>
  );
}

export default function AssetsView({ name, plan }: { name: string; plan: RetirementPlan }) {
  const isCouple = plan.household === "couple";
  const superBals = startingSuperBalances(plan);
  const props = getInvestmentProperties(plan);
  const streams = getIncomeStreams(plan);
  const homeLoan = plan.mortgage?.balance ?? 0;
  const propName = (i: number) => props[i].name?.trim() || (props.length > 1 ? `Investment property ${i + 1}` : "Investment property");

  // ── Assets (today's defined values) ─────────────────────────────────────────
  const assets: Item[] = [];
  superBals.forEach((v, i) => {
    if (v <= 0 && superBals.length === 1) return;
    assets.push({ label: isCouple ? `Super — ${i === 0 ? "you" : "your partner"}` : "Super", value: v });
  });
  if (plan.homeowner && plan.home && plan.home.value > 0) {
    assets.push({
      label: "Home",
      value: plan.home.value,
      sub: homeLoan > 0 ? `net equity ${fmtCurrency(plan.home.value - homeLoan)} after the home loan` : "exempt from the Age Pension assets test",
    });
  }
  if ((plan.outsideSuper ?? 0) > 0) assets.push({ label: "Savings (outside super)", value: plan.outsideSuper });
  props.forEach((p, i) => {
    assets.push({
      label: propName(i),
      value: p.value,
      sub: p.loanBalance > 0 ? `net equity ${fmtCurrency(p.value - p.loanBalance)} after its loan` : `${p.grossYield}% gross yield`,
    });
  });

  // ── Liabilities ─────────────────────────────────────────────────────────────
  const liabilities: Item[] = [];
  if (homeLoan > 0) {
    const m = plan.mortgage!;
    liabilities.push({
      label: "Home loan",
      value: homeLoan,
      sub: `${m.interestRate}% · ${m.type === "interest_only" ? "interest-only" : "principal & interest"}`,
    });
  }
  props.forEach((p, i) => {
    if (p.loanBalance > 0) liabilities.push({ label: `${propName(i)} loan`, value: p.loanBalance, sub: `${p.loanRate}% · interest-only` });
  });

  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiab = liabilities.reduce((s, a) => s + a.value, 0);
  const net = totalAssets - totalLiab;

  const dr = plan.debtRecycle;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-muted transition hover:text-white">← Back to planner</Link>

      <header className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Assets &amp; liabilities</div>
        <h1 className="mt-1 text-3xl font-bold text-white">{name}</h1>
        <p className="mt-2 text-sm text-muted">Everything defined in this scenario, at today&apos;s values (today&apos;s dollars).</p>
      </header>

      {/* Net worth hero */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Net worth today</div>
          <div className="mt-0.5 text-3xl font-bold tabular-nums text-white">{fmtCurrency(net)}</div>
        </div>
        <div className="text-sm tabular-nums text-muted">
          {fmtCurrency(totalAssets)} in assets <span aria-hidden>−</span> {fmtCurrency(totalLiab)} in liabilities
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* Assets */}
        <section className="rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Assets</h2>
          {assets.length === 0 ? (
            <p className="py-2 text-xs text-muted">No assets defined yet.</p>
          ) : (
            <>
              {assets.map((a, i) => (
                <Row key={i} label={a.label} value={fmtCurrency(a.value)} sub={a.sub} tone="text-emerald-300" />
              ))}
              <Row label="Total assets" value={fmtCurrency(totalAssets)} strong />
            </>
          )}
        </section>

        {/* Liabilities */}
        <section className="rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Liabilities</h2>
          {liabilities.length === 0 ? (
            <p className="py-2 text-xs text-muted">No loans or debts defined — you&apos;re debt-free in this scenario.</p>
          ) : (
            <>
              {liabilities.map((l, i) => (
                <Row key={i} label={l.label} value={`−${fmtCurrency(l.value)}`} sub={l.sub} tone="text-rose-300" />
              ))}
              <Row label="Total liabilities" value={`−${fmtCurrency(totalLiab)}`} strong />
            </>
          )}
        </section>
      </div>

      {/* Income streams — income, not an asset, but part of the scenario. */}
      {streams.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Other income streams</h2>
          <p className="mb-1 text-[11px] text-muted">Ongoing income (a pension, annuity or distribution) — not a balance, so it isn&apos;t in net worth above.</p>
          {streams.map((s, i) => (
            <Row
              key={s.id || i}
              label={s.label?.trim() || `Income stream ${i + 1}`}
              value={`${fmtCurrency(s.perYear)}/yr`}
              sub={`from age ${s.fromAge}${s.untilAge ? ` to ${s.untilAge}` : " for life"}${s.indexed ? "" : " · not indexed"}`}
              tone="text-teal-300"
            />
          ))}
        </section>
      )}

      {/* Debt recycling — a planned geared loan, $0 today, so noted separately. */}
      {dr && dr.perYear > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Planned strategy — debt recycling</h2>
          <Row
            label="Geared share investment (deductible loan)"
            value={`${fmtCurrency(dr.perYear)}/yr`}
            sub={`borrowed at ${dr.loanRatePct}% until age ${dr.untilAge} — the loan builds up over time (it isn't a balance today, so it's excluded above)`}
            tone="text-amber-300"
          />
        </section>
      )}

      <p className="mt-6 text-[11px] leading-snug text-muted">
        Values are as entered, in today&apos;s dollars. Investment properties and the home are shown at their gross value with
        any loan listed as a liability, so net worth reflects your equity. Balances grow (or draw down) over time in the
        projection — this page is your starting position.
      </p>
    </main>
  );
}
