# Frame Brief: Miejsce UI w roadmapie i granica RODO w MVP

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

W projekcie brakuje dwóch rzeczy, które nie zostały doprecyzowane na początku:
kwestii RODO, które autorka chce wynieść poza MVP, oraz choćby jednego
plasterka dotyczącego UI. Istnieje wstępna makieta designu ekranu logowania
(`context/changes/auth-login-design/design-draft.md`), która nie przeszła
planowania ani implementacji. Autorka nie wie, w którym momencie zacząć pracę
nad UI ani czy pracować per ekran między zadaniami, czy na koniec. Chce tę
część rozplanować, żeby nie umknęła.

## Initial Framing (preserved)

- **User's stated cause or approach**: rzeczy nie zostały doprecyzowane na
  starcie; UI to osobna praca, której brakuje w roadmapie.
- **User's proposed direction**: wynieść RODO poza MVP; rozplanować UI —
  per ekran między zadaniami albo na koniec.
- **Pre-dispatch narrowing**: RODO = „wszystko, co jest związane z
  przetwarzaniem danych w tym serwisie. Nie jest to obecnie sprecyzowane w
  żaden sposób". Pytania o rodzaj brakującego UI i priorytet — bez odpowiedzi
  („opisałam już problem").

## Dimension Map

1. **Plasterki pionowe już niosą UI** — brak „slice'a UI" wynika z metody, nie z luki.
2. **Wspólna warstwa wizualna bez właściciela** — tokeny, layout wnętrza, nawigacja, polskie napisy. ← początkowe ujęcie UI
3. **Ekrany wejściowe bez właściciela** — logowanie, rejestracja, reset hasła wg makiety.
4. **RODO jako jedna całość do wyniesienia** — czy „przetwarzanie danych" da się wyjąć z MVP w całości. ← początkowe ujęcie RODO

## Hypothesis Investigation

| Hypothesis                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verdict                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Plasterki niosą UI                       | `CLAUDE.md:136` („pionowe plasterki … przecinające UI, dane, logikę"), `CLAUDE.md:138` (zakaz sierocego „cały UI"); outcome'y S-02…S-08 opisują ekrany (`roadmap.md:144, 159, 172, 180, 185, 194, 200, 228`); F-01/F-02 celowo bez ekranów („to S-02" — `archive/…medication-schema-rls/plan.md:40`, `archive/…interaction-rules-seed/plan.md:92`)                                                                                                                          | STRONG                                                      |
| 2. Wspólna warstwa wizualna bez właściciela | Żadna pozycja roadmapy ani `## Parked` nie obejmuje tokenów, layoutu, nawigacji ani polonizacji; `src/styles/global.css:6-73` to domyślne tokeny shadcn; kolory na sztywno (`SubmitButton.tsx:18`, `signin.astro:10-17`, `dashboard.astro:9-16`); `Layout.astro:14` `lang="en"`, brak nawigacji; teksty auth po angielsku. Makieta definiuje pas boczny wnętrza (`design-draft.md:72-76`), którego nikt nie ma w zakresie. Pierwszy ekran wnętrza powstanie w S-02 lub S-05 | STRONG                                                      |
| 3. Ekrany wejściowe bez właściciela         | S-01 obejmuje rejestrację, logowanie i odzyskiwanie dostępu (`roadmap.md:130`) — właściciel jest. Ale baseline twierdzi, że odzyskiwanie istnieje (`roadmap.md:76`, powtórzone w ryzyku S-01 `roadmap.md:139`), a w `src/` nie ma żadnej trasy resetu. S-01 jest niedoszacowany; FR-002 must-have (`prd.md:110`)                                                                                                                                                            | WEAK jako „brak właściciela"; STRONG jako „S-01 zbyt wąski" |
| 4. RODO do wyniesienia w całości            | Mechanizmy są must-have i częściowo zrobione: izolacja per-konto (`prd.md:152`, F-01 done), usunięcie konta (`prd.md:153`, S-09), akceptacja warunków z datą i wersją (FR-001, S-01), wszystkie w kotwicach zakresu (`roadmap.md:29`). Warstwa prawna — polityka prywatności, administrator, podstawa i zgoda na dane o zdrowiu (art. 9), podmioty przetwarzające, region danych, retencja — nie występuje nigdzie, ani jako wymaganie, ani jako Non-Goal                   | NONE dla „całości"; STRONG dla „warstwa prawna niezapisana" |

## Narrowing Signals

- Brak osobnego slice'a UI jest zgodny z regułą roadmapy — nie jest przeoczeniem (H1).
- Nie brakuje ekranów, brakuje **wspólnego podłoża**, na którym pierwszy ekran wnętrza ma stanąć (H2).
- „RODO" rozpada się na dwie warstwy o przeciwnym statusie: mechanizmy (w MVP, część zrobiona) i dokumenty prawne (nieobecne, nigdzie niezapisane) (H4).
- Produkcja jest publiczna z otwartą rejestracją: `deploy-plan.md:7`, brak bramki w `src/pages/api/auth/signup.ts`, auto-deploy z `main` (`ci.yml:58-74`). PRD kieruje MVP do jednej osoby (`prd.md:28`) i pokazu bliskim (`prd.md:109`). Rozbieżność „jedna użytkowniczka" vs „każdy może założyć konto i wpisać dane o zdrowiu" nie jest nigdzie rozstrzygnięta.

Pytania zawężające pominięte: dowody z kroku 3 były rozstrzygające, a autorka
zasygnalizowała, że opis problemu jest kompletny.

### Rozstrzygnięcie autorki (2026-09-26)

- **Kontekst**: aplikacja powstaje w ramach certyfikacji — wersja MVP,
  prototyp — i **będzie dostępna z publicznego adresu**. Otwarta rejestracja
  zostaje.
- **Pytanie autorki**: jak najlepiej poinformować użytkowników, że nie zaleca
  się podawania prawdziwych danych — „bo może nie musimy odkładać tematu RODO".
- **Rozważone warianty**:
  - najszybszy — sam stały pasek „wersja demonstracyjna" na każdym ekranie;
  - **optymalny (wybrany)** — treść warunków korzystania w wersji 1 jako
    „prototyp" (prototyp certyfikacyjny, nie wpisuj prawdziwych danych, dane
    mogą zostać usunięte bez uprzedzenia, kontakt) + stały pasek + krótka
    strona prywatności (kto prowadzi serwis, jakie dane, gdzie leżą — region
    Supabase, jak usunąć konto);
  - najlepszy — optymalny + ograniczenia techniczne (automatyczne czyszczenie
    kont, rejestracja z zaproszeniem, osobna zgoda na dane o zdrowiu).
    Odrzucony jako koszt ponad potrzebę prototypu; czyszczenie kont
    kolidowałoby z nienaruszalnością historii.
