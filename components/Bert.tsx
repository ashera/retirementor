import Image from "next/image";

// Bert — the RetireWiz cartoon guide. A small set of poses lives in /public/bert.
// He only ever GUIDES and EXPLAINS, never recommends — so he can't muddy the
// "general information, not advice" framing. Decorative by default (alt=""), lazy
// by default; pass a real alt when he carries meaning.

const POSES = {
  pointer: { w: 247, h: 257 }, // teaching / onboarding
  eureka: { w: 191, h: 246 }, // idea / tip (E=mc² scroll)
  atom: { w: 251, h: 268 }, // explainer / science
  flask: { w: 207, h: 248 }, // explainer / science
  glasses: { w: 223, h: 281 }, // reading / reviewing
  violin: { w: 226, h: 268 }, // life after work
  bicycle: { w: 200, h: 333 }, // the journey
  clock: { w: 296, h: 251 }, // retirement timing (watch + calendar)
  blackboard: { w: 360, h: 309 }, // "RETIRING GENIUS!" scene — hero / celebration
} as const;

export type BertPose = keyof typeof POSES;

export default function Bert({
  pose,
  size = 120,
  alt = "",
  className = "",
  priority = false,
}: {
  pose: BertPose;
  size?: number; // rendered HEIGHT in px
  alt?: string; // "" = decorative (default) → hidden from screen readers
  className?: string;
  priority?: boolean; // eager-load above the fold (else lazy)
}) {
  const { w, h } = POSES[pose];
  const width = Math.round(size * (w / h));
  return (
    <Image
      src={`/bert/${pose}.png`}
      width={width}
      height={size}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      priority={priority}
      draggable={false}
      className={`pointer-events-none select-none ${className}`}
    />
  );
}
