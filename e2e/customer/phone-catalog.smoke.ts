import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON KATALOĞU (08.58 · kullanıcı kararı 14.09) — native katalogun web ikizi. Yalnız `mobile-web`
 * projesinde anlamlı: masaüstü aynı adreste v1 katalogunu çizer.
 *
 * İddialar kaba ve seed içeriğine bağlanmıyor: native'in arama kutusu, arama motorunun okuduğu TEK `h1`
 * (native katalogda görünür başlık yok), ürün sayfalarına giden kartlar ve süzgeç düğmesinin açtığı
 * sıralama çekmecesi — web'e özgü "Sadece indirimliler" anahtarıyla birlikte.
 */
test.describe('telefon kataloğu — ziyaretçi', () => {
  test('arama kutusu, kart ızgarası ve sıralama çekmecesi native katalogun düzeninde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const response = await page.goto('/fr/catalogue', NAV);
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByRole('searchbox', { name: 'Rechercher un produit' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('a[href*="/fr/produit/"]').count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Trier et filtrer' }).click();
    await expect(page.getByRole('dialog', { name: 'Trier & filtrer' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Uniquement les offres' })).toBeVisible();
  });
});
