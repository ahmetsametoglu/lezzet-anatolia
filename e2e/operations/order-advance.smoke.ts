import { test, expect } from '@playwright/test';
import { createStampedOrder, type StampedOrder } from '../fixtures/order-fixture';

/**
 * KADEME 2 · PARTİ 4b — sipariş DURUM GEÇİŞİ, damgalı fikstürle (denetim, 04.08).
 *
 * 4a kuyruğun gösterdiğini sınamıştı; burası İLERLETMEYİ sınar: onaylı sipariş detaydan
 * "Hazırlanıyor"a alınır ve yeni durum ekranda görünür. Geçiş İZNİ motorun işi (`canTransition`,
 * kendi birim testlerinde); duman testinin iddiası ekranın o izni sunması ve yazımın yansıması.
 *
 * Parti (stok batch) seçimi BU geçişin parçası DEĞİL: hazırlık kaydı (FEFO/parti) ayrı bir akıştır
 * (10.2, Depo) — confirmed → preparing yalnız durum + log yazar. Fikstürün stoğu yine de hazır.
 *
 * Gezinme sözleşmesi: `customer/storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let fixture: StampedOrder;

test.beforeAll(async () => {
  fixture = await createStampedOrder();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

test.describe('kademe 2 · sipariş durum geçişi (damgalı fikstür)', () => {
  test('onaylı sipariş detaydan Hazırlanıyor durumuna ilerletilir ve yeni durum ekranda görünür', async ({ page }) => {
    test.slow();

    // Sipariş kuyrukta: geçişin öznesi operatörün listede GÖRDÜĞÜ kayıttır.
    await page.goto('/operations/orders', NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });

    // Detay doğrudan adresle (satır tıklaması önizleme diyaloğu açıyor — detay sözleşmesi URL, 4a).
    await page.goto(`/operations/orders/${fixture.orderId}`, NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });

    // Tek yol (desktop — operasyon web'i masaüstü-yalnız, 06.08): başlıktaki birincil düğme
    // ("Hazırlanıyor ▾") izinli geçiş ŞERİDİNİ açar, geçiş şeritteki düğmeden yapılır.
    await page.getByRole('button', { name: 'Hazırlanıyor ▾' }).click();
    // Şerit açıldı mı — tıklamadan önce iddia: düşerse "düğme yok" değil "şerit açılmadı" denir.
    await expect(page.getByText('İzinli geçişler')).toBeVisible({ timeout: 10_000 });
    const advance = page.getByRole('button', { name: 'Hazırlanıyor', exact: true });
    await expect(advance).toBeVisible({ timeout: 15_000 });
    await advance.click();

    // Yeni durumun kanıtı iki katlı: (1) birincil geçiş artık "Hazır ▾" — bu YALNIZ preparing
    // durumunda çizilir, eski durumun düğmesiyle karışamaz; (2) durum rozeti "Hazırlanıyor" yazar.
    await expect(page.getByRole('button', { name: 'Hazır ▾', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Hazırlanıyor', { exact: true }).first()).toBeVisible();
  });
});
