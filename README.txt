DOBRO-KONJ – Netlify + Resend
================================

Vsebina ZIP:
- index.html
- netlify.toml
- netlify/functions/oddaj-obrazec.js

RESEND_API_KEY mora biti v Netlify Environment variables (Production).

Ta verzija po oddaji pošlje na domen@bbr.si:
1. PDF obrazec kot pravo e-poštno priponko
2. podpis.png kot pravo e-poštno priponko

Opomba: zaradi zanesljivosti in brez dodatnih knjižnic je podpis v tej verziji
ločena PNG priponka; PDF vsebuje vse podatke in opombo, da je podpis priložen.
