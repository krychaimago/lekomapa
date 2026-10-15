// Working copy (Polish) for the account screens (S-09): the account screen, the deletion confirmation, the public
// "account deleted" page and the API route errors. scripts/account/account-copy.test.mjs runs every string here
// through the FR-012 stem filter, so the module has only string fields. Nothing here links a symptom to a medication,
// so no text needs the "może mieć związek" wording; the texts still avoid every stem, the dose stem included.

export const ACCOUNT_COPY = {
  // /konto
  account: {
    title: "Konto",
    emailLabel: "Adres e-mail",
    deleteHeading: "Usunięcie konta",
    deleteIntro: "Możesz usunąć konto razem ze wszystkimi danymi zapisanymi w lekomapie.",
    deleteLink: "Usuń konto",
  },
  // /konto/usun. Plain wording, no alarm, as in MEDICATION_COPY.deletion: it says what goes, that no copy stays and
  // that it cannot be undone.
  deletion: {
    title: "Usunięcie konta",
    intro: "Usunięcie konta kasuje na stałe wszystkie dane zapisane w lekomapie:",
    // One string per list item, in the order the screen shows them.
    items: {
      medications: "leki razem z całą historią zmian,",
      journal: "wpisy dziennika razem z objawami i notatkami,",
      terms: "zapis akceptacji warunków korzystania.",
    },
    questions: "Pytania do lekarza powstają z tych danych, więc znikną razem z nimi.",
    irreversible: "Nie zostaje żadna kopia. Tego nie da się cofnąć.",
    passwordLabel: "Hasło",
    passwordHint: "Wpisz hasło do konta, aby potwierdzić usunięcie.",
    submit: "Usuń konto",
    cancel: "Anuluj",
  },
  // /auth/konto-usuniete, public: the session is gone by the time it renders.
  deleted: {
    pageTitle: "Konto usunięte",
    heading: "Konto zostało usunięte",
    body: "Twoje konto i wszystkie zapisane w nim dane zostały usunięte. Nie zostaje żadna kopia.",
    homeLink: "Przejdź na stronę główną",
  },
  // Keys POST /api/account/delete sends back as `?error=<key>`. The screen looks the text up here, so a URL can never
  // put arbitrary text on screen. Never a raw Supabase error.message.
  apiErrors: {
    // invalid_credentials from signInWithPassword, and an empty password field.
    wrongPassword: "Nieprawidłowe hasło. Konto nie zostało usunięte.",
    // 429 / over_request_rate_limit: Supabase counts the attempts.
    rateLimit: "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie. Konto nie zostało usunięte.",
    // 28000 and AD001 raised by delete_own_account (supabase/migrations/20261010120000_delete_own_account.sql).
    sessionExpired: "Sesja wygasła. Zaloguj się ponownie i spróbuj jeszcze raz. Konto nie zostało usunięte.",
    deleteGeneric: "Nie udało się usunąć konta. Spróbuj ponownie.",
  },
} as const;

export type AccountApiErrorCode = keyof typeof ACCOUNT_COPY.apiErrors;

// Unknown or missing codes show nothing: a crafted URL must not render its own text.
export function apiErrorMessage(code: string | null | undefined): string | null {
  const messages = ACCOUNT_COPY.apiErrors;
  return code && Object.hasOwn(messages, code) ? messages[code as AccountApiErrorCode] : null;
}
