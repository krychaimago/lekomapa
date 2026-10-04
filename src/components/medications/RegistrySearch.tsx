import { useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRegistrySuggestions } from "@/components/hooks/useRegistrySuggestions";
import { buttonVariants } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { MEDICATION_COPY } from "@/lib/copy/medications";
import type { RegistryNameGroup } from "@/lib/services/medications";
import { cn } from "@/lib/utils";

const copy = MEDICATION_COPY.add;
const formCopy = MEDICATION_COPY.form;
const ADD_PATH = "/leki/nowy";

interface Props {
  // Text the field starts with: the searched text or the chosen name, as the server rendered it.
  initialValue: string;
  maxLength: number;
}

interface ActiveOption {
  // The list the index points into; a new list starts with no option active.
  names: RegistryNameGroup[];
  index: number;
}

function nameUrl(name: string): string {
  return `${ADD_PATH}?${new URLSearchParams({ nazwa: name }).toString()}`;
}

// The name search on /leki/nowy. Server-rendered it is the plain GET form of phase 3 (`?q=`), so it works without
// JavaScript. Once hydrated it adds suggestions under the field (ARIA combobox with a listbox); choosing one opens
// that name's variants (`?nazwa=`). The "Szukaj" button keeps submitting the form as before.
export default function RegistrySearch({ initialValue, maxLength }: Props) {
  const id = useId();
  const inputId = "q";
  const listboxId = `${id}-suggestions`;
  const hintId = `${id}-hint`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [value, setValue] = useState(initialValue);
  // Suggestions are asked for only after the user types, not for the text the page came back with.
  const [typed, setTyped] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState<ActiveOption | null>(null);

  const { names, loaded } = useRegistrySuggestions(typed ? value : "");
  const activeIndex = active?.names === names ? active.index : -1;
  const open = typed && !dismissed && names.length > 0;
  const announcement =
    typed && !dismissed && loaded
      ? names.length > 0
        ? copy.suggestionsCount.replace("{liczba}", String(names.length))
        : copy.suggestionsNone
      : "";

  function choose(name: string) {
    setDismissed(true);
    window.location.assign(nameUrl(name));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    setTyped(true);
    setDismissed(false);
    setActive(null);
  }

  function moveActive(step: number) {
    if (names.length === 0) return;
    const start = open ? activeIndex : -1;
    const next = start === -1 ? (step > 0 ? 0 : names.length - 1) : (start + step + names.length) % names.length;
    setDismissed(false);
    setActive({ names, index: next });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (names.length === 0) return;
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        if (names.length === 0) return;
        event.preventDefault();
        moveActive(-1);
        break;
      case "Enter":
        // With no active suggestion Enter submits the form, as the plain search does.
        if (open && activeIndex !== -1) {
          event.preventDefault();
          choose(names[activeIndex].name);
        }
        break;
      case "Escape":
        // Closes the list; a second Escape is left to the browser (clears a search field).
        if (open) {
          event.preventDefault();
          setDismissed(true);
          setActive(null);
        }
        break;
    }
  }

  return (
    <form method="GET" action={ADD_PATH} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {copy.searchLabel} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full">
          <input
            id={inputId}
            name="q"
            type="search"
            value={value}
            maxLength={maxLength}
            required
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-describedby={hintId}
            aria-activedescendant={open && activeIndex !== -1 ? optionId(activeIndex) : undefined}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setDismissed(true);
            }}
            className={inputClassName}
          />
          <ul
            id={listboxId}
            role="listbox"
            aria-label={copy.suggestionsLabel}
            hidden={!open}
            className="border-border bg-popover text-popover-foreground absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border py-1 shadow-md"
          >
            {open &&
              names.map((group, index) => (
                <li
                  key={group.name}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Keeps focus in the field, so the blur does not close the list before the click lands.
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    choose(group.name);
                  }}
                  className={cn(
                    "hover:bg-accent hover:text-accent-foreground flex min-h-12 cursor-pointer items-center justify-between gap-4 px-3 py-2",
                    index === activeIndex && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm">{copy.variants.replace("{liczba}", String(group.variants))}</span>
                </li>
              ))}
          </ul>
        </div>
        <button type="submit" className={cn(buttonVariants(), "sm:w-auto")}>
          {copy.searchSubmit}
        </button>
      </div>
      <p id={hintId} className="text-muted-foreground text-sm">
        {copy.searchHint}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}
