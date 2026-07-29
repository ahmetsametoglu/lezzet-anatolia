import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorLogService, errorFingerprint } from './error-log.service';
import { UserProfileService } from './user-profile.service';
import { serviceDb } from '../client';

/**
 * Hata kaydı (18.5) — `OBSERVABILITY §2`.
 *
 * Sınanan üç davranış, üçü de tablonun varlık sebebi:
 *   1. **Gruplama:** aynı hata tek satırda birikir; değişken parçalar (kimlik, sayı) grubu bölmez.
 *   2. **Regresyon:** "çözüldü" işaretinden sonra aynı hata YENİ satır açar — sayacı sessizce
 *      artırmak, geri gelen bir hatanın haberini yutardı.
 *   3. **Asla fırlatmaz:** hata kaydetme yolu, kaydedilmeye çalışılan hatayı maskelemez.
 *
 * Paylaşılan yerel veritabanı: kaynak damgayla ayrılır (CLAUDE.md §4b) — başka bir ajanın satırları
 * bu testin sayımlarına girmez.
 */
const db = serviceDb();
const errors = new ErrorLogService(db);

const stamp = Date.now();
const SOURCE = `test-${stamp}`;

/**
 * `resolved_by` GERÇEK bir profile bakar (FK) — uydurma kimlik reddedilir ve bu doğru: çözüm kararının
 * sahibi bilinmeyen bir kayıt, denetlenemez bir karardır. Test de gerçek bir personel satırı kurar.
 */
let staffId: string;

beforeAll(async () => {
  staffId = (await new UserProfileService(db).insert({ name: 'Hata kaydı testi', email: `errlog-${stamp}@example.test` })).id;
});

afterAll(async () => {
  await db.from('error_log').delete().like('source', `test-${stamp}%`);
  await db.from('user_profiles').delete().eq('id', staffId);
});

describe('errorFingerprint', () => {
  it('DEĞİŞKEN parçalar sabitlenir — aynı hata farklı kimlikle gelse aynı gruba düşer', () => {
    const a = errorFingerprint('web', 'Order 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071 not found');
    const b = errorFingerprint('web', 'Order 9c8b7a6d-4e3f-2a1b-8c7d-6e5f4a3b2c10 not found');
    expect(a).toBe(b);
    expect(a).toContain('<uuid>');
  });

  it('uzun sayı ve hex de sabitlenir', () => {
    expect(errorFingerprint('web', 'timeout after 15000ms')).toBe(errorFingerprint('web', 'timeout after 30000ms'));
    expect(errorFingerprint('web', 'bad token a1b2c3d4e5f60718')).toContain('<hex>');
  });

  it('KISA sayı sabitlenmez — "5 kalem eksik" ile "9 kalem eksik" ayrı sorunlar olabilir', () => {
    expect(errorFingerprint('web', '5 kalem eksik')).not.toBe(errorFingerprint('web', '9 kalem eksik'));
  });

  it('kaynak grubun parçası: aynı mesaj farklı yerden gelirse ayrı satır', () => {
    expect(errorFingerprint('web-server', 'boom')).not.toBe(errorFingerprint('backend-cron', 'boom'));
  });

  it('stack karesi node_modules DIŞINDAN seçilir — kütüphane sürümü grubu bölmesin', () => {
    const ours = 'Error: x\n    at foo (/app/node_modules/pg/lib/client.js:1:1)\n    at bar (/app/lib/order/checkout.ts:42:7)';
    const same = 'Error: x\n    at foo (/app/node_modules/pg/lib/client.js:9:9)\n    at bar (/app/lib/order/checkout.ts:42:7)';
    expect(errorFingerprint('web', 'x', ours)).toBe(errorFingerprint('web', 'x', same));
    expect(errorFingerprint('web', 'x', ours)).toContain('lib/order/checkout.ts');
  });

  it('satır numarası atılır — bir satır eklemek hatayı YENİ yapmamalı', () => {
    const before = 'Error: x\n    at bar (/app/lib/order/checkout.ts:42:7)';
    const after = 'Error: x\n    at bar (/app/lib/order/checkout.ts:57:11)';
    expect(errorFingerprint('web', 'x', before)).toBe(errorFingerprint('web', 'x', after));
  });
});

