import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listOutreach } from "@/lib/adminOutreach";
import AdminTabs from "@/components/AdminTabs";
import OutreachTable from "@/components/OutreachTable";

export const metadata = { title: "Backoffice — Reddit outreach", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const items = await listOutreach();
  const newCount = items.filter((o) => o.status === "new").length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="outreach" outreachCount={newCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Marketing · Reddit outreach</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Outreach leads</h1>
        <p className="mt-2 text-muted">
          {items.length} {items.length === 1 ? "lead" : "leads"}
          {newCount > 0 && ` · ${newCount} to action`}. Reddit threads where a{" "}
          <Link href="/learn" className="text-accent hover:underline">/learn</Link> article fits a helpful reply — each with a draft
          response and a link to our page prefilled from the post.
        </p>
        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-[13px] leading-relaxed text-amber-200/90">
          Populate with <code className="rounded bg-ink/40 px-1">railway run npm run reddit:match -- --article=super-on-track --save</code>.
          Comment genuinely — lead with a real answer, disclose it&apos;s your tool, and follow each subreddit&apos;s self-promotion rules.
        </p>
      </header>

      <OutreachTable items={items} />
    </main>
  );
}
