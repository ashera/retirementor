"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

/**
 * The signed-in account control in the top bar: the avatar + name is a button that
 * opens a dropdown with the Admin, Account and Log-out links. Collapsing these into
 * one trigger keeps the header from wrapping into several rows on a phone. A small
 * dot on the trigger still surfaces a pending admin-review count while collapsed.
 */
export default function HeaderUserMenu({
  user,
  reviewDue = 0,
  userStats = null,
}: {
  user: { email: string; isAdmin: boolean; name?: string | null; avatarUrl?: string | null };
  reviewDue?: number;
  userStats?: { total: number; last7Days: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const label = user.name ?? user.email;

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showAdminDot = user.isAdmin && reviewDue > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-slate-200 transition hover:text-white"
        title="Account menu"
      >
        <span className="relative shrink-0">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-slate-300 ring-1 ring-line">
              {label.charAt(0).toUpperCase()}
            </span>
          )}
          {showAdminDot && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[color:var(--bg,#0b1220)]" aria-hidden />
          )}
        </span>
        <span className="max-w-[7.5rem] truncate sm:max-w-[12rem]">{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-2xl"
        >
          <div className="truncate px-3 py-2 text-xs text-muted" title={user.email}>
            Signed in as <span className="text-slate-200">{user.email}</span>
          </div>
          <div className="my-1 border-t border-line" />
          {user.isAdmin && (
            <Link
              href="/admin/review"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/10"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>🛠️</span> Admin
              </span>
              {reviewDue > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white tabular-nums">{reviewDue}</span>
              )}
            </Link>
          )}
          {user.isAdmin && userStats && (
            <Link
              href="/admin/users"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-200 transition hover:bg-panel-2 hover:text-white"
              title="Total users · signed up in the last 7 days"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>👥</span> Users
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="tabular-nums text-white">{userStats.total.toLocaleString()}</span>
                {userStats.last7Days > 0 && (
                  <span className="tabular-nums text-emerald-400">+{userStats.last7Days}·7d</span>
                )}
              </span>
            </Link>
          )}
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 transition hover:bg-panel-2 hover:text-white"
          >
            <span aria-hidden>⚙️</span> Account settings
          </Link>
          <div className="my-1 border-t border-line" />
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-panel-2 hover:text-white"
            >
              <span aria-hidden>↩︎</span> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
