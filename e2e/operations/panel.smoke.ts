import { test, expect } from '@playwright/test';

/**
 * DENEME dumanı (00.9 çekirdek kurulumu — denetim). Operasyon yüzeyi dev auth bypass'ıyla açılır
 * (guard.ts + seed'li DEV_ADMIN) — giriş adımı yok. İddialar kaba yapısal; gerçek yolculuklar
 * çapraz yazımla gelir: bu dosyayı MÜŞTERİ şeridi devralıp genişletir (`e2e/README.md` kural 2).
 */
test.describe('operasyon paneli — ilk bakış', () => {
  test('ürünler ekranı Türkçe açılır ve seed kataloğunu listeler', async ({ page }) => {
    const response = await page.goto('/operations/products');
    expect(response?.ok()).toBeTruthy();

    // Mobil fork başlığı h1/h2 taşımıyor (ölçüldü — ui:shot) — iddia İÇERİĞE bağlanır:
    // seed kataloğu deterministik (§4b okuyan-test kuralı), ürün adları listede görünmeli.
    await expect(page.getByText(/baklava/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('karşılama sayfası açılır ve gezinme rayı çizilir', async ({ page }) => {
    const response = await page.goto('/operations');
    expect(response?.ok()).toBeTruthy();
    // Rol farkında nav (09.2): dev-admin her bölümü görür — en az birkaç gezinme bağlantısı.
    expect(await page.locator('a[href^="/operations"]').count()).toBeGreaterThan(2);
  });
});
