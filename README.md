<div align="center">
  <h1>🍰 Upeč si cenu – Konfigurátor torty</h1>
  <p>Interaktívny konfigurátor torty s dynamickým výpočtom ceny, PDF exportom, e‑mail notifikáciami a administráciou položiek.</p>
  <sup>Frontend: React + Vite + TypeScript • Backend: Supabase (DB, Auth, Edge Functions) • Email: Resend • PDF: jsPDF</sup>
</div>

---

## 📌 Prehľad
Používateľ si krokovo zostaví tortu (priemer, výška, krémy, extra zložky, ovocie, dekorácie, logistika), vidí okamžitú cenu, môže položky ukladať do košíka a exportovať objednávku do PDF (vrátane slovenských diakritík). Objednávku odošle – Edge Function v Supabase zavolá Resend API a pošle e‑mail adminovi aj zákazníkovi.

## 🎯 Hlavné funkcie
- Konfigurácia torty so sekciami a validáciou výberov
- Dynamická kalkulácia ceny (súčet + odmena / bonus položka)
- Košík s množstvami a opakovanými položkami
- Export do PDF (slovenské znaky: č, ľ, ď, ť, ň…) pomocou vložených fontov
- Odoslanie objednávky (Edge Function → Resend API → 2 e‑maily)
- AdminPanel na správu sekcií (CRUD položiek a cien)
- Prihlásenie cez Supabase Auth (email + heslo)

## 🧱 Architektúra
```
Frontend (React + Vite)
  ├─ Stránky: HomePage, AdminPanel
  ├─ Komponenty: EmailModal, (Login – aktuálne nevyužitý), ProtectedRoute (nevyužitý)
  ├─ Stav: useState / jednoduché kalkulácie cien
  ├─ PDF: jsPDF + dynamické fonty (DejaVuSans regular + bold)
Backend (Supabase)
  ├─ PostgreSQL tabuľka: section_options (parametre torty)
  ├─ Auth: Email + heslo (Supabase Auth)
  ├─ Edge Function: send-order-email (Deno runtime)
Email Služba (Resend)
  ├─ API na odoslanie HTML emailov adminovi a zákazníkovi
```

## 📂 Štruktúra projektu (výber)
```
src/
  pages/HomePage.tsx       – Hlavný konfigurátor + košík + PDF export
  pages/AdminPanel.tsx     – Správa sekcií + login
  lib/supabase.ts          – Inicializácia Supabase klienta (anon key)
  components/EmailModal.tsx– Dialóg na dokončenie objednávky
supabase/functions/send-order-email/index.ts – Edge Function volajúca Resend
scripts/seed_sections.ts   – Seed základných sekcií do DB (service key)
public/fonts/DejaVuSans*.ttf – Fonty pre PDF (diakritika)
```

## 🗄️ Dáta – tabuľka `section_options`
Pre každý typ sekcie (napr. „Priemer torty“) sa ukladajú možnosti:
- `name` – názov položky (napr. 24 cm)
- `price` – cena v €
- `description` – doplnkový text (voliteľné)
- `sort_order` – poradie

Filtrovacie kľúče (mapované v AdminPanel) umožňujú oddeliť typy sekcií.

## 💰 Výpočet ceny
Cena = súčet cien vybraných položiek (priemer + výška + krémy + extra + ovocie + dekorácie + logistika) + odmena (`rewardAmount`). Každý riadok je zobrazený samostatne pre transparentnosť.

## 🧾 PDF Export
- Knižnica: `jsPDF`
- Font priorita: 1) `DejaVuSans.ttf` 2) `DejaVuSans-Bold.ttf` pre nadpisy 3) fallback Noto Sans (CDN) 4) helvetica
- Kódovanie: Identity-H (Unicode) → spoľahlivá diakritika
- Obsah: nadpis, položky s cenami, celkový súčet, meta údaje objednávky.