- **Czego wariant nie załatwia**: e-mail konta jest daną osobową, więc
  przetwarzanie zachodzi niezależnie od komunikatu; komunikat zmniejsza
  ryzyko, że ktoś wpisze prawdziwe dane o zdrowiu, nie wyklucza go.
- **Otwarte**: PRD zakłada, że produktu używa autorka (`prd.md:28`). Wpisanie
  jej prawdziwych danych na publicznej instancji przeczy komunikatowi dla
  innych — trzeba zdecydować, czy prawdziwe dane autorki mają osobne
  środowisko, czy w fazie prototypu też są przykładowe.

## Cross-System Convention

- Konwencja roadmapy (lekcja M2L1): UI w plasterku; praca pozioma tylko jako
  ograniczony enabler, który nazywa odblokowywany kamień milowy. Wspólna
  warstwa wizualna pasuje do tego wzorca tak samo jak F-01/F-02 — nazwany
  enabler przed pierwszym ekranem, nie „cały UI na koniec".
- `10x-ui` służy do poprawiania widoku, który już istnieje (`.claude/skills/10x-ui/SKILL.md:19-22, 31`). Pasuje do obecnych ekranów auth i dashboardu; nie do ekranów S-02+, dopóki nie powstaną.
- Wyniesienie czegoś poza MVP ma w projekcie ustaloną formę: jawny wpis w
  `## Parked` / `## Non-Goals` z powodem (`roadmap.md:282-297`), jak eksport
  danych. Lekcja „Otwarte pytanie może kryć niezadaną decyzję" wymaga, żeby
  granice pozostające nienaruszone były wypisane.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: roadmapa nie przypisuje nikomu
