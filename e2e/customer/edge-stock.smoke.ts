import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';

/**
 * KADEME 2 · PARTİ 5 — müşteri yüzeyinde UÇ DURUMLAR: stok tükenmesi (kullanıcı isteği, 04.08).
 *
 * İki senaryo, ikisi de damgalı fikstürle (CLAUDE §4b — seed'e dokunulmaz, `product-fixture`):
 *  · Tükenen ürün sepete EKLENEMEZ: stoksuz ürünün sayfası "Épuisé" rozetini basar, ana aksiyon
 *    pasifleşir (tasarım kuralı: tükendiyse sepete ekleme yolu kapalı).
 *  · Kalem sepetteyken stok DÜŞERSE sepet engel gösterir: sepet her okumada sunucuda çözülür
 *    (`readCartAction` → `getCartView`), tükenen kalem `blocked` olur ve checkout yolu kapanır
 *    (`cartBlockReason: 'undeliverable_line'`).
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe — dev'de `load` asılı kalabiliyor.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Seed'in deterministik kapsam-içi kodu (`place-checkout.smoke.ts` ile aynı). */
const IN_ZONE_CODE = '67000';

test.describe('kademe 2 · tükenen ürün sepete eklenemez (ziyaretçi)', () => {
  let fixture: StampedProduct;

  test.beforeAll(async () => {
    // Fiyatlı ama STOKSUZ ürün: hiçbir depoda partisi yok → her yerden `out_of_stock` okunur.
    fixture = await createStampedProduct({ stockQty: 0 });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('stoksuz ürünün sayfası "tükendi" der, sepete ekleme pasifleşir', async ({ page }) => {
    test.slow();

    // Yer seçimi: kapsam-içi seed kodu — akış `place-checkout.smoke.ts` ile aynı (diyalog kapsamı,
    // sayfada iki eş girdi var). Tükendi kararı yerden bağımsız ama senaryo ziyaretçinin gerçek
    // yolculuğunu izler: önce yer, sonra ürün.
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(IN_ZONE_CODE);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(IN_ZONE_CODE) }).first().click();
    await expect(page.getByRole('button', { name: new RegExp(IN_ZONE_CODE + '|Strasbourg', 'i') }).first()).toBeVisible({ timeout: 15_000 });

    // Damgalı ürün katalog akışına sokulmaz, sayfasına DOĞRUDAN gidilir (slug fikstürden):
    // katalogda görünürlük ayrı bir sorudur, bu testin iddiası ürün sayfasının işaret dili.
    await page.goto(fixture.urlFr, NAV);
    await expect(page.getByRole('heading', { name: fixture.productName }).first()).toBeVisible({ timeout: 15_000 });

    // Tükendi işareti görünür (rozet metni `t.soldOut` — FR sözlük) …
    await expect(page.getByText(/épuisé/i).first()).toBeVisible();

    // … ana aksiyonun etiketi de aynı cümledir ve düğme PASİFTİR (purchase-panel: `sellable` düşer).
    const action = page.getByRole('button', { name: /épuisé/i }).first();
    await expect(action).toBeVisible({ timeout: 15_000 });
    await expect(action).toBeDisabled();

    // "Sepete ekle" adında AKTİF bir düğme bu sayfada yoktur — ekleme yolu tamamen kapalı.
    await expect(page.getByRole('button', { name: /ajouter au panier/i })).toHaveCount(0);
  });
});

test.describe('kademe 2 · sepetteyken stok düşen kalem sepeti engeller (ziyaretçi)', () => {
  let fixture: StampedProduct;

  test.beforeAll(async () => {
    // STOKLU ürün + damgalı bölge: ziyaretçi fikstürün kendi posta kodunu seçebilsin diye
    // yer → bölge → damgalı depo zinciri fikstürde kurulur (gerekçe `product-fixture` künyesi).
    fixture = await createStampedProduct({ stockQty: 5, withZone: true });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('kalem sepete girer; stok sıfırlanınca sepet engel basar ve checkout kapanır', async ({ page }) => {
    test.slow();

    // Yer: damgalı bölgenin kodu. Kod referans tabloda yok → öneri listesi çıkmaz; diyalogda
    // yazıp "Afficher" ile onaylanır (panelin ikinci meşru yolu — kodu ezbere bilen müşteri).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(fixture.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    // Rota cevabı: "aracımızla geliyoruz … livraison est offerte" — damgalı zincir gerçekten çözüldü.
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });

    // Ürün sepete: stok damgalı depoda ve yer o depoya çözüldüğü için aksiyon AKTİF.
    await page.goto(fixture.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: /panier|ajouter/i }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    // Tıklama TEKRARLI: düğme sunucu çiziminde de enabled durur, hidrasyon bitmeden inen tıklama
    // sessizce kaybolur (ölçüldü 04.08 — iki proje paralelken dev server ısınıyor ve pencere
    // büyüyor). Ekleme kanıtı düğmenin yerini alan adet seçicisidir (tek kontrol modeli); seçici
    // görünene dek tıklama yinelenir — göründükten sonra ikinci tıklama zaten atılmaz.
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // Kalem sepetteyken stok DÜŞER (fikstür kendi partisini sıfırlar — DB'de başka satıra dokunulmaz).
    await fixture.clearStock();

    // Sepet yeniden açılır: niyet tarayıcıda ama görünüm SUNUCUDA yeniden çözülür — kalem artık
    // engelli. Rozet "Épuisé" + sepet-üstü uyarı şeridi (`blockedNotice` — iki yüzeyde de var;
    // satır-içi "ce produit est épuisé" cümlesi yalnız masaüstü düzeninde, ona bağlanılmaz).
    await page.goto('/fr/panier', NAV);
    await expect(page.getByText(fixture.productName.slice(0, 12)).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Épuisé', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Le stock d.un produit a changé/i).first()).toBeVisible();

    // Checkout yolu KAPALI: aksiyon bağlantı değil pasif düğmedir (masaüstünde özet kartı,
    // mobilde alt çubuk — ikisi de aynı `checkoutBlockReason`'ı okur) ve engel cümlesi görünür.
    const checkout = page.getByRole('button', { name: /passer à la commande/i }).first();
    await expect(checkout).toBeVisible({ timeout: 15_000 });
    await expect(checkout).toBeDisabled();
    await expect(page.getByText(/Retirez l.article épuisé/i).first()).toBeVisible();
  });
});
