// Tiny wrapper over Plausible's custom-events API. Every call is a no-op unless
// Plausible is actually loaded (i.e. NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set), so it's
// safe to sprinkle track() calls anywhere without guarding.
type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props; callback?: () => void }) => void;
  }
}

export function track(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  window.plausible?.(event, props ? { props } : undefined);
}
