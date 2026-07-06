import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/adminUsers";
import AdminTabs from "@/components/AdminTabs";
import UsersTable from "@/components/UsersTable";

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

      <UsersTable users={users} />
    </main>
  );
}
