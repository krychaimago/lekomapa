# Wspólna warstwa wizualna i szkielet wnętrza — Plan Brief

> Full plan: `context/changes/app-shell-visual-foundation/plan.md`
> Frame brief: `context/changes/mvp-scope-ui-and-data-processing/frame.md` (frame zakresu UI, z którego wyrosła pozycja F-04)

## What & Why

F-04 z roadmapy: wspólne podłoże, na którym stają ekrany plasterków. Jedna lista nazwanych kolorów w obu trybach, polski dokument, stały pasek „wersja demonstracyjna” i pusty szkielet wnętrza. Frame nazwał problem tak: roadmapa nie przypisywała nikomu wspólnej warstwy wizualnej, na której mają stanąć ekrany plasterków. Bez niej każdy ekran powstałby z kolorami wpisanymi na sztywno i trzeba by go przerabiać przy każdej zmianie palety i przy trybie ciemnym.

## Starting Point

- Kolory w `src/styles/global.css` to szarości startera shadcn.
- 15 plików w `src/` ma kolory wpisane na sztywno.
- Dokument ma `lang="en"`.
- Strona główna i `/dashboard` to kosmiczne ekrany startera po angielsku.
- Mechanizm trybu ciemnego (klasa `.dark`) już jest, bez wartości Mech.

## Desired End State

- Każdy kolor produktu ma nazwę i dwie wartości, jasną i ciemną, w jednym pliku.
- Test mierzy kontrast każdej pary tekst–tło w obu trybach (≥ 7 : 1).
- Drugi test odrzuca kolor wpisany na sztywno w `src/`.
- Każdy ekran ma pasek demonstracyjny.
- Zalogowana osoba trafia do pustego szkieletu wnętrza: pas boczny na dużym ekranie, nagłówek na telefonie.
- Plasterek dopina swój ekran jedną pozycją w `NAV_ITEMS`.

## Key Decisions Made

| Decision                   | Choice                                                                                                                              | Why (1 sentence)                                                                             | Source           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| Kolory                     | Wyłącznie tokeny z jednego pliku, w obu trybach, żadnych kolorów na sztywno                                                         | Zmiana palety i tryb ciemny kosztują jedną linijkę zamiast przeróbki ekranów                 | Plan (autorka)   |
| Tekst przygaszony          | `#5A6259` → `#4C534C`                                                                                                               | Wartość z makiety miała 6,31 : 1 na bieli, poniżej progu 7 : 1                               | Plan             |
| Pas boczny                 | Wyłącznie pełny tekst                                                                                                               | Tekst przygaszony na chromie miał 3,81 : 1                                                   | Plan             |
| Aktywna pozycja menu       | Tło + pogrubienie + kreska                                                                                                          | Rozpoznawalna bez rozróżniania barw                                                          | Plan             |
| Czytelność                 | Tekst ≥ 15 px (telefon) / 17 px (duży ekran), przyciski ≥ 48 px, widoczny fokus                                                     | Reguły z makiety działają od pierwszego ekranu                                               | Plan (makieta)   |
| Pasek demonstracyjny       | U góry, w jasnej zieleni, „Wersja demonstracyjna. Nie wpisuj prawdziwych danych o zdrowiu.” (robocze)                               | Bursztyn zostaje wyłącznie dla możliwej interakcji                                           | Plan             |
| Tryb ciemny                | Wartości teraz, po akceptacji makiety; przełącznik w S-11                                                                           | Każdy ekran z plasterka od razu ma wersję ciemną                                             | Plan (autorka)   |
| Błędy                      | Token `destructive` w stonowanej czerwieni, z ikoną lub słowem                                                                      | Błąd techniczny to co innego niż możliwa interakcja; czerwień nie trafia do treści o zdrowiu | Plan (autorka)   |
| Ekrany startera            | `/dashboard` = szkielet, `/` przekierowuje, Welcome/Topbar/LibBadge usunięte; ekrany wejściowe bez zmian                            | Poza ekranami wejściowymi nie zostaje nic do przerabiania                                    | Plan             |
| Wylogowanie                | Dół pasa bocznego / nagłówek na telefonie                                                                                           | Zakładki zostają dla ekranów produktu, jak w makiecie                                        | Plan             |
| Menu                       | Pusta lista `NAV_ITEMS`, zakładki ukryte do pierwszej pozycji; aktywna najwyżej jedna pozycja (granica segmentu, najdłuższe `href`) | Brak martwych odnośników na produkcji                                                        | Plan             |
| Ochrona tras               | Middleware chroni `/dashboard` i każdą ścieżkę z `NAV_ITEMS`                                                                        | Plasterek dopisuje ekran w jednym miejscu, ochrona przychodzi sama                           | Plan review (F4) |
| Tryb ciemny w komponentach | Bez kolorowych klas `dark:` — wyłącznie tokeny; skaner to pilnuje                                                                   | Test kontrastu mierzy to, co naprawdę widać                                                  | Plan review (F2) |
| Bramka                     | Skaner w `npm test` + reguła w `CLAUDE.md`                                                                                          | Agent zna regułę, CI łapie, gdy zapomni                                                      | Plan             |
| Test kontrastu             | Pary `X-foreground`/`X` liczone mechanicznie + jawna lista dodatkowych                                                              | Nowy token tekstu dostaje test bez pamiętania                                                | Plan review (F3) |
| Zakres wnętrza             | Pusty szkielet, bez ekranów domenowych                                                                                              | Zakres zamknięty w roadmapie                                                                 | Frame / roadmapa |

