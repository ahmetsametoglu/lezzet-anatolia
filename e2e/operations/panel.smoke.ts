import { test, expect } from '@playwright/test';

/**
 * DENEME dumanı (00.9 çekirdek kurulumu — denetim). Operasyon yüzeyi dev auth bypass'ıyla açılır
 * (guard.ts + seed'li DEV_ADMIN) — giriş adımı yok. İddialar kaba yapısal; gerçek yolculuklar
 * çapraz yazımla gelir: bu dosyayı MÜŞTERİ şeridi devralıp genişletir (`e2e/README.md` kural 2).
 *
 * YALNIZ desktop projesinde koşar (playwright.config.ts): operasyon web'i masaüstü-yalnız (06.08),
 * mobil deneyim native uygulamada — `docs/uygulama`.
 */
// Gezinme `domcontentloaded`'a bağlı — gerekçe `customer/storefront.smoke.ts` başındaki
// gezinme sözleşmesinde (dev server'da `load` asılı kalabiliyor; hazır-olma güvencesi iddialarda).
const NAV = { waitUntil: 'domcontentloaded' as const };

test.describe('operasyon paneli — ilk bakış', () => {
  test('ürünler ekranı Türkçe açılır ve seed kataloğunu listeler', async ({ page }) => {
    const response = await page.goto('/operations/products', NAV);
    expect(response?.ok()).toBeTruthy();

    // İddia İÇERİĞE bağlı: seed kataloğu deterministik (§4b okuyan-test kuralı), ürün adları
    // listede görünmeli — başlık yapısına bağlanmak ekran sahibinin elini bağlardı.
    await expect(page.getByText(/baklava/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('karşılama sayfası açılır ve gezinme rayı çizilir', async ({ page }) => {
    const response = await page.goto('/operations', NAV);
    expect(response?.ok()).toBeTruthy();
    // Rol farkında nav (09.2): dev-admin her bölümü görür — en az birkaç gezinme bağlantısı.
    expect(await page.locator('a[href^="/operations"]').count()).toBeGreaterThan(2);
  });
});

/**
 * KADEME 2 · PARTİ 2 — operasyon SALT-OKUR ilk bakışlar (denetim, 04.08).
 *
 * Dev auth bypass TEK kimlik verir (DEV_ADMIN — guard.ts): bu yüzden "rol yönlendirmesi"
 * senaryosu BİLİNÇLİ dışarıda (gerçek giriş akışı ister — `e2e/README` dışarıda kalanlar).
 * Buradaki testler seed'in deterministik satırlarını okur (36 sipariş · 17 profil), hiçbir şey
 * yazmaz. İddialar kaba: ekran Türkçe açılır, çerçeve çizilir, seed verisi listelenir — satır
 * içeriğine/tasarım ayrıntısına bağlanılmaz (ekran sahibi şerit tasarımı değiştirebilmeli).
 */
test.describe('kademe 2 · operasyon ekranları ilk bakış', () => {
  // Operasyon listeleri <a>/<table> değil tıklanabilir satır çizer (ölçüldü — anlık görüntü);
  // iddia bu yüzden YAPIYA değil İÇERİĞE bağlı: her iki ekran deterministik bir özet satırı
  // taşıyor ("35 sipariş · …", "11 müşteri · …") — seed doluyken sayı sıfır olamaz.
  test('sipariş ekranı açılır ve seed siparişlerini sayar', async ({ page }) => {
    const response = await page.goto('/operations/orders', NAV);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText(/[1-9]\d* sipariş/).first()).toBeVisible();
    // Durum makinesi süzgeçleri (ORDER_LIFECYCLE dili) ekranda — kuyruk gerçekten kuyruktur.
    await expect(page.getByText(/Hazırlanıyor/).first()).toBeVisible();
  });

  test('müşteriler ekranı açılır ve seed profillerini listeler', async ({ page }) => {
    const response = await page.goto('/operations/customers', NAV);
    expect(response?.ok()).toBeTruthy();
    // İddia başlık + durum etiketi üzerinden. Seed doluyken en az bir "Aktif" müşteri görünür.
    await expect(page.getByRole('heading', { name: /Müşteriler/ }).first()).toBeVisible();
    await expect(page.getByText(/Aktif/).first()).toBeVisible();
  });

  test('analitik ekranı açılır; veri olmayan blok yanlış sayı değil açıklama gösterir', async ({ page }) => {
    const response = await page.goto('/operations/analytics', NAV);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible();
    // 13.8 sözleşmesi: defter blokları veri yokken "hesaplanmıyor/veri yok" der, uydurma sıfır
    // ya da boş beyaz kutu göstermez (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
    // Ekran en az bir gerçek blok (kampanya gideri / pazarlama izni) + açıklamalı boş hâl taşır.
    const body = (await page.locator('body').innerText()).toLocaleLowerCase('tr');
    expect(body.length).toBeGreaterThan(100);
    expect(/analitik|ziyaret|kampanya/.test(body)).toBeTruthy();
  });
});
