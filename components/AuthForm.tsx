"use client";

import { useActionState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import type { AuthState } from "@/app/actions/auth";

export default function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-line bg-panel p-8">
        <Link href="/" className="mb-6 flex justify-center" aria-label="RetireWiz home">
          <Logo className="h-12 w-auto" />
        </Link>
        <h1 className="text-2xl font-bold text-white">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin
            ? "Log in to load your saved plans."
            : "Save and compare your retirement scenarios."}
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
          <div>
            <label htmlFor="password" className="text-sm text-slate-200">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-white outline-none transition focus:border-accent"
            />
          </div>
          {isLogin && (
            <p className="text-right text-xs">
              <Link href="/forgot-password" className="text-muted hover:text-accent">
                Forgot password?
              </Link>
            </p>
          )}
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-60"
          >
            {pending ? "…" : isLogin ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {isLogin ? (
            <>
              No account?{" "}
              <Link href="/signup" className="text-accent hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Have an account?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Log in
              </Link>
            </>
          )}
        </p>
        <p className="mt-4 text-center">
          <Link href="/" className="text-xs text-muted hover:text-white">
            ← Back to planner
          </Link>
        </p>
      </div>
    </main>
  );
}
