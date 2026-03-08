# Playwright Testing Guide

Projekt je teraz nastavený s Playwright testami. Tu je ako ich spúšťať:

## Inštalácia

Playwright je už nainštalovaný. Ak potrebuješ nainštalovať browsery:

```bash
npx playwright install
```

## Spúšťanie testov

### Základné spustenie (všetky browsery)
```bash
npm run test
```

### Spustenie s UI
```bash
npm run test:ui
```
Otvorí sa grafické rozhranie kde vidíš testy live.

### Debug režim
```bash
npm run test:debug
```
Spustí testy v debug režime s step-by-step kontrolou.

### Headed režim (vidíš browser počas testovania)
```bash
npm run test:headed
```

### Spustenie konkrétneho testu
```bash
npx playwright test tests/cake-calculator.spec.ts
```

### Spustenie konkrétnej test groups
```bash
npx playwright test -g "Price Calculation"
```

## Čo testy overujú:

### 1. **Price Calculation Tests**
- ✅ Načítanie kalkulačky
- ✅ Výber priemeru a zobrazenie ceny
- ✅ Validácia povinných polí

### 2. **Shopping Cart Tests**
- ✅ Pridanie položky do košíka
- ✅ Zobrazenie celkového súčtu
- ✅ PDF export

### 3. **Checkout & Email Modal Tests**
- ✅ Validácia email formulára
- ✅ Loading state počas odoslania
- ✅ Success screen po objednávke

## HTML Report
Po spustení testov je vygenerovaný report:
```bash
npx playwright show-report
```

## Rozšírenie testov
Všetky testy sú v súbore `tests/cake-calculator.spec.ts`. Môžeš:
- Pridať nové test cases
- Zmeniť selektory ak sa DOM zmení
- Testovať admin panel (pridávanie receptov, itd.)
- Testovať rôzne kombinácie výberu položiek

## Tips:
- Klikni pravým gombom v Playwright trace viewer a vidíš ako sa aplikácia správala
- Screenshoty chýb sú uložené automaticky
- Testy beží paralelne na všetkých troch browseroch (Chromium, Firefox, WebKit)
