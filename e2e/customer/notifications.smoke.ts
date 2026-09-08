import { test, expect } from '@playwright/test';

/**
 * MÜŞTERİ BİLDİRİM AKIŞI dumanı (14.15) — girişsiz kısım: sayfa sır değil, eksik olan kimlik;
 * ziyaretçi 404 değil GİRİŞ görür (hesap sayfasının kuralı).
 *
 * Girişli akış BİLİNÇLİ dışarıda: müşteri oturumu misafir OTP akışından geçer ve o kulvar yalnız
 * dev'e karşı koşuyor (`checkout-otp` — sabit kod production derlemesinde kapalı). Akışın veri
 * doğruluğu zaten alt katmanlarda çivili: okuma kapısı entegrasyonda (`read.test.ts`), zincir
 * pipeline testinde, cümle sözlüğü `@lezzet/i18n` biriminde — buradaki soru yalnız kapının yönü.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };
/*
  YÖNLENDİRME 307 DEĞİL, AKAN KABUK + META REFRESH (ölçüldü 07.09, curl ile): hesap sayfasının
  `loading.tsx`i önce akıyor, `redirect()` ondan sonra koştuğu için Next cevabı 200 + 1 sn'lik
  `<meta http-equiv="refresh" url=/fr/connexion>` olarak veriyor; tarayıcı sonra `/fr/connexion`e
  gidiyor ve o sayfa dev'de SOĞUK derleniyor. Varsayılan 5 sn'lik URL beklemesi bu zinciri
  kaçırıyordu ("waiting for /fr/connexion navigation to finish") — 28.08'den beri kırmızı olan
  buydu, kapı değil. Kural değişmedi: ziyaretçi yine girişe gider, 404 görmez.
*/
const REDIRECT_TIMEOUT_MS = 30_000;

test.describe('bildirim akışı — girişsiz ziyaretçi', () => {
  test('akış sayfası ziyaretçiyi girişe yönlendirir, 404 vermez', async ({ page }) => {
    await page.goto('/fr/compte/notifications', NAV);
    await expect(page).toHaveURL(/connexion/, { timeout: REDIRECT_TIMEOUT_MS });
    await expect(page.locator('main')).toBeVisible();
  });

  test('tercih sayfasının yeni adresi yaşıyor (rota taşındı: preferences)', async ({ page }) => {
    // Ne oturum ne jeton → sayfanın kendi kuralı girişe yönlendirmek (page.tsx). İddianın değeri
    // yönlendirmenin KENDİSİ: yeni adres çözülmeseydi 404 çerçevesine düşerdik — mail altbilgisinin
    // "tercihlerinizi yönetin" bağı da o gün ölürdü (08.14'te bir kez yaşandı).
    await page.goto('/fr/compte/preferences', NAV);
    await expect(page).toHaveURL(/connexion/, { timeout: REDIRECT_TIMEOUT_MS });
  });
});
