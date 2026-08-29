import { test, expect } from '@playwright/test';
import { createCargoOrder, type CargoOrder } from '../fixtures/cargo-fixture';

/**
 * KARGO GÖNDERİSİ — operasyon sipariş detayı + durum zinciri (07.12).
 *
 * ── NEDEN BU TEST VAR ───────────────────────────────────────────────────────
 * Kargo kanalının her halkasının kendi birim/entegrasyon testi vardı ama **hiçbiri bir arada**
 * koşmuyordu: gönderi künyesinin gerçekten çizilip çizilmediğini, ve taşıyıcı konuştuğunda
 * siparişin gerçekten ilerleyip ilerlemediğini yalnız ölçüm yerine tahmin biliyorduk. Bu dosya o
 * boşluğu kapatıyor — çalışan uygulamanın üstünden, okuma katmanından ekrana kadar.
 *
 * ── ÜÇ İDDİA ───────────────────────────────────────────────────────────────
 *   1. Çok kolili gönderide **her koli kendi satırında** görünür ("Kutu 1/2", "Kutu 2/2").
 *      Kural bir kez yanlış yazıldı (tek numara varsayıldı) ve üç kutulu siparişin ikisi ekranda
 *      hiç görünmedi — o yüzden fikstür bilerek çok kolili.
 *   2. Kargo kulvarında **"Kurye" ve "Sefer" satırları ÇİZİLMEZ**. Onlar rota kulvarının; kargoda
 *      sonsuza dek "sefer bekliyor / açılmadı" yazıyorlardı ve operatöre eksik bir şey varmış gibi
 *      okutuyorlardı.
 *   3. **Taşıyıcı konuşunca sipariş ilerler.** Kargo siparişinin kuryesi yok, yani bu geçişi yazan
 *      başka hiçbir şey yok — zincir kopukken sipariş `ready`de takılı kalıyordu (ölçüldü 28.08).
 *
 * Sağlayıcı SAHTE (fikstür): ağa çıkılmaz, gerçek para harcanmaz. Sınanan uzlaştırma ve ekran.
 *
 * Gezinme sözleşmesi: `customer/storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let fixture: CargoOrder;

test.beforeAll(async () => {
  fixture = await createCargoOrder();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

test.describe('kademe 2 · kargo gönderisi (operasyon detayı + durum zinciri)', () => {
  test('çok kolili gönderi kutu başına takip numarasıyla görünür; kurye/sefer satırları çizilmez', async ({ page }) => {
    test.slow();

    await page.goto(`/operations/orders/${fixture.orderId}`, NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });

    // (1) Taşıyıcı künyesi + durum.
    await expect(page.getByText(fixture.carrierName).first()).toBeVisible({ timeout: 10_000 });

    // (2) HER KOLİ kendi satırında — sıra ve numara birlikte.
    await expect(page.getByText('Kutu 1/2')).toBeVisible();
    await expect(page.getByText('Kutu 2/2')).toBeVisible();
    for (const tracking of fixture.trackingNumbers) {
      await expect(page.getByText(tracking)).toBeVisible();
    }

    /*
      (3) ROTA satırları YOK. Olumsuz iddia bilinçli ve dar: "Kurye" bir etiket metni ve kargo
      kulvarında hiç basılmıyor. Genel bir metin araması (`sefer`) yan panellere takılabilirdi,
      o yüzden Teslimat kartının kendi etiketleri soruluyor.
    */
    await expect(page.getByText('Kurye', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Sefer', { exact: true })).toHaveCount(0);
  });

  test('taşıyıcı TESLİM dediğinde sipariş teslim edilmiş olur — kargonun kuryesi yok, bunu yazan başka şey de yok', async ({ page }) => {
    test.slow();

    /*
      İDDİA SİPARİŞİN KENDİ ROZETİNE BAKAR — ve bu bir düzeltmedir (ölçüldü 29.08).

      İlk yazımda sayfada "Teslim edildi" metni aranıyordu ve test, zincir KOPARILDIĞINDA BİLE
      geçiyordu: aynı cümle GÖNDERİNİN durumu için de basılıyor (`SHIPMENT_STATUS_LABEL.delivered`)
      ve uzlaştırma gönderiyi zaten teslim yapıyor. Yani test doğru sebepten değil, yanlış sebepten
      yeşildi — sınadığını sandığı halka hiç sınanmıyordu.

      Rozet siparişin künyesinde, referans numarasının yanında duruyor; oraya yalnız SİPARİŞİN
      durumu yazılır.
    */
    const kunye = page.getByRole('heading', { name: /^Sipariş / }).locator('..');

    await page.goto(`/operations/orders/${fixture.orderId}`, NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });
    await expect(kunye.getByText('Teslim edildi')).toHaveCount(0);

    // Taşıyıcı konuşur — uzlaştırma zinciri işler (atlanan `out_for_delivery` adımı dahil).
    await fixture.taşıyıcıSöyledi('DELIVERED');

    await page.reload(NAV);
    await expect(kunye.getByText('Teslim edildi')).toBeVisible({ timeout: 15_000 });
  });
});