describe('capture', () => {
  it('aynı hata TEK satırda birikir — 1000 aynı hata = 1 satır', async () => {
    for (let i = 0; i < 3; i += 1) {
      await errors.capture({ source: SOURCE, message: `Order ${crypto.randomUUID()} not found` });
    }

    const { rows, total } = await errors.listRecent({ search: SOURCE });
    expect(total).toBe(1);
    expect(rows[0]?.count).toBe(3);
    // En güncel bağlam tutulur: son görülen mesaj yazılıdır (ilki değil).
    expect(rows[0]?.message).toContain('not found');
  });

  it('farklı hata ayrı satır açar', async () => {
    await errors.capture({ source: `${SOURCE}-b`, message: 'tamamen başka bir arıza' });
    expect((await errors.listRecent({ search: `${SOURCE}-b` })).total).toBe(1);
  });

  it('bağlam ve seviye yazılır', async () => {
    await errors.capture({
      source: `${SOURCE}-c`,
      message: 'kritik akış koptu',
      level: 'fatal',
      context: { orderId: '11111111-1111-1111-1111-111111111111', job: 'x' },
      path: '/checkout',
    });

    const row = (await errors.listRecent({ search: `${SOURCE}-c` })).rows[0];
    expect(row?.level).toBe('fatal');
    expect(row?.path).toBe('/checkout');
    expect(row?.context).toMatchObject({ job: 'x' });
  });

  it('ASLA FIRLATMAZ — bozuk girdi bile akışı kesmez', async () => {
    // Aşırı uzun mesaj: kırpma çalışmazsa DB reddeder ve fırlatırdı.
    await expect(errors.capture({ source: `${SOURCE}-d`, message: 'x'.repeat(50_000) })).resolves.toBeUndefined();
  });
});

describe('çözüldü ve regresyon', () => {
  it('çözülen hata odaktan çıkar, sayaçlar ayrışır', async () => {
    const source = `${SOURCE}-e`;
    await errors.capture({ source, message: 'geçici arıza' });
    const row = (await errors.listRecent({ search: source })).rows[0]!;

    await errors.resolve(row.id, staffId);

    expect((await errors.listRecent({ resolved: false, search: source })).total).toBe(0);
    expect((await errors.listRecent({ resolved: true, search: source })).total).toBe(1);
    expect(await errors.statusCounts(source)).toMatchObject({ open: 0, resolved: 1 });
  });

  it('ÇÖZÜLDÜKTEN SONRA tekrar gelen hata YENİ satır açar — regresyon görünür olur', async () => {
    const source = `${SOURCE}-f`;
    await errors.capture({ source, message: 'dönen arıza' });
    const first = (await errors.listRecent({ search: source })).rows[0]!;
    await errors.resolve(first.id, staffId);

    await errors.capture({ source, message: 'dönen arıza' });

    const { rows, total } = await errors.listRecent({ search: source });
    expect(total).toBe(2);
    // Yeni satır sayacı 1'den başlar: çözülmüş satırın geçmişini devralmaz.
    const open = rows.find((r) => r.resolvedAt === null);
    expect(open?.count).toBe(1);
    expect(open?.id).not.toBe(first.id);
  });
});

describe('saklama süpürmesi', () => {
  it('YALNIZ çözülmüş ve süresi geçmiş kayıtları siler', async () => {
    const source = `${SOURCE}-g`;
    // İki satır: biri çözülmüş ve eski, biri çözülmemiş ve eski.
    await errors.capture({ source, message: 'kapatılmış eski' });
    const closed = (await errors.listRecent({ search: source })).rows[0]!;
    await errors.resolve(closed.id, staffId);
    await errors.capture({ source: `${source}-open`, message: 'açık eski' });
    const open = (await errors.listRecent({ search: `${source}-open` })).rows[0]!;

    // Eskitme: saklama eşiği `resolved_at`'e bakar, kayıt tarihine değil.
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    await db.from('error_log').update({ resolved_at: old }).eq('id', closed.id);
    await db.from('error_log').update({ created_at: old, last_seen_at: old }).eq('id', open.id);

    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const removed = await errors.deleteResolvedBefore(cutoff);

    expect(removed).toBe(1);
    // AÇIK hata duruyor: süpürülürse sorun kaybolmaz, yalnız görünmez olurdu.
    expect((await errors.listRecent({ search: `${source}-open` })).total).toBe(1);
  });
});
