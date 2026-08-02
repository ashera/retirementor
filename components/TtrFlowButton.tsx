"use client";

import { useState } from "react";
import type { TtrFlow } from "@/lib/au/ttrFlow";
import TtrFlowModal from "@/components/TtrFlowModal";

/** A button that opens the reusable TTR flow-of-funds diagram. Pass the TTR-active
 *  years' flows; the modal opens on `initialAge` and lets the user step between them.
 *  Renders nothing when there are no TTR flows to show. */
export default function TtrFlowButton({
  flows,
  initialAge,
  label = "See the flow of funds →",
  className,
}: {
  flows: { age?: number; flow: TtrFlow }[] | null | undefined;
  initialAge?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!flows || flows.length === 0) return null;
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
      {open && <TtrFlowModal flows={flows} initialAge={initialAge} onClose={() => setOpen(false)} />}
    </>
  );
}
