import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const runtime = "nodejs"; // read the mark off disk at render time
export const alt = `${SITE_NAME} — Australian Retirement & Super Planner`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The RetireWiz mark (same artwork as the favicon/report), embedded as a data URI —
// Satori renders <img> data URIs reliably without a network fetch.
const markSrc = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/logo-mark.png"),
).toString("base64")}`;

// Branded 1200×630 card used for link previews (og:image + twitter:image).
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0a0e1a",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={128} height={119} alt="" />
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: "-2px" }}>
            <span style={{ color: "#34d399" }}>Retire</span>
            <span style={{ color: "#ffffff" }}>Wiz</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: "56px", fontSize: 52, fontWeight: 700, color: "#e2e8f0" }}>
          Will your super and the Age Pension last?
        </div>
        <div style={{ display: "flex", marginTop: "24px", fontSize: 30, color: "#8b97ad" }}>
          Free Australian retirement &amp; super planner — modelled in today&apos;s dollars.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "56px",
            fontSize: 22,
            color: "#5b6678",
            textTransform: "uppercase",
            letterSpacing: "3px",
          }}
        >
          General information only · Not financial advice
        </div>
      </div>
    ),
    size,
  );
}
