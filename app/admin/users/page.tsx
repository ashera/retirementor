import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/adminUsers";
import { listVisitors, getVisitorStats } from "@/lib/adminVisitors";
import AdminTabs from "@/components/AdminTabs";
import UsersTable from "@/components/UsersTable";
import VisitorsTable from "@/components/VisitorsTable";

export const metadata = { title: "Backoffice — Users", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const view = (await searchParams).view === "visitors" ? "visitors" : "accounts";

  const seg = (key: "accounts" | "visitors", label: string) => (
    <Link
      href={key === "accounts" ? "/admin/users" : "/admin/users?view=visitors"}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        view === key ? "bg-accent font-semibold text-ink" : "font-medium text-muted hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="users" />

      <div className="mb-6 inline-flex gap-1 rounded-lg border border-line bg-panel-2 p-1">
        {seg("accounts", "Accounts")}
        {seg("visitors", "Anonymous visitors")}
      </div>

      {view === "accounts" ? <AccountsView /> : <VisitorsView />}
    </main>
  );
}

async function AccountsView() {
  const users = await listUsers();
  const admins = users.filter((u) => u.is_admin).length;
  const suspended = users.filter((u) => u.suspended).length;

  return (
    <>
      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Accounts</h1>
        <p className="mt-2 text-muted">
          {users.length} {users.length === 1 ? "account" : "accounts"} · {admins} admin
          {admins === 1 ? "" : "s"}
          {suspended > 0 && ` · ${suspended} suspended`}.
        </p>
      </header>
      <UsersTable users={users} />
    </>
  );
}

async function VisitorsView() {
  const [visitors, stats] = await Promise.all([listVisitors(), getVisitorStats()]);

  return (
    <>
      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Users</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Anonymous visitors</h1>
        <p className="mt-2 text-muted">
          People who used the site without signing up. {stats.total} tracked ·{" "}
          {stats.last7Days} in the last 7 days · {stats.engaged} engaged ·{" "}
          {stats.converted} later signed up.
        </p>
      </header>
      <VisitorsTable visitors={visitors} />
    </>
  );
}
