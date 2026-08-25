import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anonDb, serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { awardPoints } from '@lezzet/application';
import { POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY } from '@lezzet/domain-core';
import { app } from '../../app';

/**
 * `/api/v1/me/points` — BEŞ UÇ, taşıma katmanı (MB-18'in adlandırdığı boşluk).
 *
 * ── NEDEN BU DOSYA, NEDEN ŞİMDİ ─────────────────────────────────────────────
 * MB-18 *"her puan senaryosunun uçtan uca denetimi"*ni istiyor ve ölçüldü (24.08): MOTOR yarısı
 * zaten kapalı — `domain-core/feedback/points.test.ts` 18 testle B2B'yi, günlük tavanı, eşiği ve
 * muafiyetleri sınıyor. Açık olan UÇ yarısıydı: bu dosyanın beş ucu vardı ve **tek testi yoktu**,
 * dokuz kardeş ucun dokuzunda varken.
 *
 * ── BURADA KURAL SINANMIYOR, KAPI SINANIYOR ─────────────────────────────────
 * Kaç puan kazanıldığı, eşiğin ne olduğu, B2B'nin neden kazanamadığı motorun testinde. Burada
 * ölçülen üç şey: **kimlik doğru çözülüyor mu**, **ret doğru KODLA mı dönüyor**, **zarfa sızmaması
 * gereken alan sızıyor mu**. Üçü de taşıma hatasıdır ve motor testleri hiçbirini göremez.
 *
 * ── EN KIRILGAN İKİ AYRIM ───────────────────────────────────────────────────
 * · **B2B'de `points: null`, sıfır DEĞİL.** Program dışıdır ve ekran bölümü hiç çizmez; "0 puan"
 *   yazmak kazanılamayacak bir bakiyeyi boş bir hedef gibi gösterirdi (CLAUDE §1).
 * · **Adlı retler AYRI kodlarla döner** — 403 `not_eligible` (B2B) · 400 `below_minimum` (eşik
 *   altı). İkisini tek koda katmak ekranı "neden olmadı" diye tahmin etmeye bırakırdı.
 *
 * ── KÜRESEL AYAR DEĞİŞTİRİLİYOR, GERİ KONUYOR (`CLAUDE §4b`) ────────────────
 * Eşik `settings`te ve TÜM suite onu okuyor. `settingsSnapshot` ile önce okunup `afterAll`da geri
 * konuyor — "boşa çek" de bir varsayımdır ve bir gün yanlış olur.
 */
const db = serviceDb();
const stamp = Date.now();
const settings = settingsSnapshot(db);

const authUserIds: string[] = [];
const profileIds: string[] = [];

let musteriToken: string;
let musteriId: string;
let toptanToken: string;

