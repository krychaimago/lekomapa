// Which screen /auth/confirm shows (S-01). Two link formats reach it:
// - our template (supabase/templates/confirmation.html): ?token_hash=…&type=email, confirmed only by the explicit POST;
// - Supabase's default template, used on production until custom SMTP (F-05) unlocks template editing: Supabase
//   verifies the address itself and redirects here with ?code=… on success or ?error=…&error_code=otp_expired when
//   the link was already used or expired (measured 2026-10-08).
// The code is not exchanged for a session: the exchange needs the code-verifier cookie from the browser that signed
// up, so a link opened on another device would show "expired" for an address that is confirmed. A hand-typed ?code=
// shows "confirmed" and grants nothing.
export type ConfirmLinkScreen =
  { screen: "token"; tokenHash: string } | { screen: "confirmed" } | { screen: "expired" };

export function confirmLinkScreen(params: URLSearchParams): ConfirmLinkScreen {
  if (params.get("confirmed") === "1") return { screen: "confirmed" };
  if (params.get("expired") === "1" || params.has("error")) return { screen: "expired" };

  const tokenHash = params.get("token_hash");
  if (tokenHash && params.get("type") === "email") return { screen: "token", tokenHash };

  if (params.get("code")) return { screen: "confirmed" };
  return { screen: "expired" };
}
