# Upeč si cenu (Torta konfigurátor)

Interaktívny konfigurátor torty s kalkuláciou ceny, košíkom a exportom objednávky do PDF (podpora slovenských diakritík). Admin sekcia umožňuje spravovať možnosti (priemer, výška, krémy, extra suroviny, ovocie, dekorácie, logistika).

## Funkcie
- Výber parametrov torty a dynamická cena
- Pridanie položiek do košíka + množstvo
- Export košíka do PDF (DejaVuSans font – diakritika)
- Odoslanie objednávky e‑mailom (Edge Function)
- Admin panel: prihlasovanie + správa sekcií

## Technológie
- Vite + React + TypeScript
- Supabase (auth, databáza, edge functions)
- jsPDF na generovanie PDF

## Inštalácia
```bash
git clone https://github.com/USERNAME/REPO.git
cd REPO
npm install
cp .env.example .env
```
Uprav `.env` podľa projektu:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```
Service role **NEVKLADAJ** do frontendu (`SUPABASE_SERVICE_KEY`).

## Spustenie
```bash
npm run dev
```
Otvor http://localhost:5173

## PDF fonty
V `public/fonts/` musia byť:
- `DejaVuSans.ttf`
- `DejaVuSans-Bold.ttf`
Fallback: Noto Sans CDN / helvetica.

## Seed dát (lokálne)
```bash
node scripts/seed_sections.ts
```
Vyžaduje service role key (iba lokálne / server). Spúšťaj mimo browser build.

## Edge Function odoslanie e‑mailu
V priečinku `supabase/functions/send-order-email/`. Nasadenie:
```bash
npx supabase login
npx supabase functions deploy send-order-email
```

## Rotácia kľúčov
Ak boli kľúče verejne zobrazené:
1. Supabase Dashboard → Settings → API → Generate new (anon + service).
2. Aktualizuj `.env` / server secrets.
3. Redeploy edge functions, ak používajú service key.

## Build produkcie
```bash
npm run build
```
Výstup v `dist/` – deploy na Vercel / Netlify / Cloudflare Pages.

## TODO (možné vylepšenia)
- Validácia vstupov v AdminPanel
- Lepšie rozdelenie komponentov (refaktor veľkého `HomePage.tsx`)
- Testy cenových výpočtov

## Licencia
Bez formálnej licencie (súkromný projekt). Pri použití externých fontov rešpektuj pôvodné licencie.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
