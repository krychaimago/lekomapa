# 10xDevs AI Toolkit — Moduł 1, Lekcja 5

> Materiał lekcyjny dostawcy narzędzia, nie kontrakt projektu — stąd `docs/`, a nie `context/foundation/`.
> Źródło: blok wygenerowany przez `@przeprogramowani/10x-cli` (`get m1l5`), przetłumaczony na polski i wyniesiony z `CLAUDE.md`.
> Kolejny `npx @przeprogramowani/10x-cli@latest get m1l5` wstawi anglojęzyczny oryginał z powrotem do `CLAUDE.md` — wtedy powtórz wyniesienie tutaj.
>
> Treść trwała z tej lekcji — wybór CLI kontra MCP oraz granica dostępu agenta do produkcji — została przeniesiona do `context/foundation/infrastructure.md` w brzmieniu dotyczącym tego projektu. Ten plik zachowano jako zapis lekcji, nie jako źródło prawdy.

Wybór platformy wdrożeniowej i wyjście na produkcję za pomocą **łańcucha infra**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

Pełny łańcuch Modułu 1 pochodzi z lekcji 1–4 (dołączony ponownie, żeby dało się poprawić wcześniejszy kontrakt w trakcie). `/10x-infra-research` to główny temat lekcji; sam krok wdrożenia korzysta z wbudowanego **Plan Mode** zamiast osobnego skilla — tym, co idzie dalej, jest artefakt (`context/deployment/deploy-plan.md`).

## Router zadań — od czego zacząć

