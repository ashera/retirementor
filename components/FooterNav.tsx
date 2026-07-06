"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Sitewide footer navigation. The Planner + Compare links only appear once the
// visitor has started a plan (a working plan in localStorage) — a first-time
// visitor sees just the FAQ link. Rendered client-side so the check matches the
// dashboard's "have a plan yet?" state without a hydration mismatch (SSR and the
// first client render both show the no-plan version, then the effect adjusts).
export default function FooterNav() {
  const [hasPlan, setHasPlan] = useState(false);

  useEffect(() => {
    try {
      setHasPlan(!!localStorage.getItem("au-retirement-plan"));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <nav className="mx-auto mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-slate-300">
      {hasPlan && (
        <>
          <Link href="/" className="hover:text-white">Planner</Link>
          <Link href="/compare" className="hover:text-white">Compare scenarios</Link>
        </>
      )}
      <Link href="/about" className="hover:text-white">About</Link>
      <Link href="/faq" className="hover:text-white">Retirement &amp; super FAQ</Link>
    </nav>
  );
}
