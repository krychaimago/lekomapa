---
change_id: interaction-graph
title: Interaction graph
status: implementing
created: 2026-10-17
updated: 2026-10-18
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Wysokość rzędu grafu (faza 3, 18.10.2026)

- E2E na 360 px wykazał, że przyciski leków z sąsiednich rzędów nachodzą na siebie o 5–10 px w pionie. Napisy się nie stykały, nachodziły pola dotyku.
- Przyczyna: przycisk z nazwą w 2 liniach ma 72 px, graf na telefonie ma ok. 294 px szerokości (0,82 px na jednostkę), rząd 90 jednostek ≈ 73,5 px, a rozrzut w pionie ±12 jednostek zbliża dwa punkty o kolejne 24 jednostki.
- **Decyzja autorki (18.10.2026):** wyższe rzędy (odrzucone: mniejszy rozrzut w pionie, nazwa w jednej linii). Najpierw `GRAPH_ROW_HEIGHT` 90 → 120 (wartość 110 z wariantu dalej dawała nakładanie).
- **Druga decyzja autorki (18.10.2026):** przy rzędzie 120 i rozrzucie ±12 punkty układały się w równe rzędy zamiast sieci jak na makiecie A2. Wybrany zygzak kolumn (odrzucone: sam większy rozrzut, swobodne miejsca w polu):
  - kolumny zaczynają się na różnej wysokości: 0, ½ i ¼ rzędu niżej;
  - rząd 130 jednostek, rozrzut w pionie ±19, w bok ±9; przesunięcie co drugiego rzędu w bok usunięte;
  - przyciski sąsiednich kolumn są zawsze co najmniej 90 jednostek od siebie w poziomie, w jednej kolumnie co najmniej 92 jednostki (≈ 75 px) w pionie;
  - pilnuje tego test jednostkowy „no two medication buttons overlap on a 360 px phone” (150 leków) oraz sprawdzenie prostokątów w E2E.
- Przesądza: mapa jest wyższa — 12 leków to 585 jednostek (4 rzędy i pół rzędu zapasu na najniżej zaczynającą się kolumnę). Pola siatki leków się nie zmieniają. Plan fazy 1 nadal mówi „rząd ok. 90 jednostek” i „przesunięcie co drugiego rzędu”; obowiązuje kod w `src/lib/services/interaction-graph.ts`.
- Ekran węższy niż 360 px (np. 320 px) nie jest sprawdzony i może znów nachodzić.

### Stan na 18.10.2026 — układ grafu przerobiony po makietach (faza 3 w toku)

**Gdzie jesteśmy:** oba układy wdrożone 18.10.2026 (telefon C, komputer koncepcja 10, przełączane szerokością karty grafu przez container query); autorka obejrzała je na localhoście i zaakceptowała („ok lecimy dalej”). Testy jednostkowe, E2E, galeria, lint, typecheck zielone.

**Zasada pracy (autorka, 18.10.2026):** każda zmiana wyglądu najpierw jako gotowa makieta do akceptacji, potem kod. Wybór wariantu z opisu nie jest akceptacją wyglądu.