## ✉️ Odoslanie objednávky (Edge Function + Resend)
Flow:
1. Frontend odošle JSON payload (meno, email zákazníka, položky, total) na Edge Function URL.
2. Edge Function `send-order-email` zostaví HTML tabuľku a vykoná dve volania na Resend API (`/emails`).
3. Admin dostane notifikáciu, zákazník potvrdenie.

Payload štruktúra (`OrderPayload`):
```typescript
{
  customerEmail: string;
  customerName: string;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number; }[];
  total: number;
}
```
Resend API key sa nastavuje ako Supabase secret: `RESEND_API_KEY`.

## 🔐 Bezpečnosť & Secrets
- Frontend používa iba: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Service role key (`SUPABASE_SERVICE_KEY`) sa NIKDY nesmie dostať do buildu frontendu – používa sa len v skriptoch (seed) alebo serverových prostrediach.
- Edge Function číta secret `RESEND_API_KEY` cez `Deno.env.get`.
- Pri úniku kľúčov: v Dashboard → Settings → API → regenerate keys + update `.env`.
- Odporúčanie: aktivuj Row Level Security (RLS) na tabuľke a definuj vhodné policies (ak bude verejný zápis/čítanie).

## 🔧 Inštalácia & Spustenie
```bash
git clone https://github.com/USERNAME/upec-si-cenu.git
cd upec-si-cenu
npm install
cp .env.example .env
```
Vyplň `.env`:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
# (Service key sem nedávaj)
```
Spustenie dev servera:
```bash
npm run dev
```
Otvor: http://localhost:5173

## 🪛 Seed základných sekcií
Použitie (iba lokálne / server – potrebuje service key):
```bash
SUPABASE_SERVICE_KEY=... node scripts/seed_sections.ts
```
Skript načíta environment z `process.env` a vloží základné možnosti.

## 🚀 Nasadenie Edge Function (emaily)
Postup (skrátka):
```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase secrets set RESEND_API_KEY=re_xxx
npx supabase functions deploy send-order-email
```
Detailný návod: `SUPABASE_EDGE_FUNCTION_SETUP.md`.

## 📦 Build produkcie
```bash
npm run build
```
Výstup v `dist/` → nasadenie na statický hosting (Vercel, Netlify, Cloudflare Pages). Edge Function ostáva hostovaná v Supabase.

## 📑 ESLint & TypeScript
- Striktné typy (TS 5.9) + ESLint konfigurácia v `eslint.config.js`.
- Možné rozšíriť o React špecifické pravidlá / TypeAware lint.

## 🛠 Použité závislosti (výber)
- `react`, `react-router-dom` – UI + routing
- `@supabase/supabase-js` – databáza, auth, edge volania
- `jspdf` – PDF generovanie
- `ts-node` – spúšťanie seed skriptov
- `dotenv` – načítanie env pri skriptoch

## 🧪 Budúce vylepšenia
- Refaktor obrovského `HomePage.tsx` do menších komponentov
- Testy cenového engine (Jest / Vitest)
- Trvalé uloženie objednávok do DB + Admin prehľad
- Resend: šablóny, vlastná doména, DKIM/SPF
- Validácia emailu / vstupov priamo pri odoslaní

## 🗒️ Licencia
Interný / súkromný projekt. Pri použití fontov (DejaVu Sans, prípadné Noto Sans) dodržuj ich licencie.

## ❓ FAQ
**Prečo nevidím service key na frontende?**  Je nebezpečný – umožňuje obchádzať policies. Patrí len na server / Edge Functions.
**Prečo DejaVuSans?** Poskytuje plnú podporu stredoeurópskych znakov v PDF.
**Ako pridám novú sekciu?** V AdminPanel uprav kľúč alebo pridaj položku do príslušnej sekcie.

---
Ak potrebuješ doplniť nasadenie na konkrétnu platformu alebo nastaviť RLS policies, daj vedieť. 🍀
