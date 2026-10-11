---
change_id: email-sender-smtp
title: Email sender smtp
status: implementing
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 1 — stan po konfiguracji (11.10.2026)

- OVH nie pozwala założyć skrzynki przy `lekomapa.pl` („Nie masz możliwości utworzenia konta e-mail.”). Wybrany wariant B: Cloudflare Email Routing, reguła `kontakt@lekomapa.pl` → `krysko.anna@gmail.com` (adres docelowy Verified, catch-all Disabled). Mail z obcej skrzynki doszedł do Gmaila.
- Usunięte z DNS w Cloudflare: MX `mx1.mail.ovh.net` (priorytet 1), `mx2.mail.ovh.net` (5), `mx3.mail.ovh.net` (100) oraz TXT `v=spf1 include:mx.ovh.com -all`. Wartości zapisane na wypadek wycofania.
- Dodane przez kreator Email Routing: MX `route1/2/3.mx.cloudflare.net`, TXT `cf2024-1._domainkey`, TXT SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`.
- Dodane ręcznie z panelu Brevo (konfiguracja Manual, bez branded subdomain): TXT `@` (`brevo-code:…`), CNAME `brevo1._domainkey` i `brevo2._domainkey` (DNS only), TXT `_dmarc` (`p=none`, raporty do Brevo). Brevo nie prosił o wpis SPF — SPF został jeden.
- `dig` na serwerze autorytatywnym Cloudflare, 1.1.1.1 i 8.8.8.8: trzy MX Cloudflare, jeden rekord `v=spf1`, `v=DMARC1` obecny, `brevo1/brevo2._domainkey` prowadzą do kluczy RSA Brevo. `https://lekomapa.pl` dalej zwraca 302 na `/auth/signin`.
- Brevo: SMTP aktywne bez prośby o aktywację (`smtp-relay.brevo.com:587`). Nadawca `Lekomapa <kontakt@lekomapa.pl>` Verified, DKIM `lekomapa.pl` i DMARC zielone. Klucz SMTP niewygenerowany — powstaje w fazie 3 tuż przed wklejeniem do Supabase.
- Na fazę 3: wyłączyć śledzenie kliknięć i otwarć w Brevo (transakcyjne), żeby odnośniki z `token_hash` nie przechodziły przez przekierowania Brevo.

### Phase 3 — przełączenie (11.10.2026)

- Supabase (produkcja): custom SMTP Brevo włączony, nadawca `Lekomapa <kontakt@lekomapa.pl>`, limit 30 maili na godzinę. Szablony „Reset Password” i „Confirm signup” wklejone z `supabase/templates/*.html`, odnośniki z `token_hash` sprawdzone po ponownym otwarciu. Redirect URLs dla `/auth/confirm` i `/auth/reset-password/confirm` obecne.
- Klucz SMTP Brevo: wariant Standard, bez daty wygaśnięcia. Brevo i tak unieważnia klucz po 90 dniach bez wysyłki — wpis w rejestrze ryzyk `infrastructure.md`.
- Śledzenie w Brevo: darmowe konto nie pozwala wyłączyć śledzenia otwarć i kliknięć przy SMTP (tylko Enterprise albo na prośbę do supportu). Pomiar: odnośnik w mailu potwierdzającym prowadzi przez `*.sendibt3.com`, nie wprost na `lekomapa.pl`. Krok 3.10 w brzmieniu planu nie przechodzi.
- Decyzja autorki (wariant „optymalny” z trzech: akceptacja / akceptacja + prośba do supportu / zmiana dostawcy): akceptacja ze śledzeniem anonimowym (Brevo → Transactional → Tracking → Anonymous = Yes), zdanie o śledzeniu na stronie prywatności i prośba do supportu Brevo o wyłączenie śledzenia (wysłana 11.10.2026). Po zgodzie Brevo: usunąć zdanie o śledzeniu ze strony prywatności i sprawdzić odnośnik ponownie.
- Brevo dodaje nagłówek wypisu — Gmail pokazuje „Anuluj subskrypcję” przy mailu potwierdzającym. Niezmierzone: czy wypis blokuje późniejsze maile transakcyjne (np. reset hasła) do tego adresu. Pytanie dołączone do prośby do supportu.
- Zamknięcie kroku 5.5 z zarchiwizowanej zmiany `terms-acceptance-on-signup` (szablon potwierdzenia na produkcji): wykonane w tej fazie.
- Testy na produkcji (11.10.2026): Gmail (alias autorki) — potwierdzenie, logowanie, reset hasła i logowanie nowym hasłem działają; nagłówki: `dkim=pass` (`@lekomapa.pl`), `dmarc=pass` (`p=none`), `spf=pass` dla domeny zwrotek Brevo (`sender-sib.com`) — DMARC przechodzi przez wyrównanie DKIM. WP.pl — mail potwierdzający w odebranych; reset na WP nie sprawdzany (ten sam nadawca i podpis).
- Dopisku „Sent with Brevo” brak (Gmail i WP).
- WP.pl pokazuje nad mailem potwierdzającym „Ta wiadomość pochodzi z listy mailingowej” i przycisk „Wypisz i zablokuj” — to ten sam nagłówek wypisu Brevo. Kliknięcie może zablokować nadawcę po stronie WP niezależnie od odpowiedzi Brevo.
