import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';
import { createGuestOtp, OTP_TEST_CODE, type GuestOtpFixture } from '../fixtures/otp-fixture';
import { ANA_SEPETE_EKLE } from '../fixtures/selectors';

/**
 * KADEME 2 · CHECKOUT ADIM DUMANLARI — adres → gün → ödeme → sipariş (denetim, 08.08).
 *
 * OTP dumanı (3b) kimlik SINIRINDA durmuştu; burası sınırın ötesini tek yolculukta yürür ve
 * huninin sonunda GERÇEK bir sipariş açar (kapıda ödeme — Stripe'sız tek yol). Onaylı uç
 * senaryoların (bayat sekme · OTP beklerken tükenme · adres değişimi) ön şartı bu duman:
 * adımların mutlu yolu yeşil olmadan uç hâllerini yazmak, düşüşü senaryoya değil zemine borçlu
 * bırakırdı (kör yazılmaz — 00.9).
 *
 * §4b: her satır damgalı (ürün + bölge + misafir + adres), sipariş `purgeTestData`nın YENİ
 * `orderIds` hedefiyle toplanır (rezervasyonun `order_id` bağı FK'sız — cascade toplamaz).
 * Ön koşul: dev server `.env`'inde `OTP_TEST_CODE=123456` (3b ile aynı kapı).
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let product: StampedProduct;
let guest: GuestOtpFixture;

/**
 * Fiyat KÜRESEL ASGARİ SEPETİN ÜSTÜNDE (19.08, ölçülmüş düşüş).
 *
 * Kapıya teslimin lojistik tabanı 10.08'de **40,00 €** oldu ve küresel satıra yazıldı; fikstürün
 * varsayılan fiyatı ise 12,90 €. Tek kalemlik sepet tabanın altında kalınca *"Confirmer la
 * commande"* HAKLI OLARAK kilitleniyordu — ekran sebebini de yazıyordu: *"Minimum de commande
 * pour … : 40,00 € — ajoutez encore 27,10 € au sous-total."* Yani arıza üründe ya da akışta
 * değil, senaryonun eskimiş varsayımındaydı.
 *
 * Eşiği bölgeye YAZIP DÜŞÜREMEYİZ: `min_basket_cents` **STRICTEST_WINS** üyesi, dar kapsam tabanı
 * yükseltebilir ama düşüremez (`SettingsService` künyesi). Fikstür bu yüzden `priceCents`
 * parametresini taşıyor ve künyesinde tek yolu yazıyor — tutarı tabanın üstüne taşımak.
 * Kardeş senaryo `edge-min-basket` aynı çözümü kullanıyor.
 *
 * 45,00 € seçildi: tabanı tek kalemle rahatça aşar, taban bir gün 40'ın biraz üstüne çıkarsa da
 * pay bırakır. Bu duman TUTAR sınamıyor (hiçbir iddiası € içermiyor) — sayı yalnız kapıyı açmak
 * için var, akışın kendisi değişmiyor.
 */
const PRICE_CENTS = 4500;

test.beforeAll(async () => {
  // Stok bolluğu bilinçli: bu duman tükenme hâlini SINAMAZ (o edge-stock'un işi), akışı sınar.
  product = await createStampedProduct({ stockQty: 5, withZone: true, priceCents: PRICE_CENTS });
  guest = createGuestOtp();
});

test.afterAll(async () => {
  // Sipariş PROFİLDEN ÖNCE: `order.customer_id` restrict — sipariş dururken profil silinemez.
  // Kimlik zinciri e-postadan: auth → profil `auth_user_id` İLE (04.11 dersi: auth id ≠ profil id;
  // ilk sürüm `customer_id = auth.id` arıyordu ve siparişi HİÇ bulamıyordu — ölçüldü 08.08,
  // teardown ürün silmede FK'ye çarpınca çıktı) → siparişler profil kimliğiyle.
  const { serviceDb } = await import('@lezzet/database');
  const { purgeTestData } = await import('@lezzet/database/testing');
  const db = serviceDb();
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  const authUser = data?.users.find((u) => u.email === guest.email);
  if (authUser) {
    const { data: profile } = await db.from('user_profiles').select('id').eq('auth_user_id', authUser.id).maybeSingle();
    if (profile) {
      const { data: orders } = await db.from('order').select('id').eq('customer_id', profile.id);
      const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
      if (orderIds.length > 0) await purgeTestData(db, { orderIds });
    }
  }
  await guest?.cleanup();
  await product?.cleanup();
});

