import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada. */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * Telefon paketleri — native paket listesi ve detayının web ikizi; yalnız `mobile-web`de anlamlı, çünkü masaüstü aynı
 * adreslerde kendi sayfasını çizer. Seed'e bağlanmamak için paket listeden seçilir (ilk kart).
 */
test.describe('telefon paketleri — ziyaretçi', () => {
  test('liste ve detay native paket ekranlarının düzeninde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const list = await page.goto('/fr/coffrets', NAV);
    expect(list?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: "Nous garnissons la table, vous n'avez plus qu'à inviter" })).toBeVisible();

    const href = await page.locator('a[href*="/fr/coffret/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    const detail = await page.goto(href ?? '/fr/coffrets', NAV);
    expect(detail?.ok()).toBeTruthy();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();
    await expect(page.getByText('Coffret', { exact: true })).toBeVisible();
  });
});
