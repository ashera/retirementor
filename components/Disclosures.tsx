"use client";

import { useState } from "react";
import type { EngineConfig } from "@/lib/au/config";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/**
 * ASIC generic-calculator disclosures. Renders a prominent "general
 * information / not advice" statement and an Assumptions & limitations dialog
 * covering the conditions of ASIC Corporations (Generic Calculators)
 * Instrument 2026/41: reasonable assumptions and why, significant limitations
 * and their impact, inflation treatment, no product promotion, and the ability
 * to print/save the results.
 */
export default function Disclosures({ config }: { config: EngineConfig }) {
  const [open, setOpen] = useState(false);
  const ap = config.agePension;

  return (
    <>
      <section
        aria-label="Important information"
        className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/90"
      >
        <p>
          <strong className="font-semibold text-amber-200">
            General information only — not financial advice.
          </strong>{" "}
          This is a generic calculator provided under ASIC Corporations (Generic
          Calculators) Instrument 2026/41. It does <strong>not</strong> take
          into account your objectives, financial situation or needs, and does
          not promote any financial product. Results are{" "}
          <strong>estimates</strong> shown in today&apos;s dollars, based on the
          assumptions you enter and those listed here — they are not a guarantee
          of future outcomes. Before making a decision, consider obtaining
          advice from an Australian Financial Services (AFS) licensee.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            onClick={() => setOpen(true)}
            className="font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
          >
            Assumptions &amp; limitations
          </button>
          <button
            onClick={() => window.print()}
            className="font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
          >
            Print / save results
          </button>
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-4 w-full max-w-2xl rounded-2xl border border-line bg-panel p-6 text-sm text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-white">
                Assumptions &amp; limitations
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-white"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-muted">
              This calculator provides general information only and is not
              personal financial product advice. It does not consider your
              objectives, financial situation or needs, and does not recommend
              or promote any specific financial product. Estimates are shown in
              today&apos;s dollars and are not a guarantee of future results.
              You can change the key assumptions (including investment return
              and inflation) on the plan; the settings below are reasonable
              defaults for illustration using FY{config.financialYear} rules.
            </p>

            <h3 className="mt-5 font-semibold text-white">Key assumptions</h3>
            <ul className="mt-2 space-y-1.5 text-slate-300">
              <li>
                <strong>Inflation &amp; today&apos;s dollars.</strong> Projections
                run in real terms — every future amount is expressed in
                today&apos;s dollars so its purchasing power is comparable. You
                set both the investment return and the inflation rate; the
                calculator uses the return net of your inflation assumption.
              </li>
              <li>
                <strong>Investment returns</strong> are the rate you enter and
                are assumed to apply each year. Real returns vary; the
                &ldquo;how likely&rdquo; section separately models a range of
                return sequences.
              </li>
              <li>
                <strong>Superannuation.</strong> Super Guarantee {pct(config.sgRate)},
                contributions tax {pct(config.contributionsTax)}, and{" "}
                {pct(config.superEarningsTaxAccumulation)} tax on accumulation
                earnings. Concessional cap {fmt(config.concessionalCap)},
                non-concessional cap {fmt(config.nonConcessionalCap)}. Preservation
                age {config.preservationAge}; minimum pension drawdown rates
                increase with age.
              </li>
              <li>
                <strong>Age Pension</strong> from age {config.agePensionAge},
                assessed on the lower of the income and assets tests. Maximum
                (incl. supplements) {fmt(ap.single.maxAnnual)}/yr single and{" "}
                {fmt(ap.couple.maxAnnual)}/yr couple; deeming rates{" "}
                {pct(config.deeming.lowerRate)} / {pct(config.deeming.upperRate)}.
              </li>
              <li>
                <strong>Spending benchmarks</strong> use the ASFA Retirement
                Standard. Current rates and their sources are maintained in the
                app&apos;s reference-data backoffice.
              </li>
            </ul>

            <h3 className="mt-5 font-semibold text-white">
              Significant limitations &amp; their impact
            </h3>
            <ul className="mt-2 space-y-1.5 text-slate-300">
              <li>
                <strong>Super fees not modelled</strong> — administration and
                investment fees are excluded, so balances may be{" "}
                <em>overstated</em> (typically ~0.5–1% of the balance a year in
                practice).
              </li>
              <li>
                <strong>Division 293 not modelled</strong> — the extra 15% tax
                on concessional contributions for incomes above $250,000 is not
                applied, so high earners&apos; super may be overstated.
              </li>
              <li>
                <strong>Transfer Balance Cap</strong> is treated simply; very
                large balances moving to the retirement phase may be overstated.
              </li>
              <li>
                <strong>Insurance premiums</strong> inside super are not
                deducted.
              </li>
              <li>
                <strong>Investment property CGT</strong> is an approximation
                (marginal rates on the discounted gain, in isolation) and{" "}
                <strong>interest-only loan principal</strong> is assumed cleared
                outside the cash-flow (e.g. from the estate).
              </li>
              <li>
                <strong>Not included:</strong> aged-care costs, one-off/lump-sum
                spending, personal circumstances, and any future changes to
                rates or law.
              </li>
            </ul>

            <p className="mt-5 text-xs text-muted">
              Estimates only. Before acting, consider obtaining advice from an
              AFS licensee and read the relevant Product Disclosure Statement.
              You can keep a record of any result using{" "}
              <button
                onClick={() => window.print()}
                className="font-semibold text-accent underline underline-offset-2"
              >
                Print / save
              </button>
              .
            </p>
          </div>
        </div>
      )}
    </>
  );
}