test.describe('kademe 2 · checkout adımları: adres → gün → kapıda ödeme → sipariş', () => {
  test('misafir üç adımı yürür ve sipariş onay sayfasını görür', async ({ page }) => {
    test.slow();

    // ── Yer: damgalı bölge kodu ("Afficher" yolu — kod referans tabloda yok, öneri çıkmaz).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(product.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });

    // ── Ürün sepete (tekrarlı tıklama — hidrasyon yarışı, edge-stock deseni).
    await page.goto(product.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: ANA_SEPETE_EKLE }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // ── Kimlik: misafir OTP (3b dumanının deseni — orada gerekçeli, burada tekrarlanmaz).
    await page.goto('/fr/commande', NAV);
    const emailBox = page.getByRole('textbox', { name: /e-mail|adresse e-mail/i }).first();
    await expect(emailBox).toBeVisible({ timeout: 15_000 });
    const sendCode = page.getByRole('button', { name: /envoyer le code/i }).first();
    await expect(async () => {
      await emailBox.fill(guest.email);
      await expect(sendCode).toBeEnabled({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });
    await sendCode.click();
    const firstDigit = page.locator('main input[inputmode="numeric"]').first();
    await expect(firstDigit).toBeVisible({ timeout: 20_000 });
    await firstDigit.click();
    await page.keyboard.type(OTP_TEST_CODE, { delay: 40 });
    const confirm = page.getByRole('button', { name: /vérif|valid|confirm/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByText(/S'ouvre après la vérification/)).not.toHaveCount(3, { timeout: 25_000 });

    // ── ADIM 1 · Adres: yeni misafirde kayıt yok — form açılır, damgalı adres yazılır.
    await page.getByRole('button', { name: /nouvelle adresse/i }).click();
    await page.getByLabel(/titre de l/i).fill(`E2E adresi ${product.stamp}`);
    await page.getByLabel(/nom du destinataire/i).fill('E2E Musteri');
    await page.getByLabel(/rue et numéro/i).fill('1 rue du Test');
    // Posta kodu FİKSTÜRÜN kodu: adres rota bölgesinde kalmalı ki teslimat "rota" çözülsün ve
    // kapıda ödeme açık olsun (kargo adresinde COD blokludur — codBlocked.shipping).
    await page.getByLabel(/code postal/i).fill(product.postalCode!);
    await page.getByLabel(/ville/i).fill('Testville');
    // Telefon damgadan: sabit numara paralel koşuda çakışır (kurye fikstüründe yaşandı, 08.08).
    await page.getByLabel(/téléphone/i).fill(`06${String(product.stamp).slice(-8)}`);
    const saveAddress = page.getByRole('button', { name: /enregistrer l.adresse/i });
    await expect(saveAddress).toBeEnabled();
    await saveAddress.click();

    // Kayıt kartlaşır ve OTOMATİK seçilir (checkout-client: yeni eklenen adres seçime geçer).
    const addressCard = page.getByRole('button', { name: new RegExp(`E2E adresi ${product.stamp}`) });
    await expect(addressCard).toBeVisible({ timeout: 20_000 });
    await expect(addressCard).toHaveAttribute('aria-pressed', 'true');

    // ── ADIM 2 · Gün: adres bölge İÇİNDE — rozet rota teslimatını söyler.
    const daySection = page.locator('section').filter({ hasText: 'Jour de livraison' });
    await expect(daySection.getByText(/livraison à domicile/i).first()).toBeVisible({ timeout: 20_000 });
    // Gün ya SEÇTİRİLİR (birden çok tarih — kart) ya GÖSTERİLİR (tek tarih — cümle, sahte seçim
    // sunulmaz). Fikstür bölgesi iki gün taşır (weekdays [2,5]) ama takvim penceresi tek güne
    // düşürebilir; iki hâl de meşru, ikisi de doğrulanır.
    const dayCards = daySection.locator('button[aria-pressed]');
    if (await dayCards.count()) {
      await dayCards.first().click();
      await expect(dayCards.first()).toHaveAttribute('aria-pressed', 'true');
    } else {
      await expect(daySection.getByText(/chez vous le/i)).toBeVisible();
    }

    // ── ADIM 3 · Ödeme: kapıda ödeme (Stripe'sız tek yol — kart alanı bu seçimde hiç yüklenmez).
    const cod = page.getByRole('button', { name: /payer à la livraison/i });
    await cod.click();
    await expect(cod).toHaveAttribute('aria-pressed', 'true');

    // ── Onay: düğme açık olmalı (engel cümlesi yok) — sipariş yazılır, onay sayfası açılır.
    const submit = page.getByRole('button', { name: /confirmer la commande/i });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    // Tek tıklama yeter: yazım sürerken düğme `busy` kilitlenir; ikinci tıklama çift sipariş
    // riskine girer (idempotencyKey korur ama dumanın işi onu kurcalamak değil).
    // `waitUntil` GEZİNME SÖZLEŞMESİNDEN (`domcontentloaded`): varsayılan `load` dev'de asılı
    // kalıyor — ölçüldü 08.08: sipariş 18:12:08'de confirmed YAZILMIŞTI, test yönlendirmeyi
    // "load" beklerken 45 sn'de düştü. Adres eylemi de soğuk pencerede 20 sn'yi aşabiliyor.
    await page.waitForURL(/\/commande\/[^/]+/, { timeout: 45_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/votre commande est confirmée/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/n° de commande/i).first()).toBeVisible();
  });
});