**Telefon — zaakceptowana wersja C** (makiety: https://claude.ai/artifact/9GUpF4p4RPsGQpU8Libr8t, prototyp: `context/changes/interaction-graph/prototype/` (pliki `.mjs.txt`, żeby lint ich nie sprawdzał — to brudnopis, nie kod produktu; przed uruchomieniem zdejmij `.txt`), `proto.mjs` + parametry `c` w `gen7.mjs`):

- siatka 3 kolumny, pole 108 jednostek, rząd 100; pola przydzielane jak dotąd (najniższe wolne przy dodaniu), ale rozsypane w bloku 3 × 4 (`cell = (pole × 7) mod 12`);
- kolumny zaczynają się na różnej wysokości `[0, 0,45, 0,2]` rzędu, każde pole przesunięte o własną wartość `0,5 × (((cell × 5 + 3) mod 7) / 6 − 0,5)` rzędu, przesunięcie rzędów w bok jak w A2 (nieparzyste +0,28, parzyste −0,12 kolumny);
- rozrzut z identyfikatora: ±32% kolumny w bok, ±35% rzędu w pionie; przy kolizji 24 próby z malejącym rozrzutem, potem najbliższe wolne miejsce w rosnących okręgach wokół środka pola;
- kolizja = prostokąty przycisków 90 × 88 jednostek (górny brzeg 10 px nad punktem) nachodzą na siebie; w pionie odstęp 4 jednostki, w poziomie mogą się stykać;
- miejsce liczone raz, w chwili dodania leku, wobec leków stojących wtedy na mapie (odtworzenie historii) — potem się nie zmienia; interakcje nigdy na nie nie wpływają (FR-012);
- linie: krzywa kwadratowa, wygięcie proporcjonalne do długości (0,18–0,24 długości), strona z hasza pary; jeśli krzywa podchodzi bliżej niż 17 jednostek do okręgu innego leku, próby `[0,3, 0,12, 0,42, 0,06, 0,55]` po obu stronach, inaczej najlepsza;
- linie mogą mieć różną długość, odstępy nie muszą być równe (autorka).

**Komputer — musi wyglądać inaczej niż telefon, w tej zmianie (autorka, 18.10.2026).** Dotąd odrzucone: ten sam obraz wyśrodkowany (puste miejsce), 5 kolumn w równych rzędach / zygzaku (za regularne), swobodne miejsca z dziurami, panel obok, powiększenie, 6 × 2 i 5 × 3. Makiety W1 (5 kolumn, odstęp rzędów 100, `gen8.mjs`: offsets `[0, 0,45, 0,2, 0,6, 0,3]`, rows 3) i W2 (6 kolumn, `gen9.mjs`, odstępy 100/135/165). W porównaniu W1 z W2b (odstęp 165) autorka: „5 kolumn wygląda lepiej” — jeszcze bez akceptacji do wdrożenia. Potem odrzucone też W3 (W1 + miejsce najdalej od sąsiadów), W4/W5 (plaster miodu); autorka nie chce „jak najdalej od sąsiada”. Następnie 10 różnych koncepcji (`proto6.mjs.txt`, `gen11.mjs.txt`): kolumny C, mocny rozrzut, grupki, przypadkowo z dziurami, ukośna siatka, fala, słonecznik od rogu, słonecznik od środka, plaster miodu z mocnym rozrzutem, 4 szerokie kolumny. Autorka zostawiła 1, 2, 8 i 10 (makieta wersja 13).

**Komputer — zaakceptowana koncepcja 10 „Cztery szerokie kolumny” (autorka, 18.10.2026):**

- układ współrzędnych 576 jednostek szerokości, 4 kolumny po 135 jednostek, margines 18;
- pola rozsypane w bloku 4 × 3 (`cell = (pole × 5) mod 12`), kolumny zaczynają się na wysokości `[0, 0,4, 0,15, 0,55]` rzędu, każde pole przesunięte o `0,4 × (((cell × 5 + 3) mod 7) / 6 − 0,5)` rzędu; rząd 105, bez przesunięcia rzędów w bok;
- punkt pola: x = 18 + 135 × (kolumna + 0,5), y = 56 + 105 × (rząd + przesunięcie); rozrzut ±0,42 × 135 w bok, ±40 w pionie; kolizje, krzywe i stałość jak w wersji C;
- układ komputera włącza się, gdy karta grafu ma co najmniej 480 px szerokości (0,83 px na jednostkę, jak na telefonie 360 px). Kod dopiero po akceptacji.

**Zrobione (komputer zaakceptowany):** przepisać `buildInteractionGraph` (pole + pozycja przy dodaniu, osobny układ telefon/komputer, krzywe omijające okręgi), testy jednostkowe (stałość, brak nachodzenia, FR-012), komponent (dwa układy, przełączane szerokością karty), ponownie E2E, galeria, LCP. Brzmienie FR-014 w PRD poprawione i zaakceptowane przez autorkę (18.10.2026): miejsce zależy też od leków stojących na grafie w chwili dodania, na szerokim ekranie lek stoi gdzie indziej niż na telefonie. Skrypt seed ma w nazwach przedrostek „Pomiar grafu”, przez który nazwy po ucięciu są nie do odróżnienia — zmienić nazwy.

### Pomiar LCP `/leki` (faza 3, 18.10.2026)

- Konto: `node --experimental-strip-types scripts/medications/seed-graph-heavy.mjs` — wymaga `npx supabase start`. Adres bazy z `.dev.vars`, nigdy z `.env`; skrypt odmawia pracy na adresie nielokalnym i na koncie, które ma już leki. Konto `graph-heavy@example.test` (inne przez `GRAPH_EMAIL` i `GRAPH_PASSWORD`).
- Skrypt dodaje 12 leków jako to konto (przez `add_medication_from_leaflet`, z RLS i strażnikami włączonymi). Wynik: 12 bieżących leków, 11 par z `medication_interactions()`.
- Ustawienia jak S-09: Lighthouse 12.8.2 Mobile, Chromium z Playwrighta (headless), sesja w nagłówku `Cookie`, build + `astro preview` na lokalnym Supabase (`.env` odsunięty na czas biegu). Strona końcowa każdego biegu to `/leki` (bez przekierowania na logowanie). Graf: 12 węzłów w HTML.
- Z kompresją (lokalne proxy brotli przed podglądem, skrypt w scratchpadzie sesji, poza repozytorium): 1,02 / 1,01 / 1,02 s, mediana **1,02 s** (próg ≤ 2,5 s) — spełniony. Dokument 6,7 KB. Wynik wydajności 1.
- Bez kompresji (sam `astro preview`): 1,52 / 1,52 / 1,52 s, mediana 1,52 s. Dokument 51,9 KB.
- Pomiar powtórzony po zygzaku kolumn (18.10.2026): z kompresją 1,01 / 1,01 / 1,02 s, bez 1,52 / 1,52 / 1,52 s — bez zmian.
- Pomiar powtórzony po wdrożeniu układów C i 10 (18.10.2026, konto `graf-komputer@example.test` z nowego seeda, 12 leków, 11 par): z kompresją 1,01 / 1,01 / 1,01 s, mediana **1,01 s**; bez 1,52 / 1,52 / 1,52 s — bez zmian.
- Element LCP to akapit „Wersja demonstracyjna…” nad listą, nie graf — graf leży poniżej pierwszego ekranu, a React dołącza się dopiero po przewinięciu (`client:visible`).
