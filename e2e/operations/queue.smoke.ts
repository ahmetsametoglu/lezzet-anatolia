import { test, expect } from '@playwright/test';
import { createStampedOrder, type StampedOrder } from '../fixtures/order-fixture';

/**
 * KADEME 2 · PARTİ 4a — operasyon kuyruğu, DAMGALI fikstürle (denetim, 04.08).
 *
 * İlk yazan-taraf parti: sipariş DB fikstüründen kurulur (`e2e/fixtures/order-fixture.ts` —
 * §4b: damgalı veri + `purgeTestData`; seed siparişinin durumunu oynatmak KÜRESEL kirliliktir).
 * Bu parti kuyruğun damgalı siparişi GÖSTERDİĞİNİ ve detayın açıldığını sınar; durum GEÇİŞİ
 * (hazırlık onayı, parti seçimi) ve mal kabul 4b'nin işi — geçiş diyaloğu kendi akışıyla gelir.
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

test.describe('kademe 2 · sipariş kuyruğu (damgalı fikstür)', () => {
  test('damgalı sipariş kuyrukta görünür ve detayı müşteri+ürünle açılır', async ({ page }) => {
    test.slow();

    // Kuyruk: en yeni sipariş damgalı olandır — ilk sayfada, süzgeçsiz görünmeli.
    await page.goto('/operations/orders', NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });

    // Detay: doğrudan adresle (satır tıklaması önizleme diyaloğu açıyor — detay sözleşmesi URL).
    await page.goto(`/operations/orders/${fixture.orderId}`, NAV);
    await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(fixture.productName).first()).toBeVisible();
  });
});
