import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUTH_COPY } from "@/lib/copy/auth";

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  // Word that makes the error recognisable without color.
  errorLabel?: string;
}

// Native checkbox, so the form posts `terms=accepted` without JavaScript; the sign-up route rejects the form
// without it. The label is the hit area: the box and the text together stay above 44 px.
export function TermsCheckbox({
  checked,
  onChange,
  error,
  errorLabel = AUTH_COPY.signUp.termsErrorLabel,
}: TermsCheckboxProps) {
  const copy = AUTH_COPY.signUp;
  const errorId = "terms-error";

  return (
    <div>
      <label htmlFor="terms" className="flex min-h-12 cursor-pointer items-center gap-3">
        <input
          id="terms"
          name="terms"
          type="checkbox"
          value="accepted"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn("accent-primary size-6 shrink-0", error && "outline-destructive outline-2")}
        />
        <span>
          {copy.termsBefore}
          <a href="/warunki" className="text-primary underline underline-offset-4 hover:no-underline">
            {copy.termsLink}
          </a>
          {copy.termsAfter}
        </span>
      </label>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="border-destructive-border bg-destructive-surface text-destructive mt-1 flex items-start gap-1 rounded-md border px-2 py-1 text-sm"
        >
          <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{errorLabel}</strong> {error}
          </span>
        </p>
      )}
    </div>
  );
}
