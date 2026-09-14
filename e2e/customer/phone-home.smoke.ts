import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON VİTRİNİ (08.58 · kullanıcı kararı 14.09) — native vitrinin web ikizi. Yalnız `mobile-web`
 * projesinde anlamlı: masaüstü aynı adreste v1 anasayfasını çizer.
 *
 * İddialar kaba ve seed içeriğine bağlanmıyor: ziyaretçi selamlaması (native'in "hoş geldiniz"i),
 * arama motorunun okuduğu TEK `h1` (native'de kahraman yok; `h1` sayfada görünmez duruyor) ve vitrinden
 * ürün sayfalarına giden bağlantılar.
 */
test.describe('telefon vitrini — ziyaretçi', () => {
  test('native vitrinin bölümleri çizilir, arama motorunun h1i yerinde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const response = await page.goto('/fr', NAV);
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByText('Bienvenue', { exact: false }).first()).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('a[href*="/fr/produit/"]').count()).toBeGreaterThan(0);
  });
});
