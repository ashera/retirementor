// Tiny wrapper over whichever analytics provider is loaded. Each call is a no-op
// unless that provider's script is present (Plausible via NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
// GA4 via NEXT_PUBLIC_GA_ID), so it's safe to sprinkle track() calls anywhere
// without guarding — events flow to every configured provider at once.
type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props; callback?: () => void }) => void;
    gtag?: (command: "event", event: string, params?: Props) => void;
  }
}

// GA4 event names allow only letters, numbers and underscores (max 40 chars), so
// "Compare: saved added" -> "compare_saved_added". Plausible keeps the readable name.
function gaEventName(event: string) {
  return event
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function track(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  window.plausible?.(event, props ? { props } : undefined);
  window.gtag?.("event", gaEventName(event), props);
}
