"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/app/actions/auth";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {} as AuthState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-line bg-panel p-8">
        <div className="mb-6 flex items-center gap-2 text-accent">
          <span className="text-2xl">🦘</span>
          <span className="text-sm font-semibold uppercase tracking-widest">
            Retirement Planner
          </span>
        </div>

        {state.sent ? (
          <>
            <h1 className="text-2xl font-bold text-white">Check your email</h1>
            <p className="mt-2 text-sm text-muted">
              If an account exists for that address, we&apos;ve sent a link to reset your
              password. It&apos;s valid for one hour — remember to check your spam folder.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white">Forgot your password?</h1>
            <p className="mt-1 text-sm text-muted">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>
            <form action={formAction} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-sm text-slate-200">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-white outline-none transition focus:border-accent"
                />
              </div>
              {state.error && <p className="text-sm text-red-400">{state.error}</p>}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-60"
              >
                {pending ? "…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
