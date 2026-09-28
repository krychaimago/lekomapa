declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    // True when the current session was opened from a password reset link (see src/lib/auth/recovery-session.ts).
    recoverySession: boolean;
  }
}
