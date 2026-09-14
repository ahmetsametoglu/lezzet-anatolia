import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON ÜRÜN DETAYI (08.58 · kullanıcı kararı 14.09) — native ürün detayının web ikizi. Yalnız `mobile-web`
 * projesinde anlamlı: masaüstü aynı adreste v1 ürün sayfasını çizer.
 *
 * Seed'e bağlanmamak için ürün katalogdan seçilir (ilk kart). İddialar kaba: TEK `h1` (ürünün adı), kahramanın
 * üstünde yüzen geri ve paylaş düğmeleri, beyan akordeonunun başlığı (INCO içeriği kapalıyken de sayfada).
 */
test.describe('telefon ürün detayı — ziyaretçi', () => {
  test('kahraman, künye ve beyan native ürün detayının düzeninde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    await page.goto('/fr/catalogue', NAV);
    const href = await page.locator('a[href*="/fr/produit/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    const response = await page.goto(href ?? '/fr/catalogue', NAV);
    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();
    await expect(page.getByText('Ingrédients & allergènes')).toBeVisible();
  });
});
