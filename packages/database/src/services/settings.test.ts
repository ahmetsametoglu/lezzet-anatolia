import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { SETTINGS_CACHE_TTL_MS, SettingsService } from './settings.service';

/**
 * İşletme ayarı (02.6) — kapsamlı çözüm: EN ÖZGÜL kapsam kazanır, yoksa global'e düşer.
 * Ayarların env'e/koda gömülmemesinin karşılığı budur (STACK §10).
 */
const db = serviceDb();
const settings = new SettingsService(db);
const stamp = Date.now();
const key = `test_min_basket_${stamp}`;

// Her senaryo kendi zeminini kurar: testler aynı anahtarı kullanıyor, satırlar birikirse
// "kaç kapsam tanımlı" ölçen assertion'lar birbirini etkiler.
afterEach(async () => {
  await db.from('settings').delete().eq('key', key);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('settings').delete().eq('key', key);
});

describe('kapsamlı çözüm', () => {
  it('hiç satır yoksa çağıranın verdiği varsayılana düşer (kodda sabit yok)', async () => {
    expect(await settings.getNumber(key, 2500)).toBe(2500);
  });

  it('global değer okunur', async () => {
    await settings.set(key, 4000);
    expect(await settings.getNumber(key, 2500)).toBe(4000);
  });

  it('BÖLGE değeri globali ezer (02.6 bitti-kriteri)', async () => {
    await settings.set(key, 4000);
    await settings.set(key, 6000, { scopeType: 'zone', scopeId: 'zone-1' });

    expect(await settings.getNumber(key, 0, { zoneId: 'zone-1' })).toBe(6000);
    expect(await settings.getNumber(key, 0, { zoneId: 'zone-2' })).toBe(4000); // başka bölge globale düşer
    expect(await settings.getNumber(key, 0)).toBe(4000);
  });

  it('özgüllük sırası: bölge > kanal > ülke > global', async () => {
    await settings.set(key, 1000);
    await settings.set(key, 2000, { scopeType: 'country', scopeId: 'DE' });
    await settings.set(key, 3000, { scopeType: 'channel', scopeId: 'b2b' });
    await settings.set(key, 4000, { scopeType: 'zone', scopeId: 'z1' });

    expect(await settings.getNumber(key, 0, { zoneId: 'z1', channel: 'b2b', country: 'DE' })).toBe(4000);
    expect(await settings.getNumber(key, 0, { channel: 'b2b', country: 'DE' })).toBe(3000);
    expect(await settings.getNumber(key, 0, { country: 'DE' })).toBe(2000);
    expect(await settings.getNumber(key, 0, { country: 'FR' })).toBe(1000);
  });

  it('aynı anahtar+kapsam ikinci kez açılmaz — üzerine yazılır', async () => {
    await settings.set(key, 1000);
    await settings.set(key, 1500);

    expect(await settings.listByKey(key)).toHaveLength(1);
    expect(await settings.getNumber(key, 0)).toBe(1500);
  });

  it('sayısal olmayan değer varsayılana düşer (bozuk ayar akışı kilitlemez)', async () => {
    await settings.set(key, 'bozuk');
    expect(await settings.getNumber(key, 2500)).toBe(2500);
  });
});

/**
 * Önbelleğin ÖMRÜ (operasyon talebi §1) — ekranın operatöre verdiği sözün karşılığı.
 *
 * Sınanan şey davranışın kendisi: önbellek dış kaynaklı değişikliği bir süre GÖRMEZ (yoksa TTL'in
 * anlamı yok) ama süre dolunca GÖRÜR (eski hâlde hiç görmüyordu — süreç ömrü boyunca asılı kalıyordu
 * ve ayar ekranı yazdığını uygulatamıyordu).
 */
describe('önbellek ömrü', () => {
  it('süre dolmadan dış kaynaklı değişikliği görmez', async () => {
    await settings.set(key, 1000);
    expect(await settings.getNumber(key, 0)).toBe(1000);

    // Başka bir sürecin yazımını taklit: satır doğrudan değişir, bu sürecin `set()`'i çağrılmaz.
    await db.from('settings').update({ value: 2000 }).eq('key', key);
    expect(await settings.getNumber(key, 0)).toBe(1000);
  });

  it('süre dolunca dış kaynaklı değişikliği GÖRÜR', async () => {
    await settings.set(key, 1000);
    expect(await settings.getNumber(key, 0)).toBe(1000);
    await db.from('settings').update({ value: 2000 }).eq('key', key);

    // Saati ileri almak yerine önbelleğin damgasını geriye itiyoruz: gerçek 30 sn beklemek testi
    // paketin en yavaş dosyası yapardı, sahte zamanlayıcı ise `await`li DB çağrılarını dondurur.
    expireSettingsCache();
    expect(await settings.getNumber(key, 0)).toBe(2000);
  });

  it('yazan süreç beklemez — `set()` kendi kopyasını hemen düşürür', async () => {
    await settings.set(key, 1000);
    await settings.set(key, 2000);
    expect(await settings.getNumber(key, 0)).toBe(2000);
  });
});

/**
 * Önbellek damgalarını TTL kadar geriye iter — "süre doldu" hâlinin testteki karşılığı.
 * Özel alana dokunuyor ve bu bilinçli: alternatif ya 30 saniye beklemek ya da ömrü yalnız test
 * için parametreye çevirmekti; ikincisi üretim kodunu testin şekline göre eğmek olurdu.
 */
function expireSettingsCache(): void {
  const cache = (SettingsService as unknown as { cache: Map<string, { rows: unknown[]; at: number }> }).cache;
  for (const entry of cache.values()) entry.at -= SETTINGS_CACHE_TTL_MS + 1;
}

describe('seed varsayılanları (02.7)', () => {
  it('rezervasyon TTL 30 dk — Stripe oturum asgarisi, ödeme penceresiyle eşit', async () => {
    expect(await settings.getNumber('reservation_ttl_minutes', 0)).toBe(30);
  });

  it('kesim saati ve kapıda ödeme tavanı yüklü', async () => {
    expect(await settings.get('order_cutoff_time', '')).toBe('16:00');
    expect(await settings.getNumber('cod_max_cents', 0)).toBe(30000);
  });

  it('teslim onayı kapsamı kanal bazında: B2B zorunlu, B2C kapalı', async () => {
    expect(await settings.get('delivery_proof_required', {})).toEqual({ b2b: true, b2c: false });
  });
});
