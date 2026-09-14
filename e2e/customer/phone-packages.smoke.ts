import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON PAKETLERİ (08.58 · kullanıcı kararı 14.09) — native paket listesinin ve paket detayının web ikizi. Yalnız
 * `mobile-web` projesinde anlamlı: masaüstü aynı adreslerde v1 sayfalarını çizer.
 *
 * Seed'e bağlanmamak için paket listeden seçilir (ilk kart). İddialar kaba: listede TEK `h1` (native'in başlık
 * cümlesi); detayda TEK `h1` (paketin adı), başlık çubuğunun geri ve paylaş düğmeleri ve çubuğun başlığı.
 */
test.describe('telefon paketleri — ziyaretçi', () => {
  test('liste ve detay native paket ekranlarının düzeninde', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const list = await page.goto('/fr/coffrets', NAV);
    expect(list?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: "Nous dressons la table, vous n'avez qu'à inviter" })).toBeVisible();

    const href = await page.locator('a[href*="/fr/coffret/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    const detail = await page.goto(href ?? '/fr/coffrets', NAV);
    expect(detail?.ok()).toBeTruthy();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();
    await expect(page.getByText('Coffret prêt', { exact: true })).toBeVisible();
  });
});
