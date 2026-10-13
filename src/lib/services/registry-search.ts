// Trade name search in the registry, shared by the add page (/leki/nowy) and the suggestions route
// (/api/registry/search), so both find the same names for the same text. Kept out of ./medications.ts, which stays
// free of the Supabase client for its node tests.
import type { createClient } from "@/lib/supabase";
import { reportError } from "@/lib/observability/report";
import { type RegistryNameGroup, escapeLikePattern, groupRegistryResults } from "@/lib/services/medications";
import type { RegistryProduct } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

// Rows read for one search. Grouping needs every variant of a name to count it; a name has far fewer variants
// than this, so the first names of the result are complete.
const MAX_SEARCH_ROWS = 1000;

// escapeLikePattern makes `%`, `_` and `\` literal for Postgres. PostgREST additionally reads `*` in a like pattern
// as `%`, so it is escaped too: otherwise typing `*` would list the whole registry.
export function likeLiteral(input: string): string {
  return escapeLikePattern(input).replaceAll("*", "\\*");
}

// Every trade name containing `query` (case-insensitive), grouped by name with the id of its first row, sorted
// alphabetically. `null` when the query failed; the error code is reported here, never the message.
export async function searchRegistryNames(
  supabase: SupabaseClient,
  query: string,
): Promise<RegistryNameGroup[] | null> {
  const { data, error } = await supabase
    .from("registry_products")
    .select("id, product_name")
    .ilike("product_name", `%${likeLiteral(query)}%`)
    // Ordered by id within a name, so a group's productId is the same on the page and in the suggestions.
    .order("product_name")
    .order("id")
    .limit(MAX_SEARCH_ROWS)
    .overrideTypes<Pick<RegistryProduct, "id" | "product_name">[], { merge: false }>();
  if (error) {
    reportError("registry.search", { code: error.code });
    return null;
  }
  return groupRegistryResults(data);
}
