import type { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

// Highest terms version the signed-in account accepted, null when it accepted none. RLS returns only own rows;
// the user_id filter lets the query use the (user_id, version) index. A failed query also returns null: the gate
// fails closed and sends the account to acceptance instead of opening the interior. Reports only the error code.
export async function latestAcceptedTermsVersion(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  if (error) {
    reportError("terms.read-accepted", { code: error.code });
    return null;
  }
  return data?.version ?? null;
}
