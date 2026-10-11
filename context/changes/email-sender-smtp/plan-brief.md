# Własny nadawca maili (F-05) — Plan Brief

> Full plan: `context/changes/email-sender-smtp/plan.md`

## What & Why

Maile z odnośnikami (potwierdzenie adresu, reset hasła) dochodzą dziś tylko do członków zespołu projektu Supabase, a szablonów nie da się edytować. Obca osoba nie potwierdzi konta ani nie odzyska hasła, a przy testach na koncie autorki wszystko wygląda na działające. F-05 musi być gotowe, zanim produkt wpuści inne osoby.

## Starting Point

Domena `lekomapa.pl` działa: DNS w Cloudflare, MX i SPF wskazują OVH, ale OVH nie pozwala założyć skrzynki (pomiar 11.10.2026). Produkcja wysyła domyślnym nadawcą Supabase. Strona prywatności mówi „Maile z odnośnikami wysyła Supabase.” Trzy kroki z wcześniejszych zmian czekają na własny SMTP: szablon resetu i reset na produkcji (`password-recovery` 3.7, 3.8) oraz szablon potwierdzenia (`terms-acceptance-on-signup` 5.5).

## Desired End State

Osoba spoza zespołu dostaje polskie maile od `Lekomapa <kontakt@lekomapa.pl>`, potwierdza adres i resetuje hasło na produkcji. Mail jest w odebranych w Gmailu i na polskiej poczcie, z SPF, DKIM i DMARC = PASS. Strona prywatności nazywa Brevo i przekierowanie odpowiedzi do Gmaila. Mail na `kontakt@lekomapa.pl` trafia do Gmaila autorki.

## Key Decisions Made

| Decision                     | Choice                                                                                                 | Why (1 sentence)                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Dostawca wysyłki             | Brevo, darmowy plan (300 maili dziennie)                                                               | Firma z UE, spójna z resztą tekstu o danych w Europie.                                                                   |
| Nadawca                      | `Lekomapa <kontakt@lekomapa.pl>`, odpowiedzi przez Cloudflare Email Routing na `krysko.anna@gmail.com` | OVH nie pozwala założyć skrzynki (11.10.2026); przekierowanie jest darmowe, a Gmail jest już kontaktem na `/prywatnosc`. |
| Informacja dla użytkowniczki | Jedno zdanie na stronie prywatności, warunki v1 bez zmian                                              | Zdanie o nadawcy jest na stronie prywatności, nie w warunkach — nikt nie akceptuje ponownie.                             |
| Kolejność                    | Przygotowanie → merge zdania → przełączenie tego samego dnia                                           | Okno, w którym strona i faktyczny nadawca się rozjeżdżają, trwa minuty.                                                  |
| Limit maili                  | 30 na godzinę                                                                                          | Domyślny Supabase po własnym SMTP; hamuje serie fałszywych rejestracji.                                                  |
| Zaległe szablony             | Wchodzą do zmiany (3.7, 3.8, 5.5)                                                                      | Jedno sprawdzenie zamyka F-05 i oba zaległe kroki; reset zaczyna działać.                                                |
| Sprawdzenie                  | Gmail + polska poczta spoza zespołu, nagłówki PASS                                                     | Dwie najczęstsze poczty i dowód, że wpisy DNS działają.                                                                  |

## Scope

**In scope:**

- przekierowanie `kontakt@lekomapa.pl` w Cloudflare Email Routing (MX na Cloudflare), konto i domena w Brevo, wpisy DNS w Cloudflare,
- zdanie na stronie prywatności, README, `infrastructure.md`,
- SMTP, limit i oba szablony w panelu Supabase,
- rejestracja i reset na dwóch obcych adresach, zamknięcie zaległych kroków.

**Out of scope:**

- warunki v2, migracje, zmiany w lokalnym `config.toml` (mailpit zostaje),
- płatna poczta OVH, wysyłanie odpowiedzi z adresu `kontakt@`, catch-all,
- kod tras auth i treść szablonów `supabase/templates/*.html`,
- płatne usunięcie dopisku „Sent with Brevo”, monitoring doręczalności (F-06).

## Architecture / Approach

Supabase Auth → SMTP Brevo (`smtp-relay.brevo.com:587`) → skrzynka odbiorcy. Brevo podpisuje maile DKIM-em domeny `lekomapa.pl`; odpowiedzi idą przez MX Cloudflare (Email Routing) do Gmaila autorki. Klucz SMTP istnieje wyłącznie w panelu Supabase. W kodzie zmienia się tylko jedno zdanie i dokumentacja; reszta to panele, które obsługuje autorka.

## Phases at a Glance

| Phase                             | What it delivers                                                     | Key risk                                                                   |
| --------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Przygotowanie poza kodem       | Przekierowanie Cloudflare, Brevo z SMTP, domena uwierzytelniona, DNS | Drugi rekord SPF albo DKIM za proxy Cloudflare; czekanie na aktywację SMTP |
| 2. Strona prywatności i dokumenty | Nowe zdanie na produkcji, README, rejestr ryzyk                      | Merge przed fazą 1 wydłuża okno nieprawdy                                  |
| 3. Przełączenie i sprawdzenie     | Brevo w Supabase, polskie szablony, reset działa dla obcych          | Maile w spamie na polskiej poczcie                                         |

**Prerequisites:** dostęp do paneli Cloudflare, Brevo i produkcyjnego Supabase; dwa adresy testowe spoza zespołu Supabase (Gmail i WP/Onet/Interia).
**Estimated effort:** ~2–3 sesje; faza 1 może czekać dzień–dwa na Brevo.

## Open Risks & Assumptions

- Założenie o skrzynce w OVH nie przetrwało pomiaru (11.10.2026) — zastąpione przekierowaniem Cloudflare (wariant B).
- Dopisek „Sent with Brevo” może pojawić się w stopce maili transakcyjnych na darmowym planie — sprawdzamy i odnotowujemy.
- Po wyczerpaniu limitu (30/h albo 300 dziennie) nowe osoby nie dostaną maila, a trasy nie pokażą błędu dostawcy — wpis w rejestrze ryzyk, obserwacja w F-06.

## Success Criteria (Summary)

- Obca osoba zakłada konto, potwierdza adres i resetuje hasło na produkcji z polskich maili od `kontakt@lekomapa.pl`.
- Nagłówki w Gmailu: SPF, DKIM i DMARC = PASS; mail w odebranych także na polskiej poczcie.
- Strona prywatności mówi prawdę o nadawcy, a mail na `kontakt@` dochodzi do Gmaila autorki.
