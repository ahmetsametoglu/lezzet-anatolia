import { describe, expect, it } from 'vitest';
import { app } from '../../app';

/**
 * `/api/v1` — **AÇIK/KORUMALI SINIRININ KENDİSİ.**
 *
 * ── NEDEN BU, TÜM UÇ TESTLERİNDEN ÖNCE GELİR ────────────────────────────────
 * Router "varsayılan kapalı" kuruluyor: `v1.use('*', bearerAuth)` satırından ÖNCE bağlanan her uç
 * herkese açık, sonrakiler korumalı. **Sıra bir stil tercihi değil, güvenlik kararının kendisi** —
 * ve tek bir `v1.route(...)` satırını o çizginin üstüne taşımak, bir ucu sessizce herkese açar.
 *
 * Hiçbir yerde hata vermez. Testler geçer, ekran çalışır, tip sistemi susar. Fark yalnız
 * `curl`layan biri görür.
 *
 * ── LİSTE BURADA TEKRAR YAZILIYOR VE BU BİLİNÇLİ ────────────────────────────
 * Normalde kaynağı tekrar eden test, kaynakla birlikte yanılır (mail hizası testinin dersi, 24.08).
 * Burada tam TERSİ isteniyor: liste bir **beyandır**. Router'dan türetilseydi, taşınan bir satır
 * testi de kendiliğinden taşır ve iddia hiçbir şey söylemezdi. Yeni bir açık uç eklemek bu dosyayı
 * da değiştirmeyi gerektiriyor — yani kararı bilinçli hâle getiriyor.
 *
 * ── ÖLÇÜLEN ŞEY "200 DÖNDÜ MÜ" DEĞİL ────────────────────────────────────────
 * Açık uçlar geçerli parametre istiyor, çoğu 400 döner. Sınanan tek şey: **401 DÖNMÜYOR.** Aynı
 * şekilde korumalı uçlarda sınanan tek şey: **401 DÖNÜYOR** — gövde, veri, yetki hepsi kendi
 * dosyasının işi.
 */

/**
 * Kimliksiz erişilebilen uçlar ve her birinin gerekçesi — hepsi kayıtlı kararlar.
 * Yol örnekleri GEÇERLİ OLMAK ZORUNDA DEĞİL; ölçüt yalnız kapının açık olması.
 */
const ACIK: readonly [yol: string, metod: 'GET' | 'POST', gerekce: string][] = [
  // METOT DA LİSTEDE ve bu ölçülmüş bir düzeltme (24.08): ilk taslak her yolu GET'liyordu ve
  // `POST`-only uçlar 401 döndü — çünkü eşleşmeyen METOT da `bearerAuth`a düşüyor. Yani "açık mı"
  // sorusu yol+metot çiftine sorulmalı; yalnız yola sormak yanlış bir alarm üretir.
  ['/api/v1/auth/otp/request', 'POST', 'giriş uçları doğası gereği oturumsuz'],
  ['/api/v1/products?limit=1', 'GET', 'oturumsuz kullanım = müşteri gezinmesi (02-mimari §4)'],
  ['/api/v1/home', 'GET', 'vitrin katalog kümesinden (21.14)'],
  ['/api/v1/packages', 'GET', 'paket detayı girişsiz gezilir (21.14)'],
  ['/api/v1/recipes', 'GET', 'tarif detayı girişsiz gezilir (21.14)'],
  ['/api/v1/places/by-postal-code?code=67000', 'GET', 'yer çözümü onboarding’in GİRİŞ sorusu'],
  ['/api/v1/delivery-terms', 'GET', 'ilan edilen tutarlar hesapsız okunur'],
  ['/api/v1/discover', 'GET', 'keşif turu ziyaretçiye açık (21.19) — 401 hiçbir hâlde dönmez'],
  ['/api/v1/discover/vote', 'POST', 'kaydırma KİMLİKSİZ de yazılır (21.19)'],
  ['/api/v1/points/rules', 'GET', 'onboarding programı anlatıyor, o kişi henüz misafir'],
];

/**
 * Bearer isteyen uçlar. Kimliğe bağlı HER ŞEY burada: sepet, sipariş, ödeme, cüzdan, talep,
 * başvuru — ve personel yüzeyleri.
 */
