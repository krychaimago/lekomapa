// Terms of use (S-01). The text is the approved context/foundation/terms-of-use-v1.md, word for word —
// scripts/terms/terms-text.test.mjs keeps them identical. A version never changes: version 2 is a new file,
// a new terms_versions row in a migration and a new CURRENT_TERMS_VERSION, never an edit of TERMS_V1.

// The version every account must have accepted to use the app. Must have a terms_versions row (migration).
export const CURRENT_TERMS_VERSION = 1;

// Day version 1 takes effect (ISO, YYYY-MM-DD). Set by a separate commit right before the merge to main, together
// with the same day in terms-of-use-v1.md; until then the page shows the version without a date.
export const TERMS_V1_EFFECTIVE_ON: string | null = "2026-10-08";

// Markers filled by the page: {effectiveOn} with the date, {privacyLink} with a link to /prywatnosc.
export const TERMS_V1 = {
  title: "Warunki korzystania z lekomapy",
  versionLine: "Wersja 1 · obowiązuje od {effectiveOn}",
  versionLineUndated: "Wersja 1",
  privacyLinkText: "strona prywatności",
  sections: [
    {
      heading: "Do czego służy lekomapa",
      points: [
        "Pomaga zapisywać przyjmowane leki i samopoczucie oraz przygotować się do rozmowy z lekarzem.",
        "Informacje o możliwych interakcjach mają charakter poglądowy.",
        "Lekomapa nie jest usługą medyczną ani diagnozą.",
        "Nie jest podstawą do zmiany dawkowania. Decyzje o leczeniu podejmuj z lekarzem lub farmaceutą.",
        "Brak informacji o interakcji nie oznacza, że połączenie leków jest bezpieczne. Lekomapa zna tylko wybrane leki i wybrane interakcje.",
      ],
    },
    {
      heading: "Na czas prototypu",
      points: [
        "Lekomapa jest prototypem zbudowanym w ramach kursu programowania, dostępnym publicznie w wersji demonstracyjnej.",
        "Wpisuj dane przykładowe, a nie leki, które naprawdę przyjmujesz, i objawy, które naprawdę masz. Dotyczy to też danych innych osób.",
        "Prototyp może zostać zmieniony, wyczyszczony albo wyłączony bez uprzedzenia, razem z kontem i wszystkimi wpisami. Nie przechowuj tu niczego, czego potrzebujesz.",
      ],
    },
    {
      heading: "Prywatność i kontakt",
      points: [
        "Jakie dane zbieramy, gdzie są przechowywane i jak usunąć konto: {privacyLink}.",
        "Pytania: krysko.anna@gmail.com",
        "Gdy warunki się zmienią, przy następnym logowaniu poprosimy o zapoznanie się z nową wersją i jej akceptację.",
      ],
    },
  ],
} as const;

// "2026-10-07" → "07.10.2026"; the same form goes into terms-of-use-v1.md.
export function formatEffectiveOn(isoDate: string): string {
  return isoDate.split("-").reverse().join(".");
}

// Privacy page /prywatnosc (plan appendix A.2). Lists only what is deployed: the error tracker joins the list with F-06.
export const PRIVACY_COPY = {
  title: "Prywatność w lekomapie",
  intro: "Lekomapa jest prototypem w wersji demonstracyjnej. Wpisuj wyłącznie dane przykładowe.",
  sections: [
    {
      heading: "Kto odpowiada za serwis",
      points: ["testFit Anna Kryśko.", "Kontakt: krysko.anna@gmail.com"],
    },
    {
      heading: "Jakie dane zbieramy",
      points: [
        "Adres e-mail i hasło konta. Hasło zapisujemy w postaci, z której nie da się go odczytać.",
        "Datę i wersję zaakceptowanych warunków korzystania.",
        "Wpisy, które sama lub sam dodajesz: leki, okresy ich przyjmowania i wpisy o samopoczuciu.",
        "Adres e-mail jest daną osobową niezależnie od tego, że to prototyp.",
      ],
    },
    {
      heading: "Gdzie leżą dane",
      points: [
        "Konta i wpisy przechowuje Supabase, w regionie Frankfurt nad Menem (Niemcy).",
        "Aplikację uruchamia Cloudflare. Przy każdym połączeniu Cloudflare przetwarza dane techniczne, takie jak adres IP.",
        "Maile z odnośnikami wysyła Brevo (Francja). Odnośnik w mailu przechodzi przez serwer Brevo, który liczy otwarcia i kliknięcia bez łączenia ich z adresem e-mail. Odpowiedzi na maile Cloudflare przekazuje do skrzynki Gmail (Google) osoby odpowiedzialnej za serwis.",
      ],
    },
    {
      heading: "Kto widzi twoje wpisy",
      points: [
        "Inne konta nie widzą twoich wpisów, a ty nie widzisz cudzych.",
        "Osoba odpowiedzialna za serwis ma techniczny dostęp do bazy danych.",
      ],
    },
    {
      heading: "Ciasteczka",
      points: [
        "Używamy wyłącznie ciasteczek potrzebnych do logowania i jednego ciasteczka, które zapamiętuje wybrany wygląd: jasny, ciemny lub jak w systemie. Nie ma reklam ani statystyk odwiedzin.",
      ],
    },
    {
      heading: "Jak usunąć konto",
      points: [
        "Wejdź w Konto → Usuń konto i potwierdź hasłem. Konto znika od razu razem ze wszystkimi wpisami, bez kopii.",
        "Jeśli nie możesz się zalogować albo nie akceptujesz nowej wersji warunków, napisz z adresu konta na krysko.anna@gmail.com. Usunę konto razem ze wszystkimi wpisami, bez kopii.",
      ],
    },
    {
      heading: "Na czas prototypu",
      points: ["Prototyp może zostać wyczyszczony albo wyłączony bez uprzedzenia, razem z kontami i wpisami."],
    },
  ],
} as const;

// Links around the terms and privacy pages, and the demo bar link (plan appendix A.1).
export const LEGAL_LINKS_COPY = {
  demoBar: "Co to znaczy?",
  terms: "Warunki korzystania",
  privacy: "Prywatność",
  backToSignIn: "Wróć do logowania",
} as const;
