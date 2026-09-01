import { test, expect } from '@playwright/test';
import { createSequencedRun, type RouteRun } from '../fixtures/route-fixture';

/**
 * KADEME 2 · DURAK SIRASI — motorun dizdiği tur sevkiyat masasında görünüyor mu (11.9).
 *
 * ── NE SINANIYOR, NE SINANMIYOR ─────────────────────────────────────────────
 * Sıranın DOĞRULUĞU burada sınanmıyor: onun yeri motorun 25 birim testi ve `stop-order.test.ts`in
 * 16 entegrasyon testi. Buradaki soru zincirin bütünlüğü — veritabanındaki `stop_order` dizisi,
 * sunucu okuması, sözleşme, katlanır harita ve künye şeridi arasında bir kopukluk var mı.
 *
 * Bu zincir başka hiçbir katmanda ölçülemiyor: web'de render eden test altyapısı yok (jsdom da
 * testing-library da bilinçli olarak kurulu değil, `vitest.config` künyesi), yani `RouteMap`in
 * gerçekten çizildiğini yalnız gerçek bir tarayıcı söyleyebilir.
 *
 * ── VE BİR İDDİA DAHA: EKRANDAKİ SIRA OKUMA SIRASI DEĞİL ────────────────────
 * Fikstür durakları ÇAPRAZ yazıyor (batı-doğu-batı-doğu). Ekran `createdAt` sırasını gösterseydi
 * numaralar da o sırayı izlerdi. Depoya en yakın iki durağın turun İKİ UCUNDA olması, hesabın
 * gerçekten yapıldığının ve ekrana ulaştığının kanıtı.
 *
 * Gezinme sözleşmesi: `customer/storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let fixture: RouteRun;

test.beforeAll(async () => {
  fixture = await createSequencedRun();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

test.describe('kademe 2 · sevkiyat masasında tur önizlemesi', () => {
  test('sıralanmış seferin haritası açılır, künyesi ölçüyü söyler ve duraklar numaralıdır', async ({ page }) => {
    test.slow();

    await page.goto('/operations/deliveries?view=dispatch', NAV);

    // Sefer şeridi: fikstürün rotası ve sefer kodu gerçekten listede mi.
    await expect(page.getByText(fixture.zoneName).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(fixture.referenceNo).first()).toBeVisible();

    /* Harita KATLANIR ve kapalı doğar: şerit bir durum satırıdır, harita incelenen bir şey. Kanca
       sefer kimliğiyle — şeritte başka seferler de var ve metinle seçmek ilk eşleşene basardı. */
    const details = page.getByTestId(`run-map-${fixture.runId}`);
    await expect(details).toBeVisible();
    await details.getByText('Turu haritada gör').click();

    /* KÜNYE ŞERİDİ — bu tek cümle olmadan kuş uçuşuyla dizilmiş bir sıra ile yol süresiyle
       dizilmiş olan ekranda AYNI görünür. Fikstürün her durağının kendi koordinatı var, o yüzden
       incelik "kapı düzeyinde". */
    await expect(details.getByText('Sıra kuş uçuşu ölçüsüyle, kapı düzeyinde.')).toBeVisible({ timeout: 20_000 });

    /* İşaretçiler: sekiz durak + depo. Leaflet `divIcon` kullanıyor, yani numara DOM'da metin
       olarak duruyor — karo sunucusu erişilemese bile işaretçiler çizilir (iddia karoya bağlı
       değil ve olmamalı: dış bir servisin düşmesi bu testi kızartmamalı). */
    const markers = details.locator('.leaflet-marker-icon');
    await expect(markers).toHaveCount(9, { timeout: 20_000 });

    // Numaralar 1..8 — hiçbiri eksik, hiçbiri tekrar. Sunucu sıra yazmasaydı hepsi nokta olurdu.
    const numaralar = (await markers.allTextContents()).filter((text) => /^[0-9]+$/.test(text)).sort((a, b) => +a - +b);
    expect(numaralar).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  test('depoya en yakın duraklardan biri EN SON teslim ediliyor — U senaryosu ekranda', async ({ page }) => {
    test.slow();

    await page.goto('/operations/deliveries?view=dispatch', NAV);
    const details = page.getByTestId(`run-map-${fixture.runId}`);
    await expect(details).toBeVisible({ timeout: 20_000 });
    await details.getByText('Turu haritada gör').click();
    await expect(details.locator('.leaflet-marker-icon')).toHaveCount(9, { timeout: 20_000 });

    /*
      Kullanıcının senaryosu: *"bir hatta gidersin, paralel yoldan dönersin; depona en yakınlardan
      birini EN SON teslim edersin ve en mantıklı rota budur."*

      İşaretçinin ipucu kartı `${sıra}. ${adres}` taşıyor ve yalnız üzerine gelince çiziliyor —
      son durağın kim olduğunu ekrandan okumanın tek yolu bu. İki güney durağından biri "8."
      olmalı; ortada bir yerde çıkıyorsa tur kendini kesiyor demektir.
      Numara `8` OLAN işaretçi aranıyor, sekizinci DOM düğümü değil: DOM sırası ekleme sırasıdır.
    */
    await details.locator('.leaflet-marker-icon').filter({ hasText: /^8$/ }).hover();

    const tooltip = details.locator('.leaflet-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 10_000 });
    await expect(tooltip).toHaveText(new RegExp(`^8\\. (${fixture.guneyLabels.map(escapeRe).join('|')})`));
  });
});

/** Fikstür adresleri damga taşıyor; düzenli ifadeye girmeden önce kaçırılmalı. */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
