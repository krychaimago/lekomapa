import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
  // Word that makes the error recognisable without color.
  label?: string;
}

export function ServerError({ message, label = "Uwaga:" }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="border-destructive-border bg-destructive-surface text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{label}</strong> {message}
      </span>
    </p>
  );
}
