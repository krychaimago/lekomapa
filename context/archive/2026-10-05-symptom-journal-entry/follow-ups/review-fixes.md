# Follow-ups z impl-review S-05

Źródło: `context/changes/symptom-journal-entry/reviews/impl-review.md`.

## F8 — Stronicowanie listy dzienniczka

- **Gdzie**: `src/pages/dzienniczek/index.astro:39-45` — zapytanie pobiera wszystkie wpisy z objawami, bez `.limit` / `.range`.
- **Kiedy**: przy S-06 (pierwszy plasterek, który dokłada treść do listy wpisów), najpóźniej zanim lista zacznie ładować się zauważalnie wolniej.
- **Jak**: stronicowanie po `occurred_at desc`; indeks `(user_id, occurred_at desc)` już istnieje. Numer strony w URL jest dopuszczalny — nie jest daną zdrowotną; nazwy objawów nigdy.
- **Dlaczego nie teraz**: plan S-05 (Performance Considerations) świadomie odkłada stronicowanie; przy jednym wpisie dziennie lista ma ~365 pozycji rocznie.
