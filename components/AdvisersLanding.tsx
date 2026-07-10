"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { track } from "@/lib/analytics";
import { joinAdviserWaitlist } from "@/app/actions/advisers";

const ROLES = ["Financial adviser", "Accountant", "Mortgage broker", "Paraplanner", "Other"];
const SIZES = ["Just me", "2–5", "6–20", "20+"];
const PAY = ["Not sure yet", "Under $30/mo", "$30–79/mo", "$80–149/mo", "$150+/mo"];

function Feature({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="text-2xl" aria-hidden>{icon}</div>
      <h3 className="mt-2 font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export default function AdvisersLanding() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", firm: "", role: "", practiceSize: "", wouldPay: "", message: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await joinAdviserWaitlist(form);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setSent(true);
      track("Adviser waitlist joined", { role: form.role || "unknown", size: form.practiceSize || "unknown" });
    }
  };

  const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none transition focus:border-accent";

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between gap-3 text-sm">
        <Link href="/" aria-label="RetireWiz home"><Logo className="h-10 w-auto" /></Link>
        <Link href="/" className="rounded-lg border border-line px-3 py-1.5 font-medium text-slate-200 transition hover:border-accent/50 hover:text-white">
          Try the planner →
        </Link>
      </div>

      {/* Hero */}
      <header className="max-w-2xl">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">For advisers &amp; accountants</div>
        <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
          Retirement modelling your clients will actually understand.
        </h1>
        <p className="mt-4 text-lg text-muted">
          A fast, transparent Australian retirement, superannuation and Age&nbsp;Pension modeller for your
          client conversations — the maths done rigorously, shown in plain English, branded to your practice.
        </p>
      </header>

      {/* Value props */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Feature icon="🇦🇺" title="Built on current AU rules">
          Superannuation, the means-tested Age Pension (income &amp; assets tests, deeming), early-retirement
          bridging, fees and tax — all on this year&apos;s figures, in today&apos;s dollars.
        </Feature>
        <Feature icon="🎛️" title="Strategies, live">
          Toggle downsizing, TTR, salary-sacrifice, part-time work, retiring later — and show the impact on
          balance, income and how long it lasts, instantly, in the room.
        </Feature>
        <Feature icon="🔍" title="Nothing hidden">
          Every figure is sourced and on show — investment return, tax, pension thresholds, fees, the Monte
          Carlo confidence bar. Independently cross-checked against ASIC&apos;s Moneysmart.
        </Feature>
        <Feature icon="🖋️" title="Client-ready &amp; white-label">
          Clean PDF reports and shareable scenarios, branded to your firm. General information only — you give
          the advice, RetireWiz does the maths.
        </Feature>
      </div>

      {/* Credibility */}
      <p className="mt-6 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-slate-300">
        <span className="font-semibold text-white">Rigorous by design.</span> Every scenario is verified against
        first-principles calculations and ASIC&apos;s Moneysmart calculator, so the numbers hold up to scrutiny.
      </p>

      {/* Waitlist */}
      <section id="waitlist" className="mt-10 rounded-2xl border border-accent/30 bg-accent/[0.05] p-6 sm:p-8">
        {sent ? (
          <div className="text-center">
            <div className="text-4xl" aria-hidden>🎉</div>
            <h2 className="mt-3 text-2xl font-bold text-white">You&apos;re on the list.</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Thanks — we&apos;ll be in touch as early access opens, and early adopters get founding pricing. In the
              meantime, feel free to <Link href="/" className="text-accent hover:underline">kick the tyres on the planner</Link>.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white">Get early access</h2>
            <p className="mt-1 text-sm text-muted">
              We&apos;re opening RetireWiz for Advisers to a first group of practices. Join the waitlist — it takes
              20 seconds and shapes what we build.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="email" required placeholder="Work email *" value={form.email} onChange={set("email")} className={input} autoComplete="email" />
                <input type="text" placeholder="Your name" value={form.name} onChange={set("name")} className={input} autoComplete="name" />
                <input type="text" placeholder="Firm / practice" value={form.firm} onChange={set("firm")} className={`sm:col-span-2 ${input}`} />
                <select value={form.role} onChange={set("role")} className={input} aria-label="Your role">
                  <option value="">Your role…</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={form.practiceSize} onChange={set("practiceSize")} className={input} aria-label="Practice size">
                  <option value="">Practice size…</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s} {s === "Just me" ? "" : "advisers"}</option>)}
                </select>
                <select value={form.wouldPay} onChange={set("wouldPay")} className={`sm:col-span-2 ${input}`} aria-label="What you'd expect to pay">
                  <option value="">What would you expect to pay per seat?</option>
                  {PAY.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <textarea placeholder="What would make this a must-have for you? (optional)" value={form.message} onChange={set("message")} rows={2} className={`sm:col-span-2 ${input} resize-none`} />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-60 sm:w-auto"
              >
                {busy ? "…" : "Join the waitlist"}
              </button>
              <p className="text-[11px] text-muted">No spam — we&apos;ll only email you about early access. General information only, not financial advice.</p>
            </form>
          </>
        )}
      </section>

      <p className="mt-8 text-center text-sm">
        <Link href="/" className="text-muted hover:text-white">← Back to the planner</Link>
      </p>
    </main>
  );
}
