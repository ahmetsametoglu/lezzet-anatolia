import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';
import { ANA_SEPETE_EKLE } from '../fixtures/selectors';

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
 * dokunulmaz (e2e README kural 3).
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe (dev'de `load` asılı kalabiliyor).
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/**
 * ── SAYILAR 13 €'DAN 45 €'YA ÇIKTI, KURGU AYNI (10.08 kural değişimi · düzeltildi 15.08) ──
 *
 * Bu dosyanın künyesi bir tur *"yerelde küresel değer bugün 0, yani b2c'de kural fiilen kapalı"*
 * diyordu ve o cümle 10.08'de bayatladı: kullanıcı kararıyla kapıya teslime **40 € lojistik taban**
 * geldi ve taban küresel satıra yazıldı. `min_basket_cents` **STRICTEST_WINS** üyesi — eşleşen
 * kapsamların EN YÜKSEĞİ uygulanır — yani `max(bölge 1300, küresel 4000) = 4000`. Fikstürün bölgeye
 * yazdığı 13,00 € eziliyordu; ekran "40,00 €" derken test "13,00" arıyordu ve üç iddia birden
 * düşüyordu.
 *
 * Dar kapsam eşiği **yükseltebilir, düşüremez** (`SettingsService` künyesinin kendi cümlesi), yani
 * tek yol tutarları tabanın üstüne taşımaktı. Fiyat artık fikstür parametresi: **44,90 €** ürün,
 * **45,00 €** eşik — "1 adet = eşikten 10 cent aşağı, 2. adet aşar" kurgusu birebir korunuyor ve
 * fark hâlâ bir cümlede telaffuz edilecek kadar küçük. İddianın kendisi (sözün tutarı ile kuralın
 * tutarı aynı sayı mı) hiç değişmedi.
 */
const PRICE_CENTS = 4490;
const MIN_BASKET_CENTS = 4500;

test.describe('uç senaryo · asgari sepetin sözü ile kuralı aynı sayı', () => {
  let fixture: StampedProduct;

  test.beforeAll(async () => {
    fixture = await createStampedProduct({
      stockQty: 5,
      withZone: true,
      minBasketCents: MIN_BASKET_CENTS,
      priceCents: PRICE_CENTS,
    });
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
    const addToCart = page.getByRole('button', { name: ANA_SEPETE_EKLE }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // SÖZ: "Commande minimum 45,00 € — ajoutez encore 0,10 € au sous-total." (bal kutusu — bilgi,
    // hata değil). Cümlenin sonundaki "au sous-total" 15.08'de eklendi: eksik İNDİRİMSİZ ara
    // toplamdan hesaplanıyor ve cümle bunu söylemiyordu (mobil şeridin cihaz ölçümü). İddia
    // parçalı arıyor, yani ek eklendi diye kırılmadı — ama okuyan ajanın gördüğü metin bu.
    // İddia YENİLEMELİ: dev server'ın ayar önbelleği 30 sn'lik sözleşme (`SETTINGS_CACHE_TTL_MS`),
    // fikstürün az önce açtığı bölge satırını sunucu en geç o sürede görür — ilk kare kanıt
    // değildir (bulgu-doğrulama dersi, 07.08).
    await expect(async () => {
      await page.goto('/fr/panier', NAV);
      await expect(page.getByText(/ajoutez encore 0,10/i).first()).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 45_000 });
    await expect(page.getByText(/commande minimum 45,00/i).first()).toBeVisible();

    // KURAL: checkout kapısı kapalı — aksiyon bağlantı değil PASİF düğmedir (masaüstünde özet
    // kartı, mobil webde alt çubuk; ikisi de aynı `checkoutBlockReason`ı okur).
    const blockedAction = page.getByRole('button', { name: /passer à la commande/i }).first();
    await expect(blockedAction).toBeVisible({ timeout: 15_000 });
    await expect(blockedAction).toBeDisabled();
    await expect(page.getByRole('link', { name: /passer à la commande/i })).toHaveCount(0);

    // Cümlenin istediği tutar eklenir: sepet satırının "+" seçicisi (89,80 € ≥ 45,00 €)…
    await page.getByRole('button', { name: '+' }).first().click();

    // …ve İKİSİ BİRDEN açılır: cümle kalkar, aksiyon bağlantıya döner. Söz ile kural aynı satırı
    // okuyorsa başka sonuç mümkün değil; ayrışırlarsa iki iddiadan biri düşer ve fark bir müşteri
    // şikâyetinden önce burada görünür.
    await expect(page.getByText(/ajoutez encore/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('link', { name: /passer à la commande/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /passer à la commande/i })).toHaveCount(0);
  });
});
