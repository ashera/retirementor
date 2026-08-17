import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";

// Shared 1200×630 OG-card renderer for per-page link previews — a branded header, an
// eyebrow (section/category) and the page title. Used by the per-segment
// opengraph-image.tsx routes so each article/tool gets its own card.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// The RetireWiz mark, embedded as a data URI (Satori renders data URIs without a fetch).
const markSrc = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/logo-mark.png"),
).toString("base64")}`;

export function renderOgCard(eyebrow: string, title: string) {
  const titleSize = title.length > 70 ? 46 : title.length > 45 ? 54 : 64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0e1a",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={96} height={89} alt="" />
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800, letterSpacing: "-1px" }}>
            <span style={{ color: "#34d399" }}>Retire</span>
            <span style={{ color: "#ffffff" }}>Wiz</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: "#34d399", textTransform: "uppercase", letterSpacing: "3px", marginBottom: "20px" }}>
            {eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.15 }}>
            {title}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#5b6678", textTransform: "uppercase", letterSpacing: "3px" }}>
          General information only · Not financial advice
        </div>
      </div>
    ),
    ogSize,
  );
}
