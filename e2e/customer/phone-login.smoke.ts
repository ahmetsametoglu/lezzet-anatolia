import { expect, test } from '@playwright/test';

/** Gezinme `storefront.smoke.ts`teki gibi `domcontentloaded`; gerekçesi orada. */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Telefon girişi yalnız `mobile-web`de anlamlı (masaüstü aynı adreste kendi girişini çizer); kod gönderilmez, veritabanına yazılmaz. */
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

    // ‹ e-posta adımından seçime döner, sayfadan çıkmaz.
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/connexion$/);

    // Tarayıcının geri hareketi de (Android geri tuşu, iOS Safari kaydırması) adım adım.
    await page.getByRole('button', { name: "Continuer avec l'e-mail" }).click();
    await expect(page.getByRole('button', { name: 'Envoyer un code à usage unique' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/connexion$/);
  });

  test('Bildirimler: misafir sayfada kalır, doğrulama daveti girişe götürür', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-web', 'telefon görünümüne özgü');

    const res = await page.goto('/fr/compte/notifications', NAV);
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/fr\/compte\/notifications$/);
    await expect(page.getByText('Vos notifications arrivent ici', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Vérification rapide' }).click();
    await expect(page).toHaveURL(/\/fr\/connexion\?next=/);
  });
});
