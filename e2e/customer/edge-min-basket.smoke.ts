import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';

/**
 * UÇ SENARYO HATTI · İLK PARTİ (kullanıcı onayı 08.08 — arka-uc tavsiyesi 4):
 * asgari sepetin SÖZÜ ile KURALI aynı sayı mı?
 *
 * Arka plan bir kez yaşanmış arıza sınıfı (29.07): sepet olmayan bir ayarı okuyup koddaki
 * varsayılana düşüyordu, checkout gerçek ayarı okuyordu — ikisi tesadüfen aynı değerdeyken hiçbir
 * katman görmüyordu. Birim testleri iki yüzeyi AYRI AYRI yeşil görür; sözün kurala eşliğini ancak
 * ikisini aynı ekranda karşılaştıran bu katman yakalar (`lib/settings-keys.ts` künyesi).
 *
 * İddianın iki yüzü tek koşuda sınanır: eşik ALTINDA cümle + kapalı kapı; cümlenin istediği tutar
 * eklenince İKİSİ BİRDEN kalkar. Cümle "0,10 € ekleyin" deyip eklendiğinde kapı açılmıyorsa söz
 * ile kural ayrışmıştır — tam da 29.07'nin arızası.
 *
 * Eşik damgalı bölgenin KENDİ ayar satırından gelir (fikstür `minBasketCents`) — küresel satıra
 * dokunulmaz (e2e README kural 3). Not: yerelde küresel değer bugün 0 (`0013_settings.sql` seed'i),
 * yani b2c'de kural fiilen kapalı; o çelişki ayrı bir bulgu olarak raporlandı (08.08).
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe (dev'de `load` asılı kalabiliyor).
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * Eşik, tek adet fiyatın (12,90 € — fikstür sabiti) 10 cent üstü: 1 adet sepet "0,10 € ekleyin"
 * der, 2. adet eşiği aşar. Fark BİLEREK bir cümlede telaffuz edilecek kadar küçük — sözün tutarı
 * ekranda birebir aranır.
 */
const MIN_BASKET_CENTS = 1300;

test.describe('uç senaryo · asgari sepetin sözü ile kuralı aynı sayı', () => {
  let fixture: StampedProduct;

  test.beforeAll(async () => {
    fixture = await createStampedProduct({ stockQty: 5, withZone: true, minBasketCents: MIN_BASKET_CENTS });
  });

  test.afterAll(async () => {
    await fixture.cleanup();
  });

  test('eşik altında sepet farkı söyler ve kapı kapanır; söylenen tutar eklenince ikisi birden açılır', async ({ page }) => {
    test.slow();

    // Yer: damgalı bölgenin kodu ("Afficher" yolu — `edge-stock.smoke.ts` deseni).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(fixture.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });

    // Ürün sepete: 1 adet = eşikten 10 cent aşağı. Tıklama TEKRARLI (hidrasyon yarışı —
    // edge-stock gerekçesi); ekleme kanıtı düğmenin yerini alan adet seçicisi.
    await page.goto(fixture.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: /panier|ajouter/i }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // SÖZ: "Commande minimum 13,00 € — ajoutez encore 0,10 €." (bal kutusu — bilgi, hata değil).
    // İddia YENİLEMELİ: dev server'ın ayar önbelleği 30 sn'lik sözleşme (`SETTINGS_CACHE_TTL_MS`),
    // fikstürün az önce açtığı bölge satırını sunucu en geç o sürede görür — ilk kare kanıt
    // değildir (bulgu-doğrulama dersi, 07.08).
    await expect(async () => {
      await page.goto('/fr/panier', NAV);
      await expect(page.getByText(/ajoutez encore 0,10/i).first()).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 45_000 });
    await expect(page.getByText(/commande minimum 13,00/i).first()).toBeVisible();

    // KURAL: checkout kapısı kapalı — aksiyon bağlantı değil PASİF düğmedir (masaüstünde özet
    // kartı, mobil webde alt çubuk; ikisi de aynı `checkoutBlockReason`ı okur).
    const blockedAction = page.getByRole('button', { name: /passer à la commande/i }).first();
    await expect(blockedAction).toBeVisible({ timeout: 15_000 });
    await expect(blockedAction).toBeDisabled();
    await expect(page.getByRole('link', { name: /passer à la commande/i })).toHaveCount(0);

    // Cümlenin istediği tutar eklenir: sepet satırının "+" seçicisi (25,80 € ≥ 13,00 €)…
    await page.getByRole('button', { name: '+' }).first().click();

    // …ve İKİSİ BİRDEN açılır: cümle kalkar, aksiyon bağlantıya döner. Söz ile kural aynı satırı
    // okuyorsa başka sonuç mümkün değil; ayrışırlarsa iki iddiadan biri düşer ve fark bir müşteri
    // şikâyetinden önce burada görünür.
    await expect(page.getByText(/ajoutez encore/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('link', { name: /passer à la commande/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /passer à la commande/i })).toHaveCount(0);
  });
});
