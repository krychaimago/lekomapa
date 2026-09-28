import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
  showLabel?: string;
  hideLabel?: string;
}

export function PasswordToggle({
  visible,
  onToggle,
  showLabel = "Pokaż hasło",
  hideLabel = "Ukryj hasło",
}: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-0 flex size-12 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
      aria-label={visible ? hideLabel : showLabel}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
