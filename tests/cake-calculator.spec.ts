import { test, expect } from '@playwright/test';

test.describe('Cake Calculator - Price Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Tortová Kalkulačka')).toBeVisible();
  });

  test('should load calculator with sections', async ({ page }) => {
    // Skontroluj či sú sekcie načítané
    await expect(page.locator('h2').filter({ hasText: 'Priemer' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Obterový Krém' })).toBeVisible();
  });

  test('should select diameter and display price', async ({ page }) => {
    // Najdi prvú sekciu (podľa sort_order to bude priemer)
    const firstSection = page.locator('section').first();
    const firstSelect = firstSection.locator('select');
    
    // Počkaj kým sa načítajú options z databázy
    await firstSelect.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const select = document.querySelector('section select');
      if (!(select instanceof HTMLSelectElement)) return false;
      return select.options.length > 1;
    });
    
    // Vyber prvú možnosť (napr. 15 cm, 30 cm, atď.)
    await firstSelect.selectOption({ index: 1 });
    
    // Overenie že cena v prvej sekcii je 0.00 € (priemer sa neplatí)
    await expect(firstSection.locator('span').first()).toHaveText('0.00 €');
    
    // Namiesto klikania na cartButton skús rovno čakať na checkoutButton
    const checkoutButton = page.locator('button:has-text("Záväzne objednať")');
    await expect(checkoutButton).toBeVisible(); // Overíme, či sa košík otvoril
    await expect(checkoutButton).toContainText('0.00 €');
  });


});

test.describe('Shopping Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display cart total price', async ({ page }) => {
    // Vyplň povinné polia a pridaj položku
    await page.locator('select').nth(0).selectOption('1');
    await page.locator('select').nth(1).selectOption('1');
    await page.locator('select').nth(2).selectOption('1');
    await page.locator('button:has-text("Pridať")').click();

    // Otvor košík
    const cartButton = page.locator('button:has-text("🛒")');
    await cartButton.click();

    // Skontroluj či je viditeľný celkový súčet
    await expect(page.locator('text=/Spolu.*€/')).toBeVisible();
  });

  test('should export cart to PDF', async ({ page }) => {
    // Vyplň povinné polia a pridaj položku
    await page.locator('select').nth(0).selectOption('1');
    await page.locator('select').nth(1).selectOption('1');
    await page.locator('select').nth(2).selectOption('1');
    await page.locator('button:has-text("Pridať")').click();

    // Otvor košík
    const cartButton = page.locator('button:has-text("🛒")');
    await cartButton.click();

    // Klikni na PDF export - počkaj na stiahnutie
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Exportovať PDF")').click();
    const download = await downloadPromise;

    // Skontroluj či bol súbor stiahnutý
    expect(download.suggestedFilename()).toContain('.pdf');
  });
});

test.describe('Checkout & Email Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Pridaj položku
    await page.locator('select').nth(0).selectOption('1');
    await page.locator('select').nth(1).selectOption('1');
    await page.locator('select').nth(2).selectOption('1');
    await page.locator('button:has-text("Pridať")').click();
  });

  test('should validate email modal inputs', async ({ page }) => {
    // Otvor košík
    const cartButton = page.locator('button:has-text("🛒")');
    await cartButton.click();

    // Pokús sa poslať objednávku bez vyplnenia
    const checkoutButton = page.locator('button:has-text("Objednať")');
    await checkoutButton.click();

    // Skontroluj či sú povinné polia zvýraznené
    await expect(page.locator('input[placeholder="Meno a priezvisko"]')).toHaveAttribute('aria-invalid', 'true');
  });

  test('should show loading state during submission', async ({ page }) => {
    // Otvor košík
    const cartButton = page.locator('button:has-text("🛒")');
    await cartButton.click();

    // Vyplň formulár
    await page.fill('input[placeholder="Meno a priezvisko"]', 'Test User');
    await page.fill('input[placeholder="email@domena.sk"]', 'test@example.com');

    // Odošli objednávku
    const submitButton = page.locator('button:has-text("Objednať")');
    await submitButton.click();

    // Skontroluj či je viditeľný loading
    await expect(page.locator('text=Odosielame objednávku')).toBeVisible({ timeout: 5000 });
  });
});
