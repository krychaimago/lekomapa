# Zarządzanie zadaniami: GitHub Issues

> Ustalenia z migracji roadmapy M-1 do systemu zadań, 2026-09-21.
> Źródło zakresu: `context/foundation/roadmap.md`. Ten plik opisuje wyłącznie konwencję prowadzenia zadań.

## System

Zadania prowadzone są w **GitHub Issues** w repozytorium `krychaimago/lekomapa` (prywatne). Bez zewnętrznego narzędzia i bez tablicy Projects v2 — token `gh` ma scope'y `gist, read:org, repo`, co wystarcza na issues, etykiety i milestone'y, a nie obejmuje `read:project`. Gdyby tablica kiedyś była potrzebna: `gh auth refresh -s project`, logowanie interaktywne po stronie autorki.

## Podział ról

- **`context/foundation/roadmap.md`** — źródło prawdy o zakresie kamienia milowego: co wchodzi do M-1, w jakiej kolejności zależności, z jakim ryzykiem. Edytowana, gdy zmienia się zakres.
- **GitHub Issues** — prowadzenie realizacji: co robię teraz, co blokuje, gdzie notatki z pracy, kiedy pytanie zostało rozstrzygnięte.

Przy rozbieżności obowiązuje roadmapa. Zmiana zakresu idzie najpierw do roadmapy, potem do issue.

## Milestone

Jeden na kamień milowy. Obecny: **`M-1: MVP — od leku do materiału na wizytę`**, opis = pole `Intent` z roadmapy plus `Done when` i `Scope anchors`. Bez daty — roadmapa świadomie nie jest kalendarzem.

## Etykiety

| Etykieta               | Kolor     | Znaczenie                                                   |
| ---------------------- | --------- | ----------------------------------------------------------- |
| `typ:fundament`        | `#5319e7` | pozycja F-NN, bez efektu widocznego dla użytkowniczki       |
| `typ:plasterek`        | `#0e8a16` | pozycja S-NN, pionowy plasterek od końca do końca           |
| `status:ready`         | `#0052cc` | gotowe do `/10x-plan`                                       |
| `status:proposed`      | `#c5def5` | czeka na wymagania wstępne                                  |
| `status:blocked`       | `#b60205` | zablokowane otwartym pytaniem                               |
| `stream:A-leki`        | `#fbca04` | strumień A: leki i kolizje                                  |
| `stream:B-dzienniczek` | `#fbca04` | strumień B: dzienniczek objawów                             |
| `stream:C-wizyta`      | `#fbca04` | strumień C: materiał na wizytę                              |
| `stream:D-konto`       | `#fbca04` | strumień D: cykl życia konta                                |
| `north-star`           | `#fef2c0` | gwiazda przewodnia kamienia milowego, dokładnie jedno issue |
| `question`             | `#d876e3` | otwarte pytanie roadmapy (etykieta domyślna GitHuba)        |

Etykieta `status:*` na issue odwzorowuje pole `Status` pozycji w roadmapie. Zmiana statusu w roadmapie pociąga zmianę etykiety i odwrotnie.

## Tytuły

- Pozycje roadmapy: `F-01 · Schemat leków i okresów dawkowania z RLS` — prefiks ID roadmapy, separator `·`, tytuł z kolumny „Suggested issue title" tabeli `## Backlog Handoff`.
- Pytania: `Q-1 · Ile par substancji czynnych i z jakiego źródła trafia do zbioru reguł?`

Prefiks jest obowiązkowy — po nim wiadomo, której pozycji roadmapy dotyczy issue, bez otwierania treści.

## Szkielet treści issue pozycji

```markdown
## Rezultat

## Change ID ← plus gotowa komenda /10x-plan <change-id>

## Wymagania wstępne ← linki #NN, albo „Brak."

## Odblokowuje ← linki #NN

## Równolegle z

## Odniesienia do PRD

## Otwarte pytania ← link #NN + „blokuje: tak/nie"

## Ryzyko ← pole Risk z roadmapy, dosłownie

---

Źródło: context/foundation/roadmap.md, pozycja F-01.
```