## Scope

**In scope:**

- tokeny jasne i ciemne z testem kontrastu,
- `lang="pl"` i pasek demonstracyjny,
- rozmiary tekstu i przycisków,
- `Banner` i przycisk shadcn na tokenach,
- `AppLayout` z pasem bocznym i zakładkami,
- ochrona tras z menu w middleware,
- przekierowanie `/` (z poprawką kroku smoke),
- usunięcie plików startera,
- skaner kolorów,
- zapis reguł w `CLAUDE.md`, `design-draft.md` i roadmapie.

**Out of scope:**

- ekrany domenowe i pozycje menu,
- przebudowa ekranów wejściowych (S-01, S-10),
- przełącznik trybu ciemnego (S-11),
- nota o prywatności i odnośnik na pasku (S-01),
- krój pisma,
- formalna zgodność ze standardem dostępności.

## Architecture / Approach

`global.css` jest jedynym źródłem kolorów:

- nazwy shadcn (`primary`, `accent`, `muted`, `sidebar-*`, `destructive`) z wartościami Mech,
- nowe role: `interaction*`, `demo-bar*`, `destructive-surface`/`-border`, `accent-border`.

Na tym stoją dwa layouty:

- `Layout.astro`: dokument, pasek demonstracyjny, dla każdej strony,
- `AppLayout.astro`: rama wnętrza z menu z `src/lib/navigation.ts`.

Dwa testy w `scripts/tokens/` pilnują kontraktu. Jeden mierzy kontrast, drugi skanuje `src/` w poszukiwaniu kolorów wpisanych na sztywno. Skaner ma listę wyjątków, a każdy wyjątek wskazuje plasterek, który go usuwa.

## Phases at a Glance

| Phase                        | What it delivers                                                                                                               | Key risk                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1. Tokeny i pomiar kontrastu | Makieta ciemnej palety do akceptacji, lista tokenów w obu trybach, test kontrastu                                              | Ciemna paleta projektowana przed ekranami — w S-11 może wymagać poprawek            |
| 2. Wspólny dokument          | `lang="pl"`, pasek, rozmiary tekstu i przycisków, Banner na tokenach                                                           | Większy tekst i pasek wydłużają ekrany wejściowe, zanim S-01 je przebuduje          |
| 3. Szkielet wnętrza          | `AppLayout`, pusta lista menu z ochroną tras, `/dashboard` jako szkielet, przekierowanie `/` i krok smoke, sprzątanie startera | Szkielet bez pozycji menu trudno ocenić — aktywna pozycja sprawdzana na tymczasowej |
| 4. Bramka i dokumenty        | Skaner kolorów z dowodem wykonania, reguły w `CLAUDE.md`, zapis w makiecie i roadmapie                                         | Fałszywe alarmy skanera (np. `#add` jako kotwica)                                   |

**Prerequisites:** brak (F-04 bez wymagań wstępnych); lokalny Supabase do `npm run smoke` w fazie 3.
**Estimated effort:** ~3–4 sesje po ok. 2 h, jedna faza na sesję; faza 1 zawiera rundę akceptacji makiety.

## Open Risks & Assumptions

- Wszystkie napisy (pasek, nagłówek, pusta karta) są robocze, zgodnie z `design-draft.md` `## Treści do ustalenia`.
- Ekrany wejściowe do czasu S-01 i S-10 mają kosmiczne tło pod paskiem w palecie Mech.
- Pomiar kontrastu nie zastępuje testu z osobami starszymi.
- Skaner łapie kolor wpisany na sztywno, ale nie łapie użycia tokenu błędu w treści o zdrowiu — to pilnuje reguła w `CLAUDE.md` i `/10x-impl-review`.

## Success Criteria (Summary)

- Każdy ekran jest po polsku i ma pasek „wersja demonstracyjna”, także przed zalogowaniem.
- Po zalogowaniu użytkowniczka widzi szkielet wnętrza w palecie Mech, czytelny na telefonie i dużym ekranie, w obu trybach.
- Nowy ekran z kolorem wpisanym na sztywno albo paleta z parą poniżej 7 : 1 nie przejdzie CI.
