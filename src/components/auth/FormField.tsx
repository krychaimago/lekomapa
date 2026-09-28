import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// The label has no color class: it inherits the text color of the card it sits on
// (the product card or the starter bg-cosmic card). The input and the error carry their own background.
const inputBase =
  "h-12 w-full rounded-lg border bg-background px-3 pl-10 text-base text-foreground placeholder:text-muted-foreground transition-colors";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  // Word that makes the error recognisable without color.
  errorLabel?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  errorLabel = "Uwaga:",
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputBase, endContent && "pr-12", error ? "border-destructive" : "border-input")}
        />
        {endContent}
      </div>
      {error ? (
        <p
          id={errorId}
          className="border-destructive-border bg-destructive-surface text-destructive mt-1 flex items-start gap-1 rounded-md border px-2 py-1 text-sm"
        >
          <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{errorLabel}</strong> {error}
          </span>
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
