"use client";

import { useState } from "react";
import type { TtrFlow } from "@/lib/au/ttrFlow";
import TtrFlowModal from "@/components/TtrFlowModal";

/** A button that opens the reusable TTR flow-of-funds diagram. Renders nothing when
 *  there's no TTR flow to show (e.g. a year with no active TTR). */
export default function TtrFlowButton({
  flow,
  age,
  label = "See the flow of funds →",
  className,
}: {
  flow: TtrFlow | null | undefined;
  age?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!flow) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
        }
      >
        {label}
      </button>
      {open && <TtrFlowModal flow={flow} age={age} onClose={() => setOpen(false)} />}
    </>
  );
}
