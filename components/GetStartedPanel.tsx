"use client";

/**
 * Shown on the dashboard when we have no plan for the user yet. Deliberately
 * carries NO projection or example figures — the tool only shows results once
 * the user has entered their own details (guided setup, the full editor, or by
 * loading a saved scenario).
 */
export default function GetStartedPanel({
  onGuide,
  onWizard,
}: {
  onGuide: () => void;
  onWizard: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-6 py-8 text-center">
      <div className="mx-auto max-w-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-2xl" aria-hidden>
          🧭
        </div>
        <h2 className="text-xl font-bold text-white">Let&apos;s get started</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          We don&apos;t have your details yet, so there&apos;s nothing to project. Start with a
          quick guided setup, or enter your details yourself — results appear the moment you
          add your own numbers.
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={onGuide}
            className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent-soft sm:w-auto"
          >
            Start guided setup →
          </button>
          <button
            onClick={onWizard}
            className="w-full rounded-lg border border-line bg-panel-2 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white sm:w-auto"
          >
            Enter my details myself
          </button>
        </div>
        <p className="mx-auto mt-4 max-w-md text-xs text-muted">
          General information only, not financial advice — and nothing is saved unless you
          create an account and choose to save it.
        </p>
      </div>
    </div>
  );
}
