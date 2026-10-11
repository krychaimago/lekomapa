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