> wspólnej warstwy wizualnej, na której mają stanąć ekrany plasterków; do tego
> S-01 jest niedoszacowany o reset hasła. Osobno: „RODO" nie jest jedną rzeczą
> do wyniesienia — wynieść da się tylko warstwę dokumentów prawnych, a to
> wymaga jawnej decyzji o publicznej rejestracji na produkcji.

UI: wybór „per ekran czy na koniec" jest pozorny — metoda już wybrała „per
ekran, wewnątrz plasterka". Otwarte zostaje tylko to, kto dostarcza wspólne
podłoże (tokeny Mech, layout wnętrza z pasem bocznym, polski `lang` i napisy)
przed pierwszym ekranem wnętrza, oraz poprawka zakresu S-01.

RODO: mechanizmy (izolacja, usunięcie konta, akceptacja warunków) zostają w
MVP — wyjęcie ich podważyłoby kotwice zakresu i zrobioną pracę. Warstwa prawna
jest dziś nieobecna, a nie odłożona; odłożenie jej jest bezpieczne tylko przy
zamkniętym kręgu użytkowników. Przy otwartej rejestracji „poza MVP" znaczy
przyjmowanie danych o zdrowiu od obcych osób bez podstawy.

Po rozstrzygnięciu autorki: rejestracja zostaje publiczna, więc RODO **nie
wychodzi z MVP w całości**. W MVP wchodzi minimalna warstwa „prototyp":
warunki wersja 1, strona prywatności, stały pasek. Poza MVP (`## Parked`)
trafia wyłącznie pełna warstwa prawna potrzebna przy wyjściu z fazy
prototypu — podstawa przetwarzania i zgoda na dane o zdrowiu (art. 9), lista
podmiotów przetwarzających, retencja, pełna polityka prywatności.

## Confidence

**HIGH** dla części UI — mocne dowody, zgodność z konwencją roadmapy.
**HIGH** dla części RODO — podział na warstwy pewny, decyzja o publicznej
rejestracji podjęta przez autorkę. Otwarte zostaje jedno pytanie: gdzie leżą
prawdziwe dane autorki (sekcja `### Rozstrzygnięcie autorki`).

## What Changes for /10x-plan

To nie jest jeden plan kodu, tylko aktualizacja roadmapy (`/10x-roadmap`):

- **Nowy enabler wspólnej warstwy wizualnej** przed pierwszym ekranem wnętrza
  (S-02 lub S-05): tokeny palety Mech w `src/styles/global.css`, layout
  wnętrza z pasem bocznym / zakładkami na telefonie, `lang="pl"`, stały pasek
  „wersja demonstracyjna". Nazywa odblokowywany kamień milowy — pierwszy ekran
  wnętrza. Ekrany samych plasterków zostają w plasterkach.
- **S-01 poszerzony**: poprawiony baseline (reset hasła nie istnieje),
  ekrany wejściowe wg `design-draft.md`, treść warunków wersja 1 „prototyp"
  (zamyka część Open Question 8 / #8), krótka strona prywatności.
- **`## Parked` + PRD `## Non-Goals`**: pełna warstwa prawna RODO z warunkiem
  powrotu — wyjście z fazy prototypu. Wypisane granice, które zostają w MVP:
  izolacja per-konto, usunięcie konta (S-09), akceptacja warunków z datą i
  wersją.
- **PRD**: dopisać publiczność MVP — prototyp certyfikacyjny na publicznym
  adresie z otwartą rejestracją, obok obecnego „jedna konkretna osoba".

## References

- `context/changes/auth-login-design/design-draft.md` (paleta :26-41, wnętrze :72-76, treści :137+)
- `context/foundation/roadmap.md:29, 76, 128-140, 282-297`
- `context/foundation/prd.md:28, 109-110, 152-153, 183, 213`
- `CLAUDE.md:136-138`
- `src/styles/global.css:6-73`, `src/layouts/Layout.astro:10-14`, `src/pages/api/auth/signup.ts`
- `context/deployment/deploy-plan.md:7`, `.github/workflows/ci.yml:58-74`
