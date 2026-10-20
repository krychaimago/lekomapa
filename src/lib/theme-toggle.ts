// Header color mode icon without a reload (ThemeToggle.astro). The click sends the same form POST the page would
// send without JavaScript, so the cookie and the server rendering stay the one mechanism; only the page is not
// reloaded, and a form being filled in elsewhere on the screen keeps its values. If the POST fails, the form is sent
// the old way, so the choice is never silently lost.

const DARK = "dark";

function applyTheme(doc: Document, theme: "light" | "dark") {
  doc.documentElement.classList.toggle(DARK, theme === DARK);
  doc.documentElement.dataset.theme = theme;
  // The "Wygląd" section on Konto shows the saved choice; keep it in step with the icon.
  for (const radio of doc.querySelectorAll<HTMLInputElement>('input[type="radio"][name="theme"]')) {
    radio.checked = radio.value === theme;
  }
}

async function save(form: HTMLFormElement, body: FormData): Promise<boolean> {
  try {
    // The route answers 303 to the screen the form came from; following it would render that whole screen again
    // for nothing. A manual redirect still stores the Set-Cookie of the answer.
    const response = await fetch(form.action, { method: "POST", body, redirect: "manual", credentials: "same-origin" });
    return response.type === "opaqueredirect" || response.ok;
  } catch {
    return false;
  }
}

export function initThemeToggles(doc: Document) {
  for (const form of doc.querySelectorAll<HTMLFormElement>("form[data-theme-toggle]")) {
    form.addEventListener("submit", (event) => {
      const button = event.submitter;
      if (!(button instanceof HTMLButtonElement)) return;
      const theme = button.value;
      if (theme !== "light" && theme !== "dark") return;
      event.preventDefault();

      const body = new FormData(form, button);
      applyTheme(doc, theme);
      // The pressed button is now hidden (dark:hidden / hidden dark:inline-flex); keep the keyboard on the icon.
      const other = form.querySelector<HTMLButtonElement>(`button[name="theme"]:not([value="${theme}"])`);
      if (doc.activeElement === button) other?.focus();

      void save(form, body).then((saved) => {
        if (saved) return;
        // submit() sends no submitter, so the chosen value goes in a field of its own.
        const field = doc.createElement("input");
        field.type = "hidden";
        field.name = "theme";
        field.value = theme;
        form.appendChild(field);
        form.submit();
      });
    });
  }
}
