import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';

/**
 * SOHBETTEN SEPET — bağlantı siteye taşıyor (15.21 · 15.22).
 *
 * ── SENARYO (CHANNELS §3b, kullanıcı kararı 07.09) ──────────────────────────
 * *"Hangi mesajlaşma platformunda olursa olsun en sonunda sepete yönlendirilir. Sepet onaylanır,
 * sonra ödeme ekranına geçilir."* Ajan Messenger'da sepeti kurar ve bağlantıyı gönderir; müşteri
 * bağlantıyı açar → giriş → sepet DOLU görünür, sohbet hesabına bağlanmıştır.
 *
 * ── NEDEN E2E ───────────────────────────────────────────────────────────────
 * Zincirin her halkası ayrı ayrı testli: sepet servisi, bağlantı kapısı, ajan araçları (entegrasyon).
 * Ama **çerez kapısının, giriş yönlendirmesinin ve sepet sayfasının birlikte çalıştığını** hiçbiri
 * ölçmüyor: `/cart-link` çerezi yazar, giriş `invite-handoff`ta tüketir, sayfa sunucu sepetini
 * çizer — üçü üç ayrı süreçte. Biri kırılsa öteki ikisi yeşil kalırdı.
 *
 * ── ŞERİT YAZDI (kullanıcı talimatı 07.09) ─────────────────────────────────
 * `e2e/README` kural 2 senaryoyu denetime bırakır; kullanıcı bu konu için şeride açıkça "e2e'sini
 * yaz" dedi. Senaryo yine itiraza açıktır — yanlış/eksik görülen `docs/talep`e düşer.
 *
 * ── GİRİŞ: HIZLI GİRİŞ KAPISI ───────────────────────────────────────────────
 * OTP kodu 3001'de bilerek kapalı (README); `auth/dev-login` GERÇEK bir oturum kurar ve 07.09'dan
 * beri öteki iki giriş yolunun geçtiği devir kapısından geçer — yani bağlantı çerezi orada tüketilir.
 * **Auth kullanıcısı ÖNCEDEN açılır** (admin API, e-posta doğrulanmış): hızlı giriş var olmayan
 * e-postada oturum açamıyor — ölçüldü 07.09 3001'de, *"Email link is invalid or has expired"*;
 * magic-link jetonu yeni doğan kullanıcıda tutmuyor, var olanda tutuyor (operasyon setup'ının yolu).
 * Profili 0002 tetikleyicisi açar; teardown `otp-fixture` deseniyle auth kullanıcısını ve profili toplar.
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let product: StampedProduct;
let conversationId = '';
let linkPath = '';
const email = `e2e-sepet-${Date.now()}@ornek.fr`;

test.beforeAll(async () => {
  product = await createStampedProduct({ stockQty: 5, withZone: true });

  const { CartService, ConversationService, serviceDb } = await import('@lezzet/database');
  const { startCartLink } = await import('@lezzet/application/cart/link');
  const db = serviceDb();

  // Bağlantıyı açacak kişi — auth kullanıcısı önceden, doğrulanmış (dosya başındaki künye).
  const { error } = await db.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw new Error(`fikstür: auth kullanıcısı açılamadı — ${error.message}`);

  // Ajanın Messenger'da kurduğu sepet: kimliksiz sohbet + sohbet sepeti (0055).
  const conversation = await new ConversationService(db).open({ source: 'messenger', externalRef: `psid-e2e-${product.stamp}` });
  conversationId = conversation.id;
  await new CartService(db).addItemsFor({ conversationId }, [{ variantId: product.variantId, qty: 2, unitPrice: 12.9 }]);

  const link = await startCartLink(db, { conversationId });
  if (link.status !== 'ok') throw new Error(`fikstür: bağlantı üretilemedi (${link.status})`);
  // Bağlantı `NEXT_PUBLIC_SITE_URL` ile kurulur; koşu hedefi (`E2E_BASE`) başka olabilir — yol + sorgu
  // alınır, köken Playwright'ın `baseURL`unden gelir.
  const url = new URL(link.url);
  linkPath = `${url.pathname}${url.search}`;
});

test.afterAll(async () => {
  const { serviceDb } = await import('@lezzet/database');
  const { purgeTestData } = await import('@lezzet/database/testing');
  const db = serviceDb();

  // Auth kimliği E-POSTAYLA, profil `auth_user_id` ile ve auth silinmeden ÖNCE (otp-fixture dersi).
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  const authUser = data?.users.find((u) => u.email === email);
  const { data: profile } = await db
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', authUser?.id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  // Sohbet önce (bağlantı ve sohbet sepeti cascade), sonra profil (müşteri sepeti cascade).
  await purgeTestData(db, { conversationIds: conversationId ? [conversationId] : [], profileIds: profile ? [profile.id] : [] });
  if (authUser) {
    const { error } = await db.auth.admin.deleteUser(authUser.id);
    if (error && !/not.*found/i.test(error.message)) throw new Error(`auth kullanıcısı silinemedi — ${error.message}`);
  }
  await product?.cleanup();
});

test.describe('sohbetten sepet — bağlantı siteye taşıyor', () => {
  test('bağlantı girişe götürür, giriş sonrası sepet DOLU gelir ve sohbet hesaba bağlanır', async ({ page }) => {
    test.slow();

    // 1. Bağlantı açılır: oturum yok → giriş sayfası, sebep cümlesi "sohbette hazırlanan sepet".
    await page.goto(linkPath, NAV);
    await expect(page).toHaveURL(/\/fr\/connexion\?/);
    await expect(page.getByText(/panier préparé dans la conversation/i)).toBeVisible();

    // 2. Giriş (hızlı kapı, gerçek oturum) → devir kapısı çerezi tüketir → sepet sayfası.
    await page.goto(`/auth/dev-login?email=${encodeURIComponent(email)}&next=${encodeURIComponent('/fr/panier')}`, NAV);
    await expect(page).toHaveURL(/\/fr\/panier$/);

    // 3. Sohbette kurulan kalem sepette, adediyle.
    await expect(page.getByText(product.productName).first()).toBeVisible();

    // 4. Kimlik köprüsü: sohbet artık bu hesabın, kanıt `cart_link`.
    const { serviceDb, ConversationService, CartService, UserProfileService } = await import('@lezzet/database');
    const db = serviceDb();
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    const authUser = data?.users.find((u) => u.email === email);
    const profile = authUser ? await new UserProfileService(db).findByAuthUserId(authUser.id) : null;
    expect(profile).not.toBeNull();
    const conversation = await new ConversationService(db).getById(conversationId);
    expect(conversation).toMatchObject({ customerId: profile!.id, linkProof: 'cart_link' });
    expect((await new CartService(db).get(profile!.id)).items).toMatchObject([{ variantId: product.variantId, qty: 2 }]);
  });

  test('aynı bağlantı ikinci kez açılınca sepet İKİ KEZ taşınmaz — jeton tek kullanımlık', async ({ page }) => {
    // Oturum bu bağlamda taze (Playwright her teste yeni bağlam açar): bağlantı yine girişe götürür,
    // giriş sonrası sepet aynı adetle durur; ikinci tüketim `invalid` görür ve sessizce geçer.
    await page.goto(linkPath, NAV);
    await page.goto(`/auth/dev-login?email=${encodeURIComponent(email)}&next=${encodeURIComponent('/fr/panier')}`, NAV);
    await expect(page).toHaveURL(/\/fr\/panier$/);

    const { serviceDb, CartService, UserProfileService } = await import('@lezzet/database');
    const db = serviceDb();
    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    const authUser = data?.users.find((u) => u.email === email);
    const profile = authUser ? await new UserProfileService(db).findByAuthUserId(authUser.id) : null;
    expect((await new CartService(db).get(profile!.id)).items).toMatchObject([{ qty: 2 }]);
  });
});