/** Auth kullanıcısı + rolleri yazılmış profil + açık oturum (kurye ucu testinin deseni). */
async function signedInUser(label: string, overrides: Record<string, unknown> = {}) {
  const email = `points-api-${label}-${stamp}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  // Roller AÇIKÇA yazılıyor: `0002` ilk kullanıcıya `admin` veriyor ve trigger'a güvenmek testi
  // yerel veritabanının geçmişine bağlardı (kurye ucu testinin ölçtüğü tuzak).
  await profiles.update({ id: profile.id, roles: ['customer'], name: `Puan ${label}`, ...overrides });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const authPost = (token: string) => ({ method: 'POST', headers: { authorization: `Bearer ${token}` } });

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

async function errorOf(res: Response): Promise<string> {
  const envelope = (await res.json()) as { data: unknown; error: string };
  return envelope.error;
}

beforeAll(async () => {
  const musteri = await signedInUser('musteri');
  musteriToken = musteri.token;
  musteriId = musteri.profileId;
  // Onaylı toptan müşteri: program DIŞI. Onaysız şirket B2C'ye düşer (fiyat tarafında ayrıca
  // sınanıyor) — burada gerçekten program dışı olan hâl kuruluyor.
  toptanToken = (await signedInUser('toptan', { type: 'company', b2bApproved: true })).token;
});

beforeEach(async () => {
  // Her senaryo kendi bakiyesini kursun: önceki turun puanları eşik iddialarını oynatır.
  await db.from('points_entry').delete().eq('customer_id', musteriId);
});

afterAll(async () => {
  await settings.restore();
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('GET /api/v1/points/rules — AÇIK uç', () => {
  it('kimliksiz okunur — onboarding ekranını gören kişi henüz misafirdir', async () => {
    const res = await app.request('/api/v1/points/rules');

    expect(res.status).toBe(200);
    const rules = await dataOf<{ redeem: { minimumPoints: number }; earnWays: unknown[] }>(res);
    expect(rules.redeem.minimumPoints).toBeGreaterThan(0);
    expect(Array.isArray(rules.earnWays)).toBe(true);
  });

  it('KİŞİSEL hiçbir şey taşımaz — açık olması bir ödün değil, doğru sınır', async () => {
    // Bakiye, davet kodu ve kupon `/me/points`in işi. Buraya sızarlarsa uç, kimliksiz okunduğu
    // için başkasının verisini herkese açardı.
    const rules = await dataOf<Record<string, unknown>>(await app.request('/api/v1/points/rules'));

    expect(rules).not.toHaveProperty('balance');
    expect(rules).not.toHaveProperty('referralCode');
    expect(rules).not.toHaveProperty('coupons');
  });
});

describe('GET /api/v1/me/points — kart', () => {
  it('Bearer olmadan 401 — cüzdan oturumsuz okunmaz', async () => {
    const res = await app.request('/api/v1/me/points');

    expect(res.status).toBe(401);
  });

  it('müşteri kartını okur; kazanma yolları ve davet kodu KARTIN İÇİNDE', async () => {
    const res = await app.request('/api/v1/me/points', auth(musteriToken));

    expect(res.status).toBe(200);
    const view = await dataOf<{ points: { balance: number; referralCode: string | null; earnWays: unknown[] } | null }>(res);
    expect(view.points).not.toBeNull();
    expect(view.points?.balance).toBe(0);
    // Davet kodu kart çizildiyse GARANTİLİ: yolu gösterip paylaşılacak kodu vermemek, müşteriyi
    // çalışmayan bir düğmeye bastırırdı.
    expect(view.points?.referralCode).toBeTruthy();
  });

  it('B2B kartı `null` — SIFIR DEĞİL, program dışıdır', async () => {
    // Kırılgan ayrım: `0` yazmak kazanılamayacak bir bakiyeyi boş bir hedef gibi gösterirdi.
    const view = await dataOf<{ points: unknown; coupons: unknown[] }>(await app.request('/api/v1/me/points', auth(toptanToken)));

    expect(view.points).toBeNull();
    // Kuponlar puanla AYNI koşula bağlı; ayrı ayrı sorulsalardı biri bir gün B2B'ye sızardı.
    expect(view.coupons).toEqual([]);
  });

  it('kazanılan puan kartta GÖRÜNÜR — defter ile ekran aynı sayıyı söyler', async () => {
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const view = await dataOf<{ points: { balance: number } | null }>(await app.request('/api/v1/me/points', auth(musteriToken)));
    expect(view.points?.balance).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/me/points/visit — günlük giriş', () => {
  it('puan yazar ve HEP `true` döner — ödül sessizdir', async () => {
    const res = await app.request('/api/v1/me/points/visit', authPost(musteriToken));

    expect(res.status).toBe(200);
    expect(await dataOf<boolean>(res)).toBe(true);
  });

  it('AYNI GÜN ikinci çağrı arıza DEĞİL — tekillik veritabanında, uç yine `true` der', async () => {
    // Uygulama gün içinde defalarca öne gelirse ikinci istek normal davranıştır. Uç bir hata
    // dönseydi istemci "bugün kazandın mı" diye bir dal yazmaya davet edilirdi.
    await app.request('/api/v1/me/points/visit', authPost(musteriToken));
    const ikinci = await app.request('/api/v1/me/points/visit', authPost(musteriToken));

    expect(ikinci.status).toBe(200);
    expect(await dataOf<boolean>(ikinci)).toBe(true);

    const { count } = await db
      .from('points_entry')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', musteriId)
      .eq('reason', 'visit');
    expect(count).toBe(1);
  });

  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/points/visit', { method: 'POST' })).status).toBe(401);
  });
});

describe('GET /api/v1/me/points/history — defter', () => {
  it('en yeni önce döner ve imleç taşır', async () => {
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const page = await dataOf<{ entries: { reason: string }[]; nextCursor: string | null }>(
      await app.request('/api/v1/me/points/history', auth(musteriToken)),
    );
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.entries[0]?.reason).toBe('visit');
    expect('nextCursor' in page).toBe(true);
  });

  it('DEFTERİN İÇ ALANLARI zarfa sızmaz — `note` · `refId` · `createdBy`', async () => {
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const page = await dataOf<{ entries: Record<string, unknown>[] }>(
      await app.request('/api/v1/me/points/history', auth(musteriToken)),
    );
    const entry = page.entries[0] ?? {};
    expect(Object.keys(entry).sort()).toEqual(['at', 'id', 'points', 'reason']);
  });

  it('B2B 403 `not_eligible` — boş liste "hiç hareketiniz yok" demek olurdu', async () => {
    const res = await app.request('/api/v1/me/points/history', auth(toptanToken));

    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('not_eligible');
  });

  it('BOZUK imleç listeyi BAŞTAN verir, 400 DÖNMEZ', async () => {
    // Opak imleç dışarıdan gelir; bozulduğunda ekranı hata sayfasına düşürmek yerine ilk sayfayı
    // vermek doğru — müşteri bir şey kaybetmez (sipariş listesinin aynı sözleşmesi).
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const res = await app.request('/api/v1/me/points/history?cursor=bozuk-imlec', auth(musteriToken));
    expect(res.status).toBe(200);
    const page = await dataOf<{ entries: unknown[] }>(res);
    expect(page.entries.length).toBeGreaterThan(0);
  });

  it('TAVANI AŞAN `limit` reddedilir — sayfa boyu istemcinin keyfine bırakılmaz', async () => {
    const res = await app.request('/api/v1/me/points/history?limit=500', auth(musteriToken));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('invalid_query');
  });

  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/points/history')).status).toBe(401);
  });
});

describe('POST /api/v1/me/points/redeem — kupona çevirme', () => {
  it('EŞİK ALTI 400 `below_minimum` — adlı ret, genel hata değil', async () => {
    const res = await app.request('/api/v1/me/points/redeem', authPost(musteriToken));

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('below_minimum');
  });

  it('B2B 403 `not_eligible` — eşikten AYRI kod', async () => {
    // İki reddi tek koda katmak ekranı "neden olmadı" diye tahmin etmeye bırakırdı.
    const res = await app.request('/api/v1/me/points/redeem', authPost(toptanToken));

    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('not_eligible');
  });

  it('eşiği geçen bakiye kupona döner; cevap GÜNCEL kartı da taşır', async () => {
    // Eşik testin kendi kurduğu değere çekiliyor (ve `afterAll`da geri konuyor): varsayılan 500
    // puanı ziyaret ödülleriyle biriktirmek onlarca gün simülasyonu isterdi.
    await settings.override(POINTS_REDEEM_MIN_KEY, 10);
    await settings.override(POINTS_CENT_VALUE_KEY, 1);
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const res = await app.request('/api/v1/me/points/redeem', authPost(musteriToken));
    expect(res.status).toBe(200);

    const view = await dataOf<{ redeemedCode: string; points: { balance: number } | null; coupons: unknown[] }>(res);
    expect(view.redeemedCode).toBeTruthy();
    // Cevap AYNI zarf: çevirme bakiyeyi düşürür ve listeye kupon ekler; tek kaydı dönmek
    // istemciyi ikinci bir okuma turuna mecbur bırakırdı.
    expect(view.points?.balance).toBe(0);
    expect(view.coupons.length).toBeGreaterThan(0);
  });

  it('GÖVDE ALMAZ — kaç puan harcanacağını istemci söylemez', async () => {
    // Bir sayı kabul etseydik ekranın gördüğü eşik ile motorun uyguladığı eşik ayrışabilirdi ve
    // o ayrışma hata vermez, yalnız müşteriyi reddedilecek bir düğmeye bastırırdı.
    await settings.override(POINTS_REDEEM_MIN_KEY, 10);
    await settings.override(POINTS_CENT_VALUE_KEY, 1);
    await awardPoints(db, { customerId: musteriId, reason: 'visit' });

    const res = await app.request('/api/v1/me/points/redeem', {
      method: 'POST',
      headers: { authorization: `Bearer ${musteriToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ points: 999_999 }),
    });

    // Gövde YOK SAYILIR: uydurulmuş bir miktar ne kabul edilir ne de isteği düşürür.
    expect(res.status).toBe(200);
    const view = await dataOf<{ points: { balance: number } | null }>(res);
    expect(view.points?.balance).toBe(0);
  });

  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/points/redeem', { method: 'POST' })).status).toBe(401);
  });
});
