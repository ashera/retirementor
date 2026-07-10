"use client";

import { useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import {
  createMarketingAsset,
  updateMarketingAsset,
  deleteMarketingAsset,
  toggleMarketingPin,
  type MarketingAsset,
  type AssetInput,
} from "@/app/actions/marketing";

const KINDS: { value: string; label: string; icon: string }[] = [
  { value: "outreach", label: "Outreach", icon: "✉️" },
  { value: "idea", label: "Idea", icon: "💡" },
  { value: "snippet", label: "Snippet", icon: "✂️" },
  { value: "link", label: "Link", icon: "🔗" },
  { value: "note", label: "Note", icon: "📝" },
];
const kindMeta = (k: string) => KINDS.find((x) => x.value === k) ?? { value: k, label: k, icon: "•" };

const AUDIENCES = ["", "advisers", "consumers", "all"];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-accent/60 hover:text-accent"
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

const empty: AssetInput = { kind: "idea", title: "", body: "", url: "", audience: "", pinned: false };

function AssetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: AssetInput;
  onSave: (v: AssetInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<AssetInput>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<AssetInput>) => setV((p) => ({ ...p, ...patch }));

  return (
    <div className="rounded-2xl border border-accent/40 bg-panel p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => set({ kind: k.value })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              v.kind === k.value ? "bg-accent text-ink" : "border border-line text-muted hover:text-white"
            }`}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>

      <input
        value={v.title ?? ""}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Title"
        className="mb-2 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <textarea
        value={v.body ?? ""}
        onChange={(e) => set({ body: e.target.value })}
        placeholder="Body — the copy, idea or notes…"
        rows={initial.body ? 10 : 5}
        className="mb-2 w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={v.url ?? ""}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="Link (optional)"
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={v.audience ?? ""}
          onChange={(e) => set({ audience: e.target.value })}
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
        >
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>{a ? a : "audience…"}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-300">
          <input type="checkbox" checked={!!v.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
          Pin
        </label>
      </div>

      {err && <div className="mb-2 text-sm text-red-400">{err}</div>}
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onSave(v);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Something went wrong.");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  asset: MarketingAsset;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = kindMeta(asset.kind);
  const body = asset.body ?? "";
  const long = body.length > 320;

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{asset.title}</span>
            {asset.audience && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                {asset.audience}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {body && <CopyButton text={body} />}
          <button onClick={onTogglePin} title={asset.pinned ? "Unpin" : "Pin"} className="rounded px-1 text-sm text-muted transition hover:text-accent">
            {asset.pinned ? "★" : "☆"}
          </button>
          <button onClick={onEdit} title="Edit" className="rounded px-1 text-sm text-muted transition hover:text-white">✎</button>
          <button onClick={onDelete} title="Delete" className="rounded px-1 text-sm text-muted transition hover:text-red-400">✕</button>
        </div>
      </div>

      {asset.url && (
        <a href={asset.url} target="_blank" rel="noreferrer" className="mb-2 block truncate text-sm text-accent hover:underline">
          {asset.url}
        </a>
      )}

      {body && (
        <>
          <pre className={`whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300 ${!open && long ? "max-h-40 overflow-hidden" : ""}`}>
            {body}
          </pre>
          {long && (
            <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-medium text-accent hover:underline">
              {open ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function MarketingView({
  email,
  assets: initial,
  staleCount,
  feedbackCount,
  adviserCount,
}: {
  email: string;
  assets: MarketingAsset[];
  staleCount: number;
  feedbackCount: number;
  adviserCount: number;
}) {
  const [assets, setAssets] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reloadLocal = (fn: (a: MarketingAsset[]) => MarketingAsset[]) => setAssets((a) => sortAssets(fn(a)));

  const sortAssets = (a: MarketingAsset[]) =>
    [...a].sort((x, y) => (x.pinned === y.pinned ? y.created_at.localeCompare(x.created_at) : x.pinned ? -1 : 1));

  const create = async (v: AssetInput) => {
    const res = await createMarketingAsset(v);
    if (res.error) throw new Error(res.error);
    reloadLocal((a) => [
      {
        id: res.id!,
        kind: v.kind || "idea",
        title: (v.title || "").trim(),
        body: (v.body || "").trim() || null,
        url: (v.url || "").trim() || null,
        audience: (v.audience || "").trim() || null,
        pinned: !!v.pinned,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...a,
    ]);
    setAdding(false);
  };

  const save = async (id: string, v: AssetInput) => {
    const res = await updateMarketingAsset(id, v);
    if (res.error) throw new Error(res.error);
    reloadLocal((a) =>
      a.map((x) =>
        x.id === id
          ? {
              ...x,
              kind: v.kind || "idea",
              title: (v.title || "").trim(),
              body: (v.body || "").trim() || null,
              url: (v.url || "").trim() || null,
              audience: (v.audience || "").trim() || null,
              pinned: !!v.pinned,
            }
          : x,
      ),
    );
    setEditingId(null);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    const res = await deleteMarketingAsset(id);
    if (!res.error) setAssets((a) => a.filter((x) => x.id !== id));
  };

  const togglePin = async (a: MarketingAsset) => {
    const next = !a.pinned;
    reloadLocal((list) => list.map((x) => (x.id === a.id ? { ...x, pinned: next } : x)));
    await toggleMarketingPin(a.id, next);
  };

  // Group by kind, preserving the KINDS order; pinned already float within.
  const groups = KINDS.map((k) => ({ ...k, items: assets.filter((a) => a.kind === k.value) })).filter(
    (g) => g.items.length > 0,
  );
  const other = assets.filter((a) => !KINDS.some((k) => k.value === a.kind));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="marketing" staleCount={staleCount} feedbackCount={feedbackCount} adviserCount={adviserCount} />

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-widest text-accent">Marketing · Kit</div>
          <h1 className="mt-1 text-3xl font-bold text-white">Marketing assets &amp; ideas</h1>
          <p className="mt-2 max-w-3xl text-muted">
            One home for outreach copy, ideas, snippets and links — so they&rsquo;re easy to find and reuse.
            Pre-loaded with the <span className="text-slate-300">adviser outreach kit</span> (LinkedIn post, DM, cold email).
            Copy any block straight to your clipboard.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
          >
            + New asset
          </button>
        )}
      </header>

      {adding && (
        <div className="mb-6">
          <AssetForm initial={empty} onSave={create} onCancel={() => setAdding(false)} />
        </div>
      )}

      {assets.length === 0 && !adding ? (
        <div className="rounded-2xl border border-line bg-panel-2 p-8 text-center text-muted">
          Nothing here yet. Add your first idea or asset.
        </div>
      ) : (
        <div className="space-y-8">
          {[...groups, ...(other.length ? [{ value: "other", label: "Other", icon: "•", items: other }] : [])].map(
            (g) => (
              <section key={g.value}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                  <span aria-hidden>{g.icon}</span> {g.label}
                  <span className="rounded-full bg-panel-2 px-2 text-xs text-muted">{g.items.length}</span>
                </h2>
                <div className="grid gap-3">
                  {g.items.map((a) =>
                    editingId === a.id ? (
                      <AssetForm
                        key={a.id}
                        initial={{
                          kind: a.kind,
                          title: a.title,
                          body: a.body ?? "",
                          url: a.url ?? "",
                          audience: a.audience ?? "",
                          pinned: a.pinned,
                        }}
                        onSave={(v) => save(a.id, v)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        onEdit={() => setEditingId(a.id)}
                        onDelete={() => remove(a.id)}
                        onTogglePin={() => togglePin(a)}
                      />
                    ),
                  )}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </main>
  );
}
