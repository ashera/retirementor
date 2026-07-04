import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RetireMentor — Australian Retirement Planner",
  description:
    "Model your superannuation, the means-tested Age Pension, and early retirement — using current Australian rules. Generic financial calculator; general information only, not financial advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line px-5 py-6 text-center text-xs text-muted">
          <p className="mx-auto max-w-3xl">
            <strong className="text-slate-300">RetireMentor</strong> is a
            generic financial calculator provided under ASIC Corporations
            (Generic Calculators) Instrument 2026/41. It provides{" "}
            <strong className="text-slate-300">general information only</strong>{" "}
            and is not personal financial product advice — it does not consider
            your objectives, financial situation or needs, and does not promote
            any financial product. All results are estimates shown in
            today&apos;s dollars, based on the stated assumptions, and are not a
            guarantee of future outcomes. Consider obtaining advice from an AFS
            licensee before making any financial decision.
          </p>
        </footer>
      </body>
    </html>
  );
}
