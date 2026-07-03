import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Australian Retirement Planner",
  description:
    "Model your superannuation, the means-tested Age Pension, and early retirement — using current Australian rules.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
