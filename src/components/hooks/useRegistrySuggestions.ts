import { useEffect, useState } from "react";
import type { RegistryNameGroup } from "@/lib/services/medications";
import { SUGGESTION_QUERY_MAX, SUGGESTION_QUERY_MIN } from "@/lib/registry-suggestions";

const DEBOUNCE_MS = 250;
const SEARCH_PATH = "/api/registry/search";

export interface RegistrySuggestions {
  names: RegistryNameGroup[];
  // True once an answer for the current text has arrived; false while typing, waiting or after a failure.
  loaded: boolean;
}

const EMPTY: RegistrySuggestions = { names: [], loaded: false };

interface Answer {
  // The text the names were found for.
  text: string;
  names: RegistryNameGroup[];
}

function isNameGroup(value: unknown): value is RegistryNameGroup {
  if (typeof value !== "object" || value === null) return false;
  const group = value as Record<string, unknown>;
  return typeof group.name === "string" && typeof group.variants === "number" && typeof group.productId === "string";
}

// Trade names suggested for `query`, asked for DEBOUNCE_MS after the last keystroke. A newer query aborts the
// request of the older one, so a late answer never replaces the list for the text now in the field. Any failure
// leaves the list empty: the plain "Szukaj" form still works without suggestions.
export function useRegistrySuggestions(query: string): RegistrySuggestions {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const text = query.trim();
  const searchable = text.length >= SUGGESTION_QUERY_MIN && text.length <= SUGGESTION_QUERY_MAX;

  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          // The typed text goes in the body, never in the URL.
          const response = await fetch(SEARCH_PATH, {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ q: text }),
          });
          if (!response.ok) return;
          const body: { names?: unknown } = await response.json();
          if (controller.signal.aborted || !Array.isArray(body.names)) return;
          setAnswer({ text, names: body.names.filter(isNameGroup) });
        } catch {
          // Aborted by a newer query, offline or an unexpected body: no suggestions, the form still submits.
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, searchable]);

  // An answer counts only for the text it was found for: while the next one is on its way the list is empty.
  if (!searchable || answer?.text !== text) return EMPTY;
  return { names: answer.names, loaded: true };
}
