import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} — Australian Retirement & Super Planner`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          <svg width="132" height="99" viewBox="0 0 64 48">
            <path d="M5 41 A27 27 0 0 1 59 41 L46 41 A14 14 0 0 0 18 41 Z" fill="#22c55e" />
            <path
              d="M11.5 41 A20.5 20.5 0 0 1 52.5 41"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="2.4 5"
              opacity="0.85"
            />
          </svg>
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
