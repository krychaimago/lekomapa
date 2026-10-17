---
change_id: mobile-header-sticky
title: Mobile header sticky
status: archived
created: 2026-10-16
updated: 2026-10-17
archived_at: 2026-10-17T06:51:28Z
---

## Notes

S-12, issue #120: na telefonie nagłówek wnętrza (znak, przełącznik trybu, „Wyloguj się”) ma zostać przyklejony pod paskiem wersji demonstracyjnej.

Odstępstwo od planu (17.10.2026, faza 2, decyzja autorki): bez `scroll-padding-bottom`. Dolny zapas przewijał zaznaczany objaw tuż nad dolne menu i wypychał przyciski nasilenia poza ekran (`severity-on-phone.spec.ts`). Zostaje tylko `scroll-padding-top`. Pole z fokusem może dalej chować się pod dolnym menu — luka sprzed zmiany, do osobnej zmiany.
