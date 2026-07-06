"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setUserAdmin,
  setUserSuspended,
  deleteUser,
  type UserAdminResult,
} from "@/app/actions/users";

export default function UserActions({
  userId,
  email,
  isAdmin,
  suspended,
  isSelf,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<UserAdminResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else {
        setError(null);
        if (onOk) onOk();
        else router.refresh();
      }
    });

  const btn = "rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btn}
          disabled={pending || isSelf}
          onClick={() => act(() => setUserAdmin(userId, !isAdmin))}
        >
          {isAdmin ? "Revoke admin" : "Make admin"}
        </button>
        <button
          className={btn}
          disabled={pending || isSelf}
          onClick={() => act(() => setUserSuspended(userId, !suspended))}
        >
          {suspended ? "Reinstate account" : "Suspend account"}
        </button>
        <button
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
          disabled={pending || isSelf}
          onClick={() => {
            if (window.confirm(`Permanently delete ${email} and all their saved plans? This can't be undone.`)) {
              act(() => deleteUser(userId), () => router.push("/admin/users"));
            }
          }}
        >
          Delete user
        </button>
      </div>
      {isSelf && (
        <p className="text-xs text-muted">That&apos;s you — manage your own account elsewhere.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
