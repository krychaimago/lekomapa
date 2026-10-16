# Frame Brief: Czytelna „Wizyta” przy wielu objawach i lekach

> Krok ramowania przed /10x-plan. Dokument oddziela to, o co faktycznie chodzi,
> od tego, co zakładano na starcie.

## Reported Observation

Przy wielu lekach i objawach „Wizyta” (`src/pages/wizyta.astro`) wymaga dużo przewijania i jest nieczytelna. Zrzut autorki z 16.10.2026: 6 kart kolizji, 10 pytań do lekarza. Autorka zakłada, że wpisów będzie znacząco więcej, bo dziennik dopuszcza codzienne wpisy.

## Initial Framing (preserved)

- **Przyczyna wg roadmapy (S-05, #108)**: powtórzenia — nota przy każdej karcie kolizji i te same leki w każdym pytaniu — oraz brak listy bieżących leków z dawkami.
- **Proponowany kierunek (roadmapa)**: nota raz nad listą kolizji, pytania zwinięte poza pierwszym, lista bieżących leków raz, w pytaniach tylko leki ze zmianą w oknie 90 dni, ewentualnie spis z odnośnikami. Paginacja odradzana.
- **Pre-dispatch narrowing**: autorka wskazała notę przy każdej kolizji jako najbardziej przeszkadzające powtórzenie. Po zrzucie doprecyzowała: w przyszłości najbardziej będzie przeszkadzać duża liczba objawów; interakcje przeszkadzają dziś, ale nikt nie bierze kilkudziesięciu leków. Dodatkowo: przy wielu danych trudno znaleźć objaw z konkretnego dnia.

## Dimension Map

1. **Nota przy każdej karcie kolizji** — ta sama linijka ×N. ← wstępne ramowanie
2. **Brzmienie FR-007** — per-karta może być przypadkowym odczytaniem „przy każdej informacji”.
3. **Pytania do lekarza** — wszystkie rozwinięte, ta sama lista zdarzeń leków pod każdym objawem.
4. **Liczba i długość opisów par** — opisy ~250 znaków, możliwe duplikaty kart dla tej samej pary leków.
5. **Szukanie objawu z konkretnego dnia** — potrzeba nawigacji po dacie.

## Hypothesis Investigation

| Hipoteza                        | Dowód                                                                                                                                                                                                                                                                                                                                                                     | Werdykt                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1. Nota dominuje długość        | Nota 79 znaków, ~20% karty kolizji, ~10% ekranu (`wizyta.astro:61-67`). Najbardziej widoczne powtórzenie, nie największe.                                                                                                                                                                                                                                                 | WEAK                                     |
| 2. Nota per-karta to przypadek  | Świadoma decyzja: `shape-notes.md:108,149` (argument „powtarzana nota rozmywa treść” odrzucony), `prd.md:65,144-145,200`, plan S-08 `context/archive/2026-10-08-doctor-visit-summary/plan.md:23,206`. Autorka potwierdziła 16.10.2026.                                                                                                                                    | NONE                                     |
| 3. Pytania dominują i rosną     | Wszystkie karty `open` (`wizyta.astro:102-104`). Zdarzenia liczone osobno na objaw (`doctor-question.ts:96-103`), więc nakładające się okna 90 dni dają ten sam blok 6–7 linijek pod każdym objawem — na zrzucie Kaszel, Ból brzucha, Brak apetytu, Mdłości, Biegunka. Bez zdarzeń w oknie pełna lista leków rozwinięta bez zwinięcia (`DoctorQuestionCard.astro:39-48`). | STRONG                                   |
| 3a. Codzienne wpisy mnożą karty | Jedno aktualne pytanie na objaw (FR-011, `visit-summary.ts` — `composed` per objaw). Wpisy tego samego objawu zmieniają tylko linijkę „pierwszy… ostatni…”. Sufit: 34 objawy w katalogu (`20260926120100_symptom_catalog_seed.sql`).                                                                                                                                      | NONE (rośnie liczba objawów, nie wpisów) |
| 4. Opisy par                    | Opisy 153–336 znaków; 10 z 24 kończy się tym samym zwrotem. Klucz `medA                                                                                                                                                                                                                                                                                                   | medB                                     | pair_id` (`visit-summary.ts:60`) daje kilka kart z tym samym nagłówkiem przy leku złożonym. Skala ograniczona liczbą leków. | WEAK (dziś odczuwalne, nie rośnie z dziennikiem) |
| 5. Szukanie po dniu             | „Wizyta” ułożona per objaw, nie per dzień. Nawigacja po dacie to zadanie „Dziennika”. Autorka potwierdziła 16.10.2026.                                                                                                                                                                                                                                                    | Poza zakresem S-05                       |

## Narrowing Signals

- Autorka: w przyszłości najbardziej przeszkadzać będzie liczba objawów; leków nie będzie kilkadziesiąt.
- Pomiar: codzienne wpisy nie dodają kart — rośnie liczba różnych objawów (≤ 34), a z nią powtarzany blok zdarzeń leków.
- Autorka potwierdziła: nota przy każdej kolizji była zamierzona; szukanie objawu z dnia należy do „Dziennika”.

## Cross-System Convention

- `/leki` pokazuje notę raz pod listą (`leki/index.astro:188`), ale tam lista zawiera tylko znacznik, nie treść kolizji. `/leki/[id]` i `/wizyta` — nota przy każdej karcie z treścią. Konwencja projektu: nota tam, gdzie pada twierdzenie o zdrowiu.
- Granica z roadmapy (`roadmap.md:173`): nota zawsze w tym samym widoku co informacja o kolizji, nigdy pod zwinięciem.
- Roadmapa odradza paginację: przy pokazywaniu ekranu lekarzowi trzeba by przełączać strony.

## Reframed (or Confirmed) Problem Statement

> **Właściwy problem do zaplanowania**: przy rosnącej liczbie objawów „Wizyta” powtarza pod każdym pytaniem ten sam blok zdarzeń leków i pokazuje wszystkie pytania rozwinięte, więc ekran rośnie o ~10 linijek na objaw, z których większość już jest wyżej.

Nota przy każdej kolizji nie jest głównym źródłem długości i była zamierzona — S-05 nie musi jej ruszać. Lista bieżących leków z dawkami (MS-11) pozostaje w zakresie: daje jedno miejsce, na które pytania mogą się powoływać zamiast powtarzać leki. Szukanie objawu z konkretnego dnia wychodzi z S-05 do osobnej pozycji „Dziennika”.

## Confidence

**HIGH** — pomiar w kodzie, zrzut ekranu i decyzje autorki wskazują to samo; nota i szukanie po dniu wykluczone wprost przez autorkę.

## What Changes for /10x-plan

- Plan skupia się na pytaniach (powtórzony blok zdarzeń, rozwinięcie wszystkich kart) i liście bieżących leków. Nota per-karta zostaje; zmiana FR-007 nie jest potrzebna, chyba że plan wybierze zwijanie kart kolizji.
- Kandydaci od autorki do rozważenia w planie z kosztem:
  - **paginacja objawów** — konflikt z odradzeniem w roadmapie (lekarz przełącza strony); plan musi to rozstrzygnąć jawnie,
  - **zwijanie kart kolizji** — dopuszczalne tylko, gdy nota zwija się razem z treścią kolizji, nigdy osobno.
- Kandydaci z ramowania: lista bieżących leków raz na górze + pytania bez powtórzonego bloku; pytania zwinięte poza pierwszym; spis z odnośnikami.
- Wymagana jawna zmiana PRD: FR-011 (lista bieżących leków). FR-007 tylko przy zmianie sposobu pokazywania noty.
- Wydzielić do roadmapy: szukanie objawu z konkretnego dnia w „Dzienniku”.

## References

- `src/pages/wizyta.astro:61-67,101-104`
- `src/components/journal/DoctorQuestionCard.astro:20-48`
- `src/lib/services/doctor-question.ts:96-103`
- `src/lib/services/visit-summary.ts:52-68`
- `supabase/migrations/20260926120100_symptom_catalog_seed.sql`
- `context/foundation/prd.md:65,144-145,161,200`, `shape-notes.md:108,149`
- `context/archive/2026-10-08-doctor-visit-summary/plan.md:23,206`
- `context/foundation/roadmap.md` S-05 (`:171-173`)
