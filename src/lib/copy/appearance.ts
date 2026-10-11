// Working copy (Polish) for the color mode controls: the "Wygląd" section on /konto and the icon in the interior
// header. scripts/theme/appearance-copy.test.mjs runs every string here through the FR-012 stem filter, so the module
// has only string fields. Nothing here links a symptom to a medication, so no text needs the "może mieć związek" wording.

export const APPEARANCE_COPY = {
  // /konto, "Wygląd" card
  section: {
    heading: "Wygląd",
    legend: "Tryb wyświetlania",
    // One label per value of ThemePreference (src/lib/theme.ts).
    options: {
      light: "Jasny",
      dark: "Ciemny",
      system: "Jak w systemie",
    },
    submit: "Zapisz",
  },
  // Interior header icon: each label names what the button does, not the current mode.
  toggle: {
    toDark: "Włącz tryb ciemny",
    toLight: "Włącz tryb jasny",
  },
} as const;
