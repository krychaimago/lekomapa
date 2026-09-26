# Follow-ups z impl-review: interaction-rules-seed

Źródło: `context/changes/interaction-rules-seed/reviews/impl-review.md`.

## F2 — blokada przepięcia leku pod inny produkt rejestru (wejście do S-02)

- **Dla**: S-02 `add-medication-with-interaction-flag` — pierwszy plasterek zapisujący `medications.registry_medication_id` i `composition_source`.
- **Reguła**: zmiana substancji czynnej to zakończenie leku i dodanie nowego (`roadmap.md`, S-03). Przepięcie leku pod inny produkt po oknie korekty jest zmianą historii.
- **Stan dziś**: `medication_substances` ma wyzwalacze rdzenia; `medications` ma tylko `medications_guard_delete`, bez wyzwalacza na UPDATE.
- **Do zrobienia w S-02**:
  - wyzwalacz na UPDATE `medications` blokujący zmianę `registry_medication_id` i `composition_source` po zamknięciu okna korekty (wzorzec guardów F-01),
  - kontrola spójności `composition_source = 'registry'` ⇔ `registry_medication_id is not null`,
  - sprawdzenia w `supabase/tests/rls_checks.sql` z nazwanym błędem (`lessons.md`: „Bramka musi odróżnić blokadę od niewykonania”).
- **Do rozstrzygnięcia w planie S-02**: czy `product_name` należy do rdzenia wpisu (PRD wymienia substancję, dawkę, datę rozpoczęcia).
- **Uwaga**: do S-05 funkcja `medication_correction_window_open()` jest zaślepką zwracającą `true`, więc blokada zadziała realnie dopiero po jej podmianie.
- Dopisane do roadmapy przy S-02 jako „Dług przejęty z F-02”.

## F5 — szkic agenta commitowany osobno z pustym `verified_on`

- **Stan**: autorka potwierdziła 2026-09-26, że daty `verified_on` w `interaction_pairs.csv` i `substance-corrections.csv` wpisała sama. Historia gita tego nie pokazuje, bo szkic i weryfikacja weszły jednym commitem (8a52fd4).
- **Na przyszłość** (każda kolejna partia par lub poprawek): szkic agenta commitować osobno, z pustym `verified_on`; daty wpisuje autorka w następnym commicie. Wtedy diff pokazuje, kto co wpisał.

## F9 — tłumaczenie nagłówka F-01 w `supabase/tests/rls_checks.sql`

- Linie 1–4 nagłówka są po angielsku, dalsza część (od linii 6, tekst F-01) i sprawdzenia 1–8 po polsku.
- Tłumaczenie reszty zrobić w osobnej zmianie razem z pozostałym kodem F-01 (`src/types.ts`, migracja schematu leków) — zgodnie z `CLAUDE.md`: „osobna decyzja, nie przy okazji”.

## F7 — klucz unikalny na `medication_substances` (decyzja dla S-02)

- **Problem**: klucz `(medication_id, substance_name, atc_code)` przepuszcza ten sam kod pod różną pisownią nazwy („Ibuprofenum” / „ibuprofenum”) — S-02 może policzyć jedną substancję podwójnie.
- **Warianty do wyboru w planie S-02**:
  - normalizacja nazwy substancji przy zapisie (klucz bez zmian),
  - częściowy indeks unikalny `(medication_id, atc_code) where atc_code is not null`.
- **Zmierzone 2026-09-26**: w rejestrze 0 produktów z dwiema różnymi substancjami o tym samym kodzie, więc indeks na sam kod nie zablokowałby żadnego produktu z rejestru. Ścieżki z ulotki nie zmierzono.
- **Zrobione w F-02**: sprawdzenie 5g w `rls_checks.sql` — zmiana `atc_code` na pusty po oknie korekty pada (`P0001`); mutacja z porównaniem `<>` zamiast `is distinct from` wywraca je.
- Dopisane do roadmapy przy S-02 jako „Decyzja przejęta z F-02”.
