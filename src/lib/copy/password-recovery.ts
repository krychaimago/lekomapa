// Working copy (Polish) for password recovery (S-10): screens, the expired link state, API route errors
// and the notice after a password change. All user-visible strings of the flow live here, so the final
// wording can replace them without searching the screens.

// Same rule as signup (SignUpForm.tsx) and supabase/config.toml `minimum_password_length`.
export const MIN_PASSWORD_LENGTH = 6;

export const PASSWORD_RECOVERY_COPY = {
  forgotPassword: {
    title: "Nie pamiętasz hasła?",
    intro: "Wpisz adres e-mail swojego konta. Wyślemy na niego odnośnik do ustawienia nowego hasła.",
    emailLabel: "Adres e-mail",
    emailPlaceholder: "twoj@adres.pl",
    submit: "Wyślij odnośnik",
    pending: "Wysyłanie...",
    backToSignIn: "Wróć do logowania",
  },
  sent: {
    title: "Sprawdź skrzynkę",
    body: "Jeśli konto o tym adresie istnieje, wysłaliśmy na nie wiadomość z odnośnikiem do ustawienia nowego hasła. Odnośnik jest ważny 1 godzinę.",
    noMail: "Nie widzisz wiadomości? Sprawdź folder ze spamem albo poproś o nowy odnośnik.",
    requestAgain: "Poproś o nowy odnośnik",
    backToSignIn: "Wróć do logowania",
  },
  confirm: {
    title: "Ustaw nowe hasło",
    intro: "Kliknij przycisk, żeby przejść do ustawienia nowego hasła. Odnośnik działa tylko raz.",
    submit: "Ustaw nowe hasło",
  },
  expired: {
    title: "Odnośnik nie działa",
    body: "Ten odnośnik wygasł albo został już użyty. Odnośnik jest ważny 1 godzinę i działa tylko raz. Poproś o nowy, żeby ustawić hasło.",
    requestNew: "Poproś o nowy odnośnik",
    backToSignIn: "Wróć do logowania",
  },
  resetPassword: {
    title: "Nowe hasło",
    intro: "Wpisz nowe hasło dwa razy. Po zapisaniu zalogujesz się nim od nowa.",
    passwordLabel: "Nowe hasło",
    confirmLabel: "Powtórz nowe hasło",
    hint: `Co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    submit: "Zapisz nowe hasło",
    pending: "Zapisywanie...",
    cancel: "Anuluj i wyloguj",
  },
  // Client-side validation in the recovery forms.
  validation: {
    emailRequired: "Wpisz adres e-mail.",
    emailInvalid: "Wpisz poprawny adres e-mail.",
    passwordRequired: "Wpisz nowe hasło.",
    passwordTooShort: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    confirmRequired: "Powtórz nowe hasło.",
    mismatch: "Hasła nie są takie same.",
  },
  // Errors the API routes send back as `?error=<key>`. The page looks the text up here, so the URL
  // can never put arbitrary text on screen. Never a raw Supabase error.message.
  apiErrors: {
    invalidEmail: "Wpisz poprawny adres e-mail.",
    notConfigured: "Usługa logowania jest chwilowo niedostępna. Spróbuj ponownie później.",
    passwordTooShort: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    mismatch: "Hasła nie są takie same.",
    samePassword: "Nowe hasło musi się różnić od poprzedniego.",
    weakPassword: "To hasło jest zbyt słabe. Wybierz inne.",
    generic: "Nie udało się zapisać nowego hasła. Spróbuj ponownie.",
  },
  signIn: {
    forgotPasswordLink: "Nie pamiętasz hasła?",
    // Says only that the password changed: after a failed global sign-out other sessions may survive.
    resetDone: "Hasło zostało zmienione. Zaloguj się nowym hasłem.",
  },
} as const;

export type ApiErrorCode = keyof typeof PASSWORD_RECOVERY_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted `?error=` link must not render its own text.
export function apiErrorMessage(code: string | null): string | null {
  const messages = PASSWORD_RECOVERY_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as ApiErrorCode] : null;
}
