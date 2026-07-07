import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import MediaStudio from "@/components/MediaStudio";

export const metadata = { title: "Backoffice — Media", robots: { index: false } };
export const dynamic = "force-dynamic";

const PRESETS: { t: string; s: string }[] = [
  {
    t: "Will your super and the *Age Pension* last?",
    s: "Free Australian retirement planner — model it in minutes, in today's dollars.",
  },
  {
    t: "How much super is *“enough”?*",
    s: "Stop guessing. See your real numbers in 2 minutes.",
  },
  {
    t: "Retiring early? See if your super *bridges the gap.*",
    s: "The early-retirement bridge to the Age Pension — modelled for you.",
  },
  {
    t: "The free super calculator that *counts the Age Pension.*",
    s: "Means-tested, current rules, no sign-up needed.",
  },
  {
    t: "See when (or if) your super *runs short.*",
    s: "In today's dollars, current rules. Free Australian retirement planner.",
  },
];

const SHOT_PRESETS: { t: string; s: string; img: string }[] = [
  { t: "See your super, the Age Pension & *how long it lasts.*", s: "", img: "stats" },
  { t: "Your retirement, *modelled in minutes.*", s: "", img: "chart" },
  { t: "See exactly *when your money runs short.*", s: "", img: "chart" },
  { t: "*85% likely to last?* Find out — free, in minutes.", s: "", img: "stats" },
];

const SIZES = [
  { key: "feed", label: "Feed 1200×628", w: 1200, h: 628 },
  { key: "square", label: "Square 1080×1080", w: 1080, h: 1080 },
  { key: "vertical", label: "Vertical 1080×1350", w: 1080, h: 1350 },
  { key: "thumb", label: "Thumbnail 600×600", w: 600, h: 600 },
  { key: "wide", label: "Wide 1280×720", w: 1280, h: 720 },
];

const build = (t: string, s: string, w: number, h: number, img?: string) =>
  `/admin/media/render?t=${encodeURIComponent(t)}&s=${encodeURIComponent(s)}&w=${w}&h=${h}${
    img ? `&img=${img}` : ""
  }`;

export default async function MediaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="media" />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Media</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Ad creatives</h1>
        <p className="mt-2 text-muted">
          Generated live from the RetireWiz brand — preview and download in any size. Nothing is
          stored; each image is rendered on demand.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Ready-made creatives</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRESETS.map((pr, i) => (
            <div key={i} className="rounded-2xl border border-line bg-panel p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={build(pr.t, pr.s, 1200, 628)} alt={pr.t.replace(/\*/g, "")} className="w-full rounded-lg border border-line" />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="mr-1 text-muted">Download:</span>
                {SIZES.map((sz) => (
                  <a
                    key={sz.key}
                    href={build(pr.t, pr.s, sz.w, sz.h)}
                    download={`retirewiz-${sz.key}-${i + 1}.png`}
                    className="rounded border border-line bg-panel-2 px-2 py-1 font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
                  >
                    {sz.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">With a product screenshot</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHOT_PRESETS.map((pr, i) => (
            <div key={i} className="rounded-2xl border border-line bg-panel p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={build(pr.t, pr.s, 1200, 628, pr.img)} alt={pr.t.replace(/\*/g, "")} className="w-full rounded-lg border border-line" />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="mr-1 text-muted">Download:</span>
                {SIZES.map((sz) => (
                  <a
                    key={sz.key}
                    href={build(pr.t, pr.s, sz.w, sz.h, pr.img)}
                    download={`retirewiz-shot-${sz.key}-${i + 1}.png`}
                    className="rounded border border-line bg-panel-2 px-2 py-1 font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
                  >
                    {sz.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Custom creative</h2>
        <p className="mb-4 text-sm text-muted">
          Type your own headline and pick a size — the preview updates live and downloads as a PNG.
        </p>
        <MediaStudio />
      </section>
    </main>
  );
}
