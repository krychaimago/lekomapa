# M-2 — notatka przekazania (14.10.2026)

Stan po sesji `/10x-roadmap` z 14.10.2026, żeby następna sesja (po `/clear`) mogła ruszyć bez tej rozmowy. Źródłem prawdy o zakresie jest `context/foundation/roadmap.md`; ta notatka mówi tylko, gdzie jesteśmy i co dalej. Usuń ją, gdy zmiany poniżej trafią do `main`.

## Stan

- M-1 zamknięte 14.10.2026 (F-06 zarchiwizowane, PR #103). Treść roadmapy M-1 w historii gita: commit `68a936b`.
- M-2 „Szlif i czytelność ekranów” (`szlif-i-czytelnosc-ekranow`) zapisane w `context/foundation/roadmap.md`, status `open`.
- Gałąź `docs/m2-roadmap` (od `main`), **niecommitowane**:
  - `context/foundation/roadmap.md` — M-1 zamknięte, M-2 otwarte,
  - `CLAUDE.md` — zdanie o czasie pracy i terminach (zgoda autorki 14.10.2026),
  - ta notatka.
- Kod nie był zmieniany.

## Ustalenia z sesji

- Cel kolejności: `quality` — najpierw szlif istniejących ekranów, potem nowe funkcje.
- Gwiazda przewodnia: S-05 — czytelna „Wizyta” z listą bieżących leków (pozycje 5b + 11).
- Główne ryzyko: `time` — ok. 85–105 h do 04.11.2026; każda pozycja ma w roadmapie pole „Termin”.
- S-03: `/dashboard` usunąć, po zalogowaniu start na `/leki` (odrzucone: start na `/wizyta`, osobny ekran „Start”).
- Bez fundamentów: sposób rysowania dla osi czasu i grafu wybiera S-09 (polecany: SVG rysowane na serwerze), S-10 z niego korzysta.
- 5b potwierdzone przez autorkę: w każdym pytaniu wracają te same leki (zmienione i pod zwinięciem).
- Pozostałe decyzje (wygląd przycisku w S-01, źródło ikony w S-04, układ „Wizyty” w S-05, format eksportu) zostają planom pozycji — warianty z kosztem są w roadmapie przy każdej pozycji.

## Zmiany PRD do zrobienia przy pozycjach (nie teraz)

- S-05: FR-011 (lista bieżących leków), FR-007 — tylko jeśli nota ma się pokazywać raz.
- S-09: nowe FR dla osi czasu.
- S-10: nowe FR dla grafu.
- S-11: nowe FR i brzmienie zasady „dane nie opuszczają produktu” — otwarte pytanie roadmapy, blokuje S-11.
- Do rozważenia przy pierwszej zmianie PRD: `hard_deadline` w frontmatterze PRD to nadal 2027-01-10.

## Co dalej

1. Przejrzyj `git diff` na gałęzi `docs/m2-roadmap`, zrób commit i PR, zmerguj.
2. Zacznij od szybkich poprawek, każda osobnym PR-em: `/10x-new delete-account-button-emphasis` (S-01), potem S-02 `journal-tab-rename`, S-03 `dashboard-landing`, S-04 `app-icon`.
3. Następnie gwiazda przewodnia: `/10x-ui` dla S-05 `visit-readable-with-current-meds`.

## Zauważone poza zakresem

- `CLAUDE.md` ma nieaktualne zdania „`src/types.ts` … jeszcze nie istnieje” i „katalogi … jeszcze nie istnieją” — do poprawki osobną decyzją.
- Wyjątek od reguły `destructive*` dopisuje S-01 (w `CLAUDE.md` i w komentarzu `src/styles/global.css:31`), nie wcześniej.
- GitHub: milestone `M-2: Szlif i czytelność ekranów` z issue #104–#114 (S-01…S-11) i etykietami `stream:M2-*`, `termin:*`. Milestone M-1 zamknięty 14.10.2026.
