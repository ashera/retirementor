"use client";

import { useEffect, useState } from "react";

const SIZES = [
  { key: "feed", label: "Feed · 1200×628", w: 1200, h: 628 },
  { key: "square", label: "Square · 1080×1080", w: 1080, h: 1080 },
  { key: "vertical", label: "Vertical · 1080×1350", w: 1080, h: 1350 },
  { key: "thumb", label: "Thumbnail · 600×600", w: 600, h: 600 },
  { key: "wide", label: "Wide · 1280×720", w: 1280, h: 720 },
];

const IMAGES = [
  { key: "", label: "No screenshot" },
  { key: "stats", label: "Dashboard cards" },
  { key: "chart", label: "Balance chart" },
];

export default function MediaStudio() {
  const [t, setT] = useState("Will your super and the *Age Pension* last?");
  const [s, setS] = useState("Free Australian retirement planner — model it in minutes.");
  const [size, setSize] = useState(SIZES[0]);
  const [img, setImg] = useState("");

  const build = () =>
    `/admin/media/render?t=${encodeURIComponent(t)}&s=${encodeURIComponent(s)}&w=${size.w}&h=${size.h}${
      img ? `&img=${img}` : ""
    }`;

  const liveUrl = build();
  const [preview, setPreview] = useState(liveUrl);
  useEffect(() => {
    const id = setTimeout(() => setPreview(build()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, s, size, img]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Headline — wrap the highlighted phrase in *asterisks*
          </span>
          <textarea
            value={t}
            onChange={(e) => setT(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Sub-line</span>
          <textarea
            value={s}
            onChange={(e) => setS(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((sz) => (
            <button
              key={sz.key}
              onClick={() => setSize(sz)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                size.key === sz.key
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-line bg-panel-2 text-slate-200 hover:text-white"
              }`}
            >
              {sz.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted">Screenshot:</span>
          {IMAGES.map((im) => (
            <button
              key={im.key}
              onClick={() => setImg(im.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                img === im.key
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-line bg-panel-2 text-slate-200 hover:text-white"
              }`}
            >
              {im.label}
            </button>
          ))}
        </div>
        {img && <p className="text-xs text-muted">With a screenshot, the sub-line is hidden and the headline is shorter — keep it punchy.</p>}
        <a
          href={liveUrl}
          download={`retirewiz-${size.key}.png`}
          className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
        >
          Download PNG ({size.w}×{size.h})
        </a>
      </div>

      <div className="rounded-2xl border border-line bg-panel-2 p-3">
        {/* key forces a reload when the debounced url changes */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={preview} src={preview} alt="Ad preview" className="w-full rounded-lg" />
      </div>
    </div>
  );
}
