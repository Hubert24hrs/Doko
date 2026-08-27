import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/security/redirect";

/**
 * Email-confirmation and OAuth landing point.
 *
 * Exchanges the one-time code for a session, then redirects. The `next`
 * parameter is attacker-controllable, so it is passed through
 * `safeRelativePath` — otherwise this route is an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRelativePath(searchParams.get("next"), "/home");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth.callback] code exchange failed", error.message);
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
