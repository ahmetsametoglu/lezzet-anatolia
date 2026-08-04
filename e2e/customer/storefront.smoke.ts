import { test, expect } from '@playwright/test';

/**
 * Gezinme sözleşmesi (04.08 ölçümü): dev server'da `load` olayı ara sıra asılı kalıyor — sayfa
 * TAM çizildiği hâlde koşudan koşuya FARKLI testler zaman aşımına düşüyordu (şeritlerin tetiklediği
 * yeniden derlemeler + önden çekmeler). Bu yüzden TÜM gezinmeler `domcontentloaded`'a bağlanır;
 * gerçek hazır-olma güvencesi zaten web-first iddialarda (`toBeVisible` bekler). Kademe 3'ün
 * build'e karşı koşusunda bu karar yeniden değerlendirilir.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * DENEME dumanı (00.9 çekirdek kurulumu — denetim). Amaç örnek olmak: senaryo tasarım/DOMAIN
 * cümlesinden, iddialar kaba yapısal (ekran açılıyor mu, çerçeve + içerik var mı) — kırılgan
 * seçici yok. Gerçek yolculuklar çapraz yazımla gelir (`e2e/README.md` kural 2); bu dosyayı
 * OPERASYON şeridi devralıp genişletir.
 */
test.describe('vitrin — müşteri ilk bakış', () => {
  test('ana sayfa Fransızca açılır ve gerçek katalog içeriği taşır', async ({ page }) => {
    const response = await page.goto('/fr', NAV);
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
    await page.goto('/fr/olmayan-bir-sayfa-xyz', NAV);
    // 404 sayfası kendi tasarımıyla çizilir (not-found.tsx): ileri bir yol her zaman sunulur.
    await expect(page.locator('main, body >> a').first()).toBeVisible();
  });
});

/**
 * KADEME 2 · PARTİ 1 — müşteri SALT-OKUR yolculukları (denetim yazdı, kullanıcı işaretiyle 04.08).
 *
 * Veri disiplini (`e2e/README` kural 3): yalnız seed'in deterministik kayıtları okunur; DB'ye satır
 * yazılmaz (ziyaretçi sepeti tarayıcıda yaşar — `writeCartAction` künyesi: "ziyaretçide yazacak yer
 * yok"). Analitik kirliliği de yok: headless UA kapının bot süzgecinde düşer (`record.ts`).
 * Seçiciler kasten kaba: rota sözlüğü (`@lezzet/i18n` PATHNAMES) + erişilebilir rol — ekran
 * yeniden tasarlandığında kırılmasınlar diye metin/DOM ayrıntısına bağlanılmadı.
 */
test.describe('kademe 2 · katalog → ürün → sepet (ziyaretçi)', () => {
  test('katalogdan seçilen ürün kendi sayfasını açar, sepete eklenir ve sepette görünür', async ({ page }) => {
    // Çok adımlı tek yolculuk + paylaşılan dev server: şeritler derleme tetiklerken istemci
    // gezinmesi RSC cevabını bekliyor ve URL o gelmeden değişmiyor (ölçüldü 04.08 — aynı tıklama
    // sakin sunucuda 1 sn, yüklüyken 60 sn+). slow() üç kat süre tanır; asılmayı yine yakalar.
    test.slow();
    await page.goto('/fr/catalogue', NAV);

    // Katalog gerçek katalogdan okur: en az bir ürün kartı bağlantısı (rota sözlüğü: /produit/).
    const productLink = page.locator('a[href*="/produit/"]').first();
    await expect(productLink).toBeVisible();
    await productLink.click();
    await page.waitForURL('**/produit/**', NAV);

    // Ürün sayfası ürünün kimliğini taşır (başlık) — adı sepet doğrulamasında kullanacağız.
    const title = page.getByRole('heading').first();
    await expect(title).toBeVisible();
    const name = ((await title.textContent()) ?? '').trim();
    expect(name.length).toBeGreaterThan(2);

    // Ana aksiyon: sepete ekle (tasarım §3 — sayfanın ana aksiyonu). FR sözlük: "ajouter/panier".
    const addToCart = page.getByRole('button', { name: /panier|ajouter/i }).first();
    await expect(addToCart).toBeEnabled();
    await addToCart.click();

    // Sepet sayfası eklenen ürünü adıyla listeler (ziyaretçi sepeti tarayıcıda kalıcı).
    await page.goto('/fr/panier', NAV);
    await expect(page.getByText(name.slice(0, 12)).first()).toBeVisible();
  });
});

test.describe('kademe 2 · dil rotaları (SEO_I18N sözleşmesi)', () => {
  test('aynı katalog üç dilde kendi URL kelimesiyle açılır', async ({ page }) => {
    // Dış URL dile göre, iç yol İngilizce (CLAUDE §2) — üç dilin kendi segment kelimesi çalışmalı.
    for (const url of ['/fr/catalogue', '/de/katalog', '/tr/katalog']) {
      const response = await page.goto(url, NAV);
      expect(response?.ok(), `${url} açılmadı`).toBeTruthy();
      await expect(page.locator('main')).toBeVisible();
      expect(await page.locator('a[href*="/produ"], a[href*="/urun/"]').count()).toBeGreaterThan(0);
    }
  });

  test('İngilizce iç yol dış URL kelimesine yönlenir (/fr/catalog → /fr/catalogue)', async ({ page }) => {
    await page.goto('/fr/catalog', NAV);
    await page.waitForURL('**/fr/catalogue', NAV);
    await expect(page.locator('main')).toBeVisible();
  });
});
