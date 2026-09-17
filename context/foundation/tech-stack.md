---
starter_id: 10x-astro-starter
package_manager: npm
project_name: lekomapa
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

PRD opisuje web-app dla jednej osoby, o małej skali i małym wolumenie danych, z twardym terminem 2027-01-10 i budżetem 5 tygodni MVP realizowanych po godzinach. Przy takim budżecie największym pojedynczym kosztem poza rdzeniem produktu jest konto użytkownika: FR-001 i FR-002 wymagają rejestracji, logowania loginem i hasłem oraz odzyskiwania dostępu, a wymagania niefunkcjonalne żądają izolacji danych zdrowotnych per-konto i dostępu z wielu urządzeń. 10x-astro-starter niesie to gotowe — Supabase dostarcza PostgreSQL, uwierzytelnianie i Row Level Security, więc autorka pisze reguły kolizji i dzienniczek, a nie warstwę auth. TypeScript w całym projekcie plus jawne schematy na granicach dają agentowi kontrakty, z których może wnioskować bez uruchamiania programu, co ma znaczenie dla osoby, która jeszcze nie programuje i pracuje z agentem. Tailwind i konwencje Astro pokrywają wymóg pełnej używalności na ekranie telefonu. Cloudflare Pages to domyślny cel wdrożenia startera i najkrótsza droga do pierwszego deployu; brak zadań w tle, płatności, realtime i AI w zakresie MVP oznacza, że ograniczenia edge runtime nie dotykają tego produktu. Starter przechodzi wszystkie cztery bramki jakości dla agenta.
