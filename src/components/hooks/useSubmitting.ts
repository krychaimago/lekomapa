import { useCallback, useEffect, useState } from "react";

// Pending state for a native form POST. useFormStatus tracks only function actions,
// so a form with action="/api/..." never reports pending on its own.
export function useSubmitting(): [boolean, () => void] {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Back button restores the page from bfcache with the button still disabled.
    function reset(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  const markSubmitting = useCallback(() => {
    setSubmitting(true);
  }, []);

  return [submitting, markSubmitting];
}
