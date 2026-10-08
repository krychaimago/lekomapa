// Polish copy for the entry screens in the spread layout (S-01): the left page, sign-in, sign-up, "check your
// inbox", address confirmation, the expired confirmation link and terms re-acceptance. Wording from appendix A of
// context/changes/terms-acceptance-on-signup/plan.md; scripts/fr012/auth-copy.test.mjs runs it through the
// FR-012 stem filter.

import { MIN_PASSWORD_LENGTH } from "./password-recovery.ts";

export const AUTH_COPY = {
  spread: {
    productName: "lekomapa",
    heading: "Dzienniczek leków i samopoczucia",
    // Shown on large screens only.
    points: [
      "Zapisuj leki, które przyjmujesz, i okresy ich przyjmowania.",
      "Notuj samopoczucie z datą i godziną.",
      "Przygotuj pytania na rozmowę z lekarzem.",
    ],
    privacyNote: "Swoje wpisy widzisz tylko Ty.",
    privacyLink: "Prywatność",
  },
  signIn: {
    pageTitle: "Logowanie",
    heading: "Witaj w lekomapie",
    emailLabel: "Adres e-mail",
    emailPlaceholder: "twoj@adres.pl",
    passwordLabel: "Hasło",
    submit: "Zaloguj się",
    pending: "Logowanie...",
    signUpPrompt: "Nie masz konta?",
    signUpLink: "Załóż je",
  },
  signUp: {
    pageTitle: "Rejestracja",
    heading: "Załóż konto",
    intro: "Konto zakładasz adresem e-mail i hasłem.",
    emailLabel: "Adres e-mail",
    emailPlaceholder: "twoj@adres.pl",
    passwordLabel: "Hasło",
    passwordHint: `Co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    confirmLabel: "Powtórz hasło",
    // The checkbox label: termsBefore + link (termsLink → /warunki) + termsAfter.
    termsBefore: "Akceptuję ",
    termsLink: "warunki korzystania",
    termsAfter: ".",
    submit: "Załóż konto",
    pending: "Zakładanie konta...",
    signInPrompt: "Masz już konto?",
    signInLink: "Zaloguj się",
    // Word before the terms checkbox error, so the error is recognisable without color.
    termsErrorLabel: "Uwaga:",
  },
  // Client-side validation in the sign-in and sign-up forms, before the form is sent.
  validation: {
    emailRequired: "Wpisz adres e-mail.",
    emailInvalid: "Wpisz poprawny adres e-mail.",
    passwordRequired: "Wpisz hasło.",
    passwordTooShort: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    confirmRequired: "Powtórz hasło.",
  },
  checkInbox: {
    pageTitle: "Sprawdź skrzynkę",
    heading: "Sprawdź skrzynkę",
    body: "Wysłaliśmy wiadomość z odnośnikiem potwierdzającym adres. Kliknij go, a potem zaloguj się.",
    noMail: "Nie widzisz wiadomości? Sprawdź folder ze spamem.",
    // existingBefore + link (existingLink → /auth/forgot-password) + existingAfter. No mail reaches an address that
    // already has an account, and the screen must not say which case it is.
    existingBefore: "Ten adres ma już konto? Zaloguj się albo ",
    existingLink: "ustaw nowe hasło",
    existingAfter: ".",
    backToSignIn: "Wróć do logowania",
  },
  confirm: {
    pageTitle: "Potwierdź adres e-mail",
    heading: "Potwierdź adres e-mail",
    body: "Kliknij przycisk, żeby potwierdzić adres. Odnośnik działa tylko raz.",
    submit: "Potwierdź adres",
    doneHeading: "Adres potwierdzony",
    doneBody: "Możesz się teraz zalogować.",
    doneSignIn: "Zaloguj się",
  },
  confirmExpired: {
    pageTitle: "Odnośnik nie działa",
    heading: "Odnośnik wygasł albo został już użyty",
    body: "Wpisz adres e-mail konta, a wyślemy nowy odnośnik.",
    emailLabel: "Adres e-mail",
    submit: "Wyślij nowy odnośnik",
    backToSignIn: "Wróć do logowania",
  },
  acceptance: {
    pageTitle: "Warunki korzystania",
    heading: "Zaakceptuj warunki korzystania",
    // bodyBefore + link (bodyLink → /warunki) + bodyAfter; {version} is the current terms version.
    bodyBefore: "Przeczytaj ",
    bodyLink: "warunki korzystania",
    bodyAfter: " w wersji {version}. Żeby korzystać dalej, zaakceptuj je.",
    accept: "Akceptuję",
    signOut: "Wyloguj się",
    // deleteBefore + link (deleteLink → /prywatnosc) + deleteAfter.
    deleteBefore: "Jeśli nie chcesz ich akceptować, możesz usunąć konto — zobacz ",
    deleteLink: "Prywatność",
    deleteAfter: ".",
  },
  // Errors the auth routes send back as `?error=<key>`. Never a raw Supabase error.message (decision #34).
  errors: {
    credentials: "Nieprawidłowy adres e-mail lub hasło. Sprawdź oba pola albo ustaw nowe hasło.",
    unconfirmed:
      "Ten adres nie jest jeszcze potwierdzony. Kliknij odnośnik z wiadomości, którą wysłaliśmy po rejestracji.",
    terms: "Zaznacz akceptację warunków korzystania, żeby założyć konto.",
    invalid: "Wpisz poprawny adres e-mail i hasło.",
    password_mismatch: "Hasła się różnią. Wpisz to samo hasło w obu polach.",
    weak_password: `Hasło jest za krótkie albo za proste. Użyj co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
    rate_limit: "Za dużo prób w krótkim czasie. Spróbuj ponownie za kilka minut.",
    unknown: "Nie udało się wykonać tej operacji. Spróbuj ponownie za chwilę.",
  },
} as const;

export type AuthErrorCode = keyof typeof AUTH_COPY.errors;

// Unknown or missing codes show nothing: a crafted `?error=` link must not render its own text.
export function authErrorMessage(code: string | null): string | null {
  const messages = AUTH_COPY.errors;
  return code && Object.hasOwn(messages, code) ? messages[code as AuthErrorCode] : null;
}
