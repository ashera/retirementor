import { ImageResponse } from "next/og";
import { getAdmin } from "@/lib/auth";

// On-demand ad-creative generator (admin only). Query params:
//   t = headline (wrap the accent phrase in *asterisks*), s = sub-line,
//   w/h = pixel size. Rendered with the RetireWiz brand.
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Forbidden", { status: 403 });

  const p = new URL(req.url).searchParams;
  const w = Math.min(2000, Math.max(320, Number(p.get("w")) || 1200));
  const h = Math.min(2000, Math.max(320, Number(p.get("h")) || 628));
  const headline = (p.get("t") || "Will your super and the *Age Pension* last?").slice(0, 160);
  const sub = (p.get("s") || "Free Australian retirement planner — model it in minutes.").slice(0, 200);

  // Scale typography to the canvas height.
  const pad = Math.round(h * 0.095);
  const logoFs = Math.round(h * 0.06);
  const hFs = Math.round(h * (w >= h ? 0.1 : 0.088));
  const subFs = Math.round(h * 0.042);
  const badgeFs = Math.round(h * 0.03);
  const domFs = Math.round(h * 0.035);

  // Split on *accent* markers; convert boundary spaces to non-breaking spaces so
  // Satori doesn't trim flex-item whitespace at wraps (which would glue coloured
  // words to their neighbours, e.g. "theAge Pension").
  const nbsp = String.fromCharCode(160);
  const segs = headline.split("*").map((t) => t.replace(/^ /, nbsp).replace(/ $/, nbsp));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: pad,
          background: "#0a0e1a",
          backgroundImage:
            "radial-gradient(120% 130% at 100% -10%, rgba(52,211,153,0.18), transparent 45%), radial-gradient(120% 130% at -10% 110%, rgba(139,92,246,0.16), transparent 48%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", fontSize: logoFs, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: "#34d399" }}>Retire</span>
          <span style={{ color: "#ffffff" }}>Wiz</span>
          <span style={{ color: "#8b97ad", fontSize: Math.round(logoFs * 0.42), marginLeft: 6 }}>.com.au</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: hFs,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
            }}
          >
            {segs.map((t, i) => (
              <span key={i} style={{ color: i % 2 === 1 ? "#34d399" : "#ffffff" }}>
                {t}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: Math.round(h * 0.028), fontSize: subFs, color: "#9fb0c9" }}>
            {sub}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              background: "rgba(52,211,153,0.15)",
              border: "1px solid rgba(52,211,153,0.35)",
              color: "#34d399",
              fontWeight: 700,
              padding: `${Math.round(h * 0.014)}px ${Math.round(h * 0.028)}px`,
              borderRadius: 999,
              fontSize: badgeFs,
            }}
          >
            Free · No sign-up
          </div>
          <div style={{ display: "flex", color: "#e2e8f0", fontWeight: 700, fontSize: domFs }}>
            retirewiz.com.au →
          </div>
        </div>
      </div>
    ),
    { width: w, height: h },
  );
}