const KORUMALI: readonly string[] = [
  '/api/v1/me',
  '/api/v1/me/addresses',
  '/api/v1/me/orders',
  '/api/v1/me/cart',
  '/api/v1/me/checkout',
  '/api/v1/me/preferences',
  '/api/v1/me/points',
  '/api/v1/me/points/history',
  '/api/v1/me/invite',
  '/api/v1/me/discover',
  '/api/v1/me/tickets',
  '/api/v1/me/b2b',
  '/api/v1/courier/day',
  '/api/v1/warehouse/intake',
  '/api/v1/social/conversations',
  // Yerinde satış (21.119) — para alan bir uç; kimliksiz erişim hiçbir hâlde olmamalı.
  '/api/v1/sale/on-site',
  // Satış kataloğu da korumalı: kalan ADET taşıyor — vitrinin bilerek sızdırmadığı sayı.
  '/api/v1/sale/catalog',
  '/api/v1/sale/catalog/su-boregi/variants',
  // Yönetim + Para (21.12) — ikisi de salt okuma; kapıları rol ister (admin · accounting+admin).
  '/api/v1/management/hub',
  '/api/v1/management/offer-candidates',
  '/api/v1/management/offers',
  '/api/v1/management/supply',
  '/api/v1/management/supply/draft',
  '/api/v1/management/complaints/next',
  '/api/v1/management/complaints/00000000-0000-4000-8000-000000000001',
  '/api/v1/management/complaints/00000000-0000-4000-8000-000000000001/reply',
  '/api/v1/management/complaints/00000000-0000-4000-8000-000000000001/claim',
  '/api/v1/management/complaints/00000000-0000-4000-8000-000000000001/draft',
  '/api/v1/management/exceptions',
  '/api/v1/management/exceptions/00000000-0000-4000-8000-000000000001/ask',
  '/api/v1/money/overview',
  '/api/v1/money/day-end',
  // Operasyon kabuğunun künyesi (30.08) — personelin depo kapsamı. Kimliksiz erişim işletmenin
  // tesis envanterini dışarıya sayardı; kapı bölüm uçlarıyla aynı çizgide.
  '/api/v1/operations/scope',
];

describe('kapı sınırı — varsayılan KAPALI', () => {
  it.each(KORUMALI)('%s Bearer olmadan 401', async (yol) => {
    const res = await app.request(yol);

    expect(res.status).toBe(401);
  });

  it.each(ACIK)('%s (%s) kimliksiz erişilebilir — %s', async (yol, metod) => {
    const res = await app.request(yol, { method: metod });

    // 400 kabul: uç geçerli parametre/gövde isteyebilir. Sınanan tek şey KAPININ AÇIK olduğu —
    // 401, o ucun sessizce çizginin altına kaydığını söyler.
    expect(res.status).not.toBe(401);
  });

  it('BOZUK Bearer 401 — geçersiz jeton "kimliksiz" sayılıp geçilmez', async () => {
    const res = await app.request('/api/v1/me', { headers: { authorization: 'Bearer uydurma-jeton' } });

    expect(res.status).toBe(401);
  });

  it('şema OLMADAN gelen `authorization` başlığı 401 — ham jeton kabul edilmez', async () => {
    const res = await app.request('/api/v1/me', { headers: { authorization: 'uydurma-jeton' } });

    expect(res.status).toBe(401);
  });

  it('BOŞ Bearer 401', async () => {
    const res = await app.request('/api/v1/me', { headers: { authorization: 'Bearer ' } });

    expect(res.status).toBe(401);
  });

  it('TANINMAYAN yol da 401 döner — 404 DEĞİL, ve bu doğru olan', async () => {
    /* İlk taslak burada 404 bekliyordu; ölçüm 401 verdi ve DAVRANIŞ HAKLI ÇIKTI (24.08).
       `v1.use('*', bearerAuth)` eşleşmeyen yolu da yakalıyor. Sonuç, "varsayılan kapalı"
       ilkesinin doğal uzantısı: dışarıdan bakan biri **hangi ucun var olduğunu** ayırt edemiyor,
       çünkü var olmayan da olan da aynı cevabı veriyor. 404 döndürmek, kimliksiz bir tarayıcıya
       uç envanteri çıkarmanın yolunu açardı.
       Test bu yüzden davranışı ÇİVİLİYOR: biri "404 daha doğrudur" diye düzeltmeye kalkarsa,
       burada gerekçesini okur. */
    const res = await app.request('/api/v1/olmayan-uc');

    expect(res.status).toBe(401);
  });
});

/**
 * Geliştirme giriş kapısı — üretimde MOUNT EDİLMEZ.
 *
 * `router.ts` bu route'u `process.env.NODE_ENV !== 'production'` koşuluyla bağlıyor; koşul
 * kalkarsa mail turunu atlayan bir oturum kapısı üretime açılır. Koşul MODÜL YÜKLENİRKEN
 * değerlendiği için testte `NODE_ENV`i değiştirip yeniden ölçmek modülü yeniden yüklemeyi
 * gerektirir — burada yalnız BUGÜNKÜ ortamda var olduğu doğrulanıyor, yokluğu değil.
 */
describe('geliştirme giriş kapısı', () => {
  it('yerelde MOUNT EDİLİ — üretim koşulu bu ortamda yanlış', async () => {
    const res = await app.request('/api/v1/auth/dev-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `yok-${Date.now()}@example.test` }),
    });

    // Mount edilmemiş olsaydı 404 dönerdi; kayıtsız e-posta için beklenen ret 400.
    expect(res.status).not.toBe(404);
  });
});
