import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON TARİFLERİ (08.58 · kullanıcı kararı 14.09) — native tarif listesinin ve tarif detayının web ikizi. Yalnız
 * `mobile-web` projesinde anlamlı: masaüstü aynı adreslerde v1 sayfalarını çizer.
 *
 * Seed'e bağlanmamak için tarif listeden seçilir (ilk kart). İddialar kaba: listede TEK `h1` (native'in başlığı) ve
 * geri düğmesi; detayda TEK `h1` (tarifin adı), kahramanın üstündeki geri düğmesi ve malzeme bölümünün üstbaşlığı.
 */
test.describe('telefon tarifleri — ziyaretçi', () => {
  test('liste ve detay native tarif ekranlarının düzeninde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const list = await page.goto('/fr/recettes', NAV);
    expect(list?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: 'Idées de table' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();

    const href = await page.locator('a[href*="/fr/recette/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    const detail = await page.goto(href ?? '/fr/recettes', NAV);
    expect(detail?.ok()).toBeTruthy();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByText('INGRÉDIENTS — DE CHEZ NOUS', { exact: true })).toBeVisible();
  });
});
