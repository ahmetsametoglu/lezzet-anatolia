import { expect, test } from '@playwright/test';

/** Gezinme sözleşmesi `storefront.smoke.ts`teki gibi `domcontentloaded` — gerekçesi orada (04.08). */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * TELEFON GİRİŞİ (08.58 · kullanıcı kararı 15.09) — `Musteri Mobil.dc.html` "Hızlı Doğrulama" karesi; native müşteri
 * girişiyle aynı ekran. Yalnız `mobile-web` projesinde anlamlı: masaüstü aynı adreste kendi girişini çizer.
 *
 * Veritabanına YAZMAZ: kod gönderilmez, e-posta adımı yalnız açılır. İddialar: tek `h1`, üç yol düğmesi, WhatsApp'ın
 * "yakında" satırı, E-posta yolunun alanı ve gönder düğmesi, cümlenin içindeki gizlilik bağı.
 */
test.describe('telefon girişi — ziyaretçi', () => {
  test('Hızlı Doğrulama: üç yol, WhatsApp bilgisi, e-posta adımı', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const res = await page.goto('/fr/connexion', NAV);
    expect(res?.ok()).toBeTruthy();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Vérifiez-vous en quelques secondes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'notre politique de confidentialité' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer avec WhatsApp' }).click();
    await expect(page.getByText('La connexion avec WhatsApp arrive très bientôt.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: "Continuer avec l'e-mail" }).click();
    await expect(page.getByRole('textbox', { name: 'Votre adresse e-mail' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer un code à usage unique' })).toBeVisible();
  });
});
