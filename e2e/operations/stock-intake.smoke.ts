import { test, expect } from '@playwright/test';
import { createStampedCatalog, receiveStampedBatch, type StampedCatalog } from '../fixtures/intake-fixture';

/**
 * KADEME 2 · PARTİ 4b — MAL KABUL (stok girişi), damgalı fikstürle (denetim, 04.08).
 *
 * Mal kabul EKRANI henüz yok (10.4 — arka uç hazır, çizim bekleniyor); giriş bu yüzden ekranın da
 * kullanacağı üretim RPC'sinden yapılır (gerekçe `e2e/fixtures/intake-fixture.ts` başında). Duman
 * iddiası tasarımın cümlesi (`design/pages/depo-stok-giris.md` §5): "girilen partiler anında
 * satılabilir stoğa yansır" — partisiz boy, girişten sonra Stok ekranında partili ve miktarlı
 * görünmeli. Ekran formu inince yazım adımı UI'a taşınır, iddialar aynı kalır.
 *
 * Gezinme sözleşmesi: `customer/storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Girilen paket adedi — iddialarda aranan miktar. */
const INTAKE_QTY = 17;

let fixture: StampedCatalog;

test.beforeAll(async () => {
  fixture = await createStampedCatalog();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

/**
 * Seviye SATIRININ "parti yok"u — düz metin değil desen, ve sebebi ölçülmüş bir düşüş (19.08).
 *
 * `getByText('parti yok')` bir ALT DİZE eşleşmesidir ve stok ekranına 11.14'te eklenen geçmiş
 * paneli (`components/operation/stock/product-history-panel.tsx`) *"henüz tükenmiş parti yok"*
 * yazıyor. Yani parti girildikten sonra satır doğru biçimde "1 parti" derken, sayım paneldeki bu
 * cümleyi de görüp 1 dönüyordu — ekran doğru, iddia geniş. Satırın kendi biçimi `"{kategori} ·
 * parti yok"` olduğu için ayırt edici işaret önündeki ayraç: panelin cümlesinde o ayraç yok.
 */
const PARTI_YOK = /· parti yok/;

test.describe('kademe 2 · mal kabul → stok seviyeleri (damgalı fikstür)', () => {
  test('stok girişi yapılan boy, seviyelerde yeni parti ve miktarıyla görünür', async ({ page }) => {
    test.slow();

    // Kategori süzgeci damgalı kategoriye: liste yalnız bizim boyu gösterir — seed'in ve öteki
    // ajanların satırları iddiaların menzilinden çıkar (süzgeç sunucuda, `toStockFilters`).
    const url = `/operations/stock?cat=${fixture.categoryId}`;

    // Giriş ÖNCESİ: boy listede ama partisi yok — geçişin sıfır noktası buradan kanıtlanır.
    await page.goto(url, NAV);
    await expect(page.getByText(fixture.productName).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(PARTI_YOK).first()).toBeVisible();

    // Giriş: tek parti, damgalı lot (RPC — gerekçe yukarıda ve fikstürde).
    await receiveStampedBatch(fixture, { qty: INTAKE_QTY });

    // Giriş SONRASI aynı adres: satır artık "1 parti" der, "parti yok" kalmaz, miktar görünür.
    // Üçü de iki forkun ORTAK paydası: masaüstü tablo satırı da mobil kart da aynı sözcükleri ve
    // kullanılabilir adedi çizer (lot numarası ortak payda DEĞİL — yalnız mobil kart açılımında).
    await page.goto(url, NAV);
    await expect(page.getByText(fixture.productName).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1 parti').first()).toBeVisible();
    await expect(page.getByText(PARTI_YOK)).toHaveCount(0);
    await expect(page.getByText(String(INTAKE_QTY), { exact: true }).first()).toBeVisible();
  });
});
