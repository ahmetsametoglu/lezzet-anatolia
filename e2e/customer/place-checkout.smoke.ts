import { test, expect } from '@playwright/test';

/**
 * KADEME 2 · PARTİ 3 — müşteri YAZAN akışlar, sınırlarına dek (denetim, 04.08).
 *
 * "Yazan" burada bilinçli dar: iki akışın DB'ye kalıcı satır bırakmayan yarısı sınanır —
 *  · KAPSAM İÇİ yer seçimi çerez + analitik olayı üretir, satır YAZMAZ (`recordDemand` yalnız
 *    bölge dışında sayar; bölge-dışı denemesi KÜRESEL sayacı kirletirdi — CLAUDE §4b, o yüzden
 *    burada yok).
 *  · Checkout MİSAFİR OTP / ödeme SINIRINA dek gidilir; taslak sipariş YARATILMAZ. Sınırın
 *    ötesi OTP kod-yakalama kapısı inince Parti 3b olur (`e2e/README` dışarıda kalanlar).
 * Analitik olayları headless UA ile kapıda düşer — defter de kirlenmez.
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe — dev'de `load` asılı kalabiliyor.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Seed'in deterministik kapsam-içi kodu (delivery_zone_postal_code — Strasbourg ailesi). */
const IN_ZONE_CODE = '67000';

test.describe('kademe 2 · yer seçimi → sepet → checkout sınırı (ziyaretçi)', () => {
  test('kapsam içi posta kodu seçilir, yer üst çubukta kalıcılaşır', async ({ page }) => {
    test.slow();
    await page.goto('/fr', NAV);

    // Yer seçici üst çubukta bir davet olarak durur (tasarım: her sayfada erişilebilir).
    await page.getByRole('button', { name: /code postal/i }).first().click();

    // Kod yazılır; öneri listesi NİYET kapısıdır (öneri okuma, ONAY niyet — 19.7 ayrımı):
    // öneriye tıklamak yeri çözer ve kalıcılaştırır.
    await page.getByRole('dialog').getByRole('textbox').first().fill(IN_ZONE_CODE);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(IN_ZONE_CODE) }).first().click();

    // Seçim üst çubukta görünür hâle gelir — sonraki sayfalarda da yaşar (çerez).
    await expect(page.getByRole('button', { name: new RegExp(IN_ZONE_CODE + '|Strasbourg', 'i') }).first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/fr/catalogue', NAV);
    await expect(page.getByRole('button', { name: new RegExp(IN_ZONE_CODE + '|Strasbourg', 'i') }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('yerli ziyaretçi sepetle checkout sayfasına ulaşır; akış kimlik sınırında durur', async ({ page }) => {
    test.slow();

    // Yer seç (üstteki senaryonun kısa tekrarı — testler birbirine yaslanmaz, her biri kendi
    // durumunu kurar; §4b damga gerekmez çünkü kalıcı satır yok).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(IN_ZONE_CODE);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(IN_ZONE_CODE) }).first().click();

    // Ürün sepete (Parti 1 yolculuğunun kısa hâli).
    await page.goto('/fr/catalogue', NAV);
    await page.locator('a[href*="/produit/"]').first().click();
    await page.waitForURL('**/produit/**', NAV);
    const addToCart = page.getByRole('button', { name: /panier|ajouter/i }).first();
    await expect(addToCart).toBeEnabled();
    await addToCart.click();

    // Checkout SINIRA dek: sayfa açılır ve KİMLİK ADIMI (misafir OTP — "kod gönder") görünür.
    // Sınırın kanıtı adımın kendisidir; tutar/özet doğrulaması OTP kapısı inince Parti 3b'nin işi.
    const response = await page.goto('/fr/commande', NAV);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: /commande/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /envoyer le code/i }).first()).toBeVisible();
  });
});
