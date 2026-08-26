import { test, expect } from '@playwright/test';

/**
 * OPERASYON ZİLİ dumanı (14.15). İddialar kaba yapısal (00.9 kuralı): zil başlık barında var,
 * panel açılıyor, içerik ya satır ya dürüst boşluk — satır İÇERİĞİNE bağlanılmaz çünkü akış
 * seed'e değil o anki personel satırlarına bakar (deterministik değil).
 *
 * Satır ÜRETİMİNİN doğruluğu bu katmanın işi değil: e-postasız müşterinin belgesi →
 * `document_undeliverable` zinciri uygulama katmanının pipeline testinde uçtan uca çivili
 * (`dispatch.pipeline.test.ts`); burada yalnız o satırların EKRANA çıktığı kapı yoklanır.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

test.describe('operasyon zili — ilk bakış', () => {
  test('zil başlık barında; panel açılır ve ya satır ya dürüst boşluk gösterir', async ({ page }) => {
    const response = await page.goto('/operations/orders', NAV);
    expect(response?.ok()).toBeTruthy();

    const bell = page.getByRole('button', { name: 'Bildirimler' });
    await expect(bell).toBeVisible();

    // TIKLA-VE-DOĞRULA tek döngüde (ölçüldü: sipariş ekranı büyük, ilk tık hidrasyondan ÖNCE
    // düğmeye gitti — handler bağlı değildi, panel açılmadı, hata da yoktu). `toPass` açılana
    // dek yeniden tıklar; başarı ölçütü düğmenin kendi beyanı (aria-expanded). Başlık metnine
    // sayı-bazlı bağlanılmaz — zilin adı aria-label'dır, metin değil (`.nth(1)` yazımı düştü).
    await expect(async () => {
      await bell.click();
      await expect(bell).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // İçerik iki meşru hâlden biri — boş hâl de ÇİZİLİR ("Şimdilik bildirim yok"), sessiz hiçlik değil.
    await expect(page.getByText(/Şimdilik bildirim yok|Ulaştırılamayan|Yeni bir bildirim/).first()).toBeVisible();
  });
});
