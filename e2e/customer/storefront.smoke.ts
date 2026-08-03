import { test, expect } from '@playwright/test';

/**
 * DENEME dumanı (00.9 çekirdek kurulumu — denetim). Amaç örnek olmak: senaryo tasarım/DOMAIN
 * cümlesinden, iddialar kaba yapısal (ekran açılıyor mu, çerçeve + içerik var mı) — kırılgan
 * seçici yok. Gerçek yolculuklar çapraz yazımla gelir (`e2e/README.md` kural 2); bu dosyayı
 * OPERASYON şeridi devralıp genişletir.
 */
test.describe('vitrin — müşteri ilk bakış', () => {
  test('ana sayfa Fransızca açılır ve gerçek katalog içeriği taşır', async ({ page }) => {
    const response = await page.goto('/fr');
    expect(response?.ok()).toBeTruthy();

    // Çerçeve: müşteri yüzeyi hata sınırına düşmemiş, gerçek bir sayfa çizilmiş.
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();

    // İçerik: vitrin fixture değil GERÇEK katalogdan okur (storefront künyesi) — seed ürünleri
    // bağlantı olarak görünmeli. Sayı iddiası kaba: "en az bir ürün daveti".
    const productLinks = page.locator('a[href*="/fr/"]');
    expect(await productLinks.count()).toBeGreaterThan(3);
  });

  test('bilinmeyen yol müşteri 404 çerçevesine düşer, boş ekrana değil', async ({ page }) => {
    await page.goto('/fr/olmayan-bir-sayfa-xyz');
    // 404 sayfası kendi tasarımıyla çizilir (not-found.tsx): ileri bir yol her zaman sunulur.
    await expect(page.locator('main, body >> a').first()).toBeVisible();
  });
});
