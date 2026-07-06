import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/adminUsers";
import { fmtDate, fmtDateTime } from "@/lib/au/format";
import AdminTabs from "@/components/AdminTabs";

export const metadata = { title: "Backoffice — Users", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const users = await listUsers();
  const admins = users.filter((u) => u.is_admin).length;
  const suspended = users.filter((u) => u.suspended).length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="users" />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Users</h1>
        <p className="mt-2 text-muted">
          {users.length} {users.length === 1 ? "account" : "accounts"} · {admins} admin
          {admins === 1 ? "" : "s"}
          {suspended > 0 && ` · ${suspended} suspended`}.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Plans</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60 transition hover:bg-panel-2/40">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-slate-100 hover:text-accent">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  {u.is_admin ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">Admin</span>
                  ) : (
                    <span className="text-muted">User</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {u.suspended ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Suspended</span>
                  ) : (
                    <span className="text-xs text-emerald-400">Active</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{u.plan_count}</td>
                <td className="px-4 py-2.5 text-muted">{fmtDateTime(u.last_login_at)}</td>
                <td className="px-4 py-2.5 text-muted">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