| Skill                                                                                                                                                                                          | Kiedy użyć                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastruktura (temat lekcji)**                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/10x-infra-research [ścieżka-do-tech-stack-lub-prd]`                                                                                                                                          | Masz `context/foundation/tech-stack.md` (a najlepiej też `prd.md`) i potrzebujesz wybrać platformę wdrożeniową dla MVP. Skill wczytuje stack jako twarde ograniczenie, przeprowadza wywiad z 5 pytaniami (trwałe połączenia, wrażliwość na koszt, dotychczasowa znajomość, zasięg globalny, preferencja kolokacji), uruchamia równoległe subagenty badające sześć platform-kandydatek, ocenia je Pass/Partial/Fail wg pięciu kryteriów agent-friendly z `references/agent-friendly-criteria.md`, wybiera top trzy i przepuszcza lidera przez trzysoczewkowy cross-check antybiasowy (adwokat diabła, pre-mortem, nieznane niewiadome), zanim zapisze `context/foundation/infrastructure.md`. Użyj PO `/10x-tech-stack-selector`, PRZED `/10x-implement`. |
| **Deploy (wbudowane w narzędzie, nie skill)**                                                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Plan Mode deploy                                                                                                                                                                               | Masz `infrastructure.md` + `tech-stack.md` i chcesz przejrzeć plan tylko-do-odczytu, zanim cokolwiek zmieni się na platformie. Włącz plan mode (Claude Code: `Shift+Tab` przełącza default → auto-accept → plan; IDE: dedykowany przycisk) z promptem „Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Przeczytaj plan, wymuś poprawki, zatwierdź, dopiero wtedy pozwól agentowi wykonać. Zatwierdzony plan zostaje w `context/deployment/deploy-plan.md`, żeby planowanie kamieni milowych z następnej lekcji wiedziało, co już jest wdrożone i które sekrety są podpięte.                                                                                                                      |
| **Powtórka wcześniejszych kroków, jeśli trzeba**                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Dołączone, żeby dało się załatać wcześniejszy kontrakt w trakcie. Jeśli cross-check antybiasowy wymusi zmianę platformy, która pociąga decyzję stackową (np. „ta baza nie pasuje do żadnej akceptowalnej platformy"), odpal ponownie `/10x-tech-stack-selector`, żeby `tech-stack.md` i `infrastructure.md` się zgadzały.                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Jak łańcuch przekazuje dane

- `/10x-infra-research` czyta `context/foundation/tech-stack.md` (język, framework, runtime, baza) jako **twarde ograniczenia** — platformy, które nie uruchomią stacku, odpadają przed scoringiem. Czyta też `context/foundation/prd.md` (skala, latencja, oczekiwania co do dostępności) jako **miękkie wagi** przy ocenie. Oba wejścia są opcjonalne, ale mocno zalecane; bez nich skill kontynuuje z ostrzeżeniem.
- Skill zapisuje `context/foundation/infrastructure.md` jako trzeci kontrakt foundation: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus treść: rekomendacja, pełne porównanie platform z macierzą scoringu, wnioski antybiasowe, historia operacyjna (preview / sekrety / rollback / zatwierdzanie / logi) i rejestr ryzyk, gdzie każda pozycja wskazuje soczewkę, która ją wykryła. Przy kolizji skill pyta: nadpisać, zapisać jako `infrastructure-v2.md`, czy przerwać.
- Plan Mode czyta `infrastructure.md` i `tech-stack.md` razem. Agent emituje plan krok po kroku: kroki automatyczne, które bierze na siebie, bramki ręczne (założenie konta, konfiguracja sekretów), dokładne komendy deployu (na Cloudflare komendy Pages i Workers NIE są wymienne — plan musi to rozstrzygnąć) oraz kroki weryfikacji. Plan odrzucasz i poprawiasz, aż będzie dobry; dopiero wtedy Plan Mode się kończy i zaczyna się wykonanie. Zatwierdzony plan ląduje w `context/deployment/deploy-plan.md` i jest konsumowany dalej przez skille planujące kamienie milowe jako źródło prawdy o tym, co już jest wdrożone.

## Co skille tej lekcji obejmują (a czego NIE)

- **`/10x-infra-research` obejmuje**: listę platform ocenioną wg pięciu kryteriów agent-friendly (jakość CLI, stopień zarządzania/serverless, dokumentacja czytelna dla agenta, stabilne i skryptowalne API deployu, MCP lub integracja agentowa pierwszej klasy), trzy wyniki antybiasowe dla lidera (numerowane słabości, narracja awarii na 150–200 słów, 3–5 nieznanych niewiadomych), historię operacyjną z jedną konkretną odpowiedzią na oś (nie kategorią) oraz rejestr ryzyk, gdzie każdy wiersz nazywa swoje źródło (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status każdej funkcji spoza GA jest zapisany w miejscu (`beta` / `preview` / `region-limited` / `deprecated`) razem z datą sprawdzenia.
- **`/10x-infra-research` NIE** buduje obrazów Dockera ani nie pisze Dockerfile'i, nie konfiguruje pipeline'ów CI/CD i nie planuje poza zakresem MVP (wielo­regionowe HA jest jawnie poza zakresem). NIE decyduje za ciebie — po cross-checku akceptujesz lidera, przesiadasz się na runner-up albo przerywasz, a ta decyzja trafia do wyniku.
- **Plan Mode** daje jawną bramkę ludzką między „agent ma plan" a „agent zmienia produkcję". Artefakt (`deploy-plan.md`) to ślad audytowy „co miało się wydarzyć", gdy wykonanie na żywo pójdzie nie tak. Plan Mode NIE zastępuje `/10x-infra-research` (decyzja o platformie musi już zapaść — Plan Mode planuje wdrożenie, nie wybiera gdzie).

## Pięć kryteriów agent-friendly (i dlaczego są nośne)

Kryteria tworzące macierz scoringu `/10x-infra-research` to nie ogólne osie „dobrej platformy" — to konkretne cechy przesądzające, czy agent zdoła obsłużyć platformę z sesji bez prowadzenia za rękę:

1. **CLI-first** — każda rutynowa operacja ma udokumentowaną komendę; agent nie musi klikać w panelu.
2. **Managed / serverless** — mniej ruchomych części to mniej sposobów, na jakie agent (albo ty) zepsuje coś, co platforma miała obsłużyć.
3. **Dokumentacja czytelna dla agenta** — markdown / `llms.txt` / docsy na GitHubie, które agent pobierze i sparsuje, a nie strony marketingowe renderowane JS-em.
4. **Stabilne, skryptowalne API deployu** — przewidywalne kody wyjścia, ustrukturyzowany output, brak interaktywnych pytań w trakcie deployu.
5. **Serwer MCP lub integracja agentowa pierwszej klasy** — bonus, nie wymóg. Samo CLI wystarcza na MVP; MCP zarabia na siebie, gdy agent robi dziesiątki ustrukturyzowanych zapytań o stan live.

Twarde filtry działają przed scoringiem (wymóg trwałych połączeń odrzuca Netlify/Vercel w wariancie serverless-only; niezgodność runtime'u ze stackiem odrzuca platformę w całości). Odpowiedzi z wywiadu przeważają kryteria po filtrach — wrażliwość na koszt karze drogie progi bazowe, znajomość rozstrzyga remisy, preferencja zasięgu globalnego faworyzuje platformy edge-native, preferencja kolokacji faworyzuje zintegrowane bazy.

## Antybias jako dyscyplina decyzyjna (nie teatr)

Każda rozmowa badawcza z LLM-em ma wbudowane przechylenie w stronę tego, co użytkownik już zasygnalizował. `/10x-infra-research` przepuszcza lidera przez trzy ustrukturyzowane soczewki PRZED zapisem pliku, nie po:

- **Adwokat diabła** — _znajdź słabości, ukryte koszty i tryby awarii specyficzne dla wdrożenia `<tego stacku>` na `<tej platformie>`_. Wynik: numerowana lista 3–5 konkretów, nie kategorii.
- **Pre-mortem** — _pół roku później ta decyzja okazała się kompletną katastrofą; przejdź przez założenia i niedoszacowane ryzyka, które do tego doprowadziły_. Wynik: narracja na 150–200 słów; narracje ujawniają konkretne kształty awarii, które abstrakcyjne listy ryzyk ukrywają.
- **Nieznane niewiadome** — _co jest prawdą o tej kombinacji, czego strona marketingowa i dokumentacja nie mówią wprost?_ Wynik: 3–5 nieoczywistych ryzyk.

Po cross-checku użytkownik ma trzy realne opcje: **zostać przy liderze i wchłonąć ryzyka do rejestru**, **przesiąść się na runner-up** (i powtórzyć cross-check na nowym liderze) albo **przesiąść się na trzecie miejsce**. Trzecia opcja jest rzadka; jeśli przez wiele przebiegów nie zdarza się nigdy, cross-check zdegenerował się w rytuał i trzeba go przepisać.

Dwie dodatkowe techniki (bez skilla, surowe prompty) należą do tego samego zestawu: zmuszenie modelu do porównania trzech wariantów w tabeli markdown (struktura bije „tę samą odpowiedź innymi słowami") oraz rotacja ról (ta sama decyzja oczami frontendowca, osoby od bezpieczeństwa i właściciela budżetu — pokaż koszt, jaki płaci każda rola, i zaproponuj alternatywy, jeśli któraś się wzdryga).

## CLI kontra MCP do obsługi żywej infrastruktury

Po wdrożeniu agent potrzebuje sposobu na rozmowę z działającą platformą. Dwie drogi, komplementarne, nie konkurencyjne:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — jawne i audytowalne, output zostaje w terminalu, bezpieczniejsze domyślne przy operacjach nieodwracalnych (np. `netlify deploy` domyślnie robi draft; `--prod` trzeba podać jawnie). Najlepsze na MVP: minimalny setup, niski koszt kontekstu (żadne schematy narzędzi nie są ładowane z góry), a agent musi znać komendę — i tu pomaga skill per narzędzie.
- **MCP** — dedykowany serwer wystawiający ustrukturyzowane narzędzia ze schematami (`pages_deployments_list` itd.). Każdy podłączony serwer MCP dokłada definicje narzędzi do okna kontekstu, więc koszt kumuluje się przy wielu serwerach. Zarabia na siebie, gdy agent robi wiele zapytań rozpoznawczych o stan live (logi, różnice między wdrożeniami) i ustrukturyzowany JSON bije parsowanie outputu CLI.

Rozsądny domyślny wybór: zacznij od CLI, dołóż MCP, gdy zauważysz powtarzalny wzorzec przechodzenia po `--help`, który agent musi robić, żeby odpowiedzieć na klasę pytań. Ujęcie Anthropic z [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) brzmi „API, CLI i MCP to trzy komplementarne drogi" — wybieraj po zadaniu, nie po hype.

## Granica dostępu do produkcji (minimalne uprawnienia, człowiek przy nieodwracalnych)

Zarówno CLI, jak i MCP mogą dać agentowi bezpośredni dostęp do produkcji. Lekcja ustala domyślną postawę:

- **Tokeny są zawężone, nie są kluczem-wytrychem.** Na Cloudflare: token API ograniczony do Pages albo Workers dla jednego projektu, bez DNS, bez Workers Secrets innych projektów, bez billingu. Odpowiednik AWS / GCP: zawężona rola IAM z `console-only-user` albo tylko-do-odczytu na produkcji i pełnym dostępem na stagingu.
- **Tokeny żyją w zmiennych środowiskowych, nie w `.mcp.json` wrzuconym do repozytorium.** Agent pobiera je przez serwer MCP albo mechanizm env-discovery CLI, nie przez plaintext w rozmowie.
- **Operacje destrukcyjne są tylko dla człowieka.** Skasowanie bazy, rotacja głównego sekretu, usunięcie projektu — to operacje robione ręcznie w panelu, nawet jeśli agent je zaproponuje. Ręczne kliknięcie kosztuje 30 sekund; sprzątanie po automatycznej pomyłce kosztuje godziny.

To postawa na MVP. Wraz z dojrzewaniem projektu naturalna ewolucja to pełny dostęp agenta na stagingu i tylko-do-odczytu na produkcji — temat kolejnych modułów.

## Ścieżki foundation używane przez tę lekcję

- `context/foundation/tech-stack.md` — wejście (hand-off z lekcji 2, twarde ograniczenia)
- `context/foundation/prd.md` — wejście (hand-off z lekcji 1, miękkie wagi)
- `context/foundation/infrastructure.md` — wyjście (trzeci kontrakt foundation)
- `context/deployment/deploy-plan.md` — wyjście Plan Mode deploy (ślad audytowy „co miało się wydarzyć")
- `context/foundation/lessons.md` — powtarzalne reguły i pułapki (użyj `/10x-lesson` z lekcji 4, gdy wypatrzysz klasę awarii agenta podczas researchu albo deployu)
- `docs/reference/contract-surfaces.md` — rejestr nazw nośnych

## Uniwersalny język

Wysyłany skill nie zawiera odwołań do 10xDevs, kohorty ani certyfikacji. Lista platform-kandydatek (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) to punkt wyjścia do researchu, nie zestaw rekomendacji — nośny jest pipeline scoring + wywiad + cross-check, a platformę spoza domyślnej listy można dołożyć, rozszerzając krok researchu. Prawdziwym rdzeniem artefaktu jest pięć kryteriów agent-friendly; `/10x-infra-research` czyta je z `references/agent-friendly-criteria.md`, więc ewoluują razem z platformami.

Skille nie zapisują do `context/archive/`. Zarchiwizowane zmiany są niezmienne — jeśli docelowa ścieżka zaczyna się od `context/archive/`, przerwij komunikatem: „Ta zmiana jest zarchiwizowana. Otwórz nową zmianę przez `/10x-new`."
