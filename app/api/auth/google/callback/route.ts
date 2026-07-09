import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import {
  GOOGLE_STATE_COOKIE,
  CALLBACK_PATH,
  exchangeCodeForProfile,
  findOrCreateGoogleUser,
  requestOrigin,
} from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

// Google redirects the user back here with a `code` and our `state`. Validate
// state, exchange the code for the profile, find-or-create the user (auto-linking
// by verified email), open a session, and land them on the planner.
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error"); // e.g. user cancelled

  const store = await cookies();
  const expectedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  store.delete(GOOGLE_STATE_COOKIE); // one-time use

  if (oauthError) return fail("google_cancelled");
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("google_state"); // CSRF / stale round-trip
  }

  try {
    const profile = await exchangeCodeForProfile(code, `${origin}${CALLBACK_PATH}`);
    if (!profile.email || !profile.emailVerified) return fail("google_email_unverified");

    const user = await findOrCreateGoogleUser(profile);
    if (user.suspended) return fail("suspended");

    await createSession(user.id);
    return NextResponse.redirect(`${origin}/`);
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return fail("google_failed");
  }
}