Sekcje puste w roadmapie („—") są pomijane, nie zostawiane jako nagłówek bez treści.

## Szkielet treści issue pytania

```markdown
## Pytanie

## Kto rozstrzyga

## Co blokuje ← linki #NN pozycji zablokowanych wprost i przez nie

## Jak zamknąć ← odpowiedź w komentarzu, zamknięcie issue, przeniesienie ustalenia do roadmapy
```

## Stan po migracji (2026-09-21)

| Roadmap ID | Issue            | Roadmap ID | Issue |
| ---------- | ---------------- | ---------- | ----- |
| F-01       | #9               | S-05       | #16   |
| F-02       | #10              | S-06       | #17   |
| F-03       | #11              | S-07       | #18   |
| S-01       | #12              | S-08       | #19   |
| S-02       | #13 (north star) | S-09       | #20   |
| S-03       | #14              | Q-1…Q-7    | #2…#8 |
| S-04       | #15              |            |       |

19 issue w milestone M-1. Migracja odwzorowała stan roadmapy, niczego nie zamknęła i nie przestawiła statusów. Pozycje z sekcji `## Parked` nie mają issue — są świadomie poza MVP.

Od migracji zamknięte: **#2 (Q-1)**, 2026-09-21 — rozstrzygnięcie przestawiło #10 (F-02) na `status:ready`.

## Jak z tego korzystać

- **Co robić teraz:** `gh issue list --label status:ready`
- **Co stoi i dlaczego:** `gh issue list --label status:blocked`, treść issue linkuje do pytania blokującego
- **Gwiazda przewodnia:** `gh issue list --label north-star`
- **Jedna ścieżka:** `gh issue list --label stream:A-leki`
- **Zamknięcie pytania:** patrz `## Zamykanie pytania` poniżej

## Zamykanie pytania

Kolejność jest istotna: ustalenie musi trafić do dokumentów, zanim issue zniknie z listy otwartych, inaczej rozstrzygnięcie zostaje wyłącznie w komentarzu i nikt go tam nie szuka.

1. Odpowiedź w komentarzu do issue pytania — pełne rozstrzygnięcie wraz z uzasadnieniem i źródłami, nie samo „ustalono X". Komentarz jest zapisem, dlaczego wybrano ten wariant; reszta dokumentów notuje wyłącznie wynik.
2. Przeniesienie ustalenia do `context/foundation/prd.md`, jeśli rozstrzygnięcie dotyka wymagań, oraz do `context/foundation/roadmap.md` zawsze. W roadmapie pytanie wędruje z `## Open Roadmap Questions` do sekcji rozstrzygniętych pod nią, a pozostałe pytania są przenumerowane; numery issue zostają bez zmian.
3. Przeniesienie wymogów projektowych do issue pozycji, którą pytanie blokowało — inaczej giną między rozmową a `/10x-plan`.
4. Zdjęcie `status:blocked` i nadanie `status:ready` na odblokowanych pozycjach, w issue i w roadmapie równocześnie.
5. `gh issue close <nr> --reason completed` z komentarzem wskazującym, gdzie ustalenie zostało zapisane.

Gdy rozstrzygnięcie podważa zapis w PRD — na przykład uchyla Non-Goal — popraw PRD jawnie i wypisz w nim granice, które pozostają nienaruszone. Ciche ominięcie zapisu sprawia, że przy następnej pracy nikt nie wie, czy granica nadal obowiązuje.

## Zasady utrzymania

- Nowa pozycja w roadmapie dostaje issue z tym samym szkieletem i prefiksem ID; numer issue wraca do roadmapy (pole `Issue:` przy pozycji i kolumna w `## Backlog Handoff`).
- Zamknięcie pozycji: issue zamykane dopiero po `/10x-archive`, który przestawia status w roadmapie na `done`.
- Nowy kamień milowy = nowy milestone; etykiety zostają te same.
- Brak `.github/ISSUE_TEMPLATE/` — szablony warto założyć, dopiero gdy issue zacznie zakładać ktoś jeszcze.
