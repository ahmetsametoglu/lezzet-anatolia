import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { SettingsService } from './settings.service';

/**
 * İşletme ayarı (02.6) — kapsamlı çözüm: EN ÖZGÜL kapsam kazanır, yoksa global'e düşer.
 * Ayarların env'e/koda gömülmemesinin karşılığı budur (STACK §10).
 */
const db = serviceDb();
const settings = new SettingsService(db);
const damga = Date.now();
const anahtar = `test_min_basket_${damga}`;

// Her senaryo kendi zeminini kurar: testler aynı anahtarı kullanıyor, satırlar birikirse
// "kaç kapsam tanımlı" ölçen assertion'lar birbirini etkiler.
afterEach(async () => {
  await db.from('settings').delete().eq('key', anahtar);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('settings').delete().eq('key', anahtar);
});

describe('kapsamlı çözüm', () => {
  it('hiç satır yoksa çağıranın verdiği varsayılana düşer (kodda sabit yok)', async () => {
    expect(await settings.getNumber(anahtar, 2500)).toBe(2500);
  });

  it('global değer okunur', async () => {
    await settings.set(anahtar, 4000);
    expect(await settings.getNumber(anahtar, 2500)).toBe(4000);
  });

  it('BÖLGE değeri globali ezer (02.6 bitti-kriteri)', async () => {
    await settings.set(anahtar, 4000);
    await settings.set(anahtar, 6000, { scopeType: 'zone', scopeId: 'zone-1' });

    expect(await settings.getNumber(anahtar, 0, { zoneId: 'zone-1' })).toBe(6000);
    expect(await settings.getNumber(anahtar, 0, { zoneId: 'zone-2' })).toBe(4000); // başka bölge globale düşer
    expect(await settings.getNumber(anahtar, 0)).toBe(4000);
  });

  it('özgüllük sırası: bölge > kanal > ülke > global', async () => {
    await settings.set(anahtar, 1000);
    await settings.set(anahtar, 2000, { scopeType: 'country', scopeId: 'DE' });
    await settings.set(anahtar, 3000, { scopeType: 'channel', scopeId: 'b2b' });
    await settings.set(anahtar, 4000, { scopeType: 'zone', scopeId: 'z1' });

    expect(await settings.getNumber(anahtar, 0, { zoneId: 'z1', channel: 'b2b', country: 'DE' })).toBe(4000);
    expect(await settings.getNumber(anahtar, 0, { channel: 'b2b', country: 'DE' })).toBe(3000);
    expect(await settings.getNumber(anahtar, 0, { country: 'DE' })).toBe(2000);
    expect(await settings.getNumber(anahtar, 0, { country: 'FR' })).toBe(1000);
  });

  it('aynı anahtar+kapsam ikinci kez açılmaz — üzerine yazılır', async () => {
    await settings.set(anahtar, 1000);
    await settings.set(anahtar, 1500);

    expect(await settings.listByKey(anahtar)).toHaveLength(1);
    expect(await settings.getNumber(anahtar, 0)).toBe(1500);
  });

  it('sayısal olmayan değer varsayılana düşer (bozuk ayar akışı kilitlemez)', async () => {
    await settings.set(anahtar, 'bozuk');
    expect(await settings.getNumber(anahtar, 2500)).toBe(2500);
  });
});

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
