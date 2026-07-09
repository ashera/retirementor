import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import {
  GOOGLE_STATE_COOKIE,
  CALLBACK_PATH,
  googleConfigured,
  buildAuthUrl,
  requestOrigin,
} from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

// Start of the Google sign-in flow: set a short-lived CSRF `state` cookie and
// bounce the user to Google's consent screen.
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=google_unavailable`);
  }
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  });
  return NextResponse.redirect(buildAuthUrl(state, `${origin}${CALLBACK_PATH}`));
}
