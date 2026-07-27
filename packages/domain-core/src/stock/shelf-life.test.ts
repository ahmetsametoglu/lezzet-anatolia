import { describe, expect, it } from 'vitest';
import { daysToExpiry, expiryFlagOf, isSellableBatch, meetsMlor, remainingShelfLifePercent } from './shelf-life';

const NOW = new Date('2026-07-27T10:00:00Z');
/** NOW'dan n gün sonrası (negatifse öncesi) — ISO tarih. */
const gun = (n: number) => new Date(Date.UTC(2026, 6, 27 + n)).toISOString().slice(0, 10);

describe('kalan raf ömrü % (03/06)', () => {
  it('360 günlük üründe 90 gün kalmışsa %25', () => {
    expect(remainingShelfLifePercent(gun(90), 360, NOW)).toBe(25);
  });

  it('toplam raf ömrü girilmemişse hesaplanamaz → null (uydurma yüzdeyle alarm üretilmez)', () => {
    expect(remainingShelfLifePercent(gun(90), null, NOW)).toBeNull();
    expect(remainingShelfLifePercent(gun(90), 0, NOW)).toBeNull();
  });

  it('tarihi geçmiş partide 0 (negatife düşmez)', () => {
    expect(remainingShelfLifePercent(gun(-5), 360, NOW)).toBe(0);
  });

  it('ömründen uzun tarihli parti %100 ile sınırlanır', () => {
    expect(remainingShelfLifePercent(gun(500), 360, NOW)).toBe(100);
  });

  it('gün farkı saat gürültüsünden etkilenmez', () => {
    expect(daysToExpiry('2026-07-28T23:59:00Z', NOW)).toBe(1);
  });
});

describe('satılabilirlik — DLC güvenlik, DDM kalite', () => {
  it('DLC geçmişse satılamaz', () => {
    expect(isSellableBatch('DLC', gun(-1), NOW)).toBe(false);
  });

  it('son tarih günü hâlâ satılır', () => {
    expect(isSellableBatch('DLC', gun(0), NOW)).toBe(true);
  });

  it('DDM geçmiş olsa da satılabilir (indirim havuzuna girer)', () => {
    expect(isSellableBatch('DDM', gun(-30), NOW)).toBe(true);
  });
});

describe('uyarı durumu', () => {
  it('eşik altındaki parti near_expiry — indirim/hediye önerisine düşer', () => {
    expect(expiryFlagOf('DDM', gun(80), 360, NOW)).toBe('near_expiry'); // %22
    expect(expiryFlagOf('DDM', gun(180), 360, NOW)).toBe('ok'); // %50
  });

  it('tam eşikte uyarı verir (%25 dâhil)', () => {
    expect(expiryFlagOf('DDM', gun(90), 360, NOW)).toBe('near_expiry');
  });

  it('geçmiş DLC bloklu, geçmiş DDM satılabilir', () => {
    expect(expiryFlagOf('DLC', gun(-1), 360, NOW)).toBe('expired_blocked');
    expect(expiryFlagOf('DDM', gun(-1), 360, NOW)).toBe('expired_sellable');
  });

  it('raf ömrü bilinmiyorsa sessiz kalır — yanlış alarm üretmez', () => {
    expect(expiryFlagOf('DDM', gun(1), null, NOW)).toBe('ok');
  });

  it('eşik parametriktir (Setting)', () => {
    expect(expiryFlagOf('DDM', gun(180), 360, NOW, 60)).toBe('near_expiry'); // %50 < %60
  });
});

describe('MLOR — girişte kabul eşiği', () => {
  it('%75 altındaki parti uyarı üretir ama kabulü engellemez', () => {
    const r = meetsMlor(gun(180), 360, NOW);
    expect(r.ok).toBe(false);
    expect(r.remainingPercent).toBe(50);
  });

  it('%75 ve üstü temiz geçer', () => {
    expect(meetsMlor(gun(270), 360, NOW).ok).toBe(true);
  });

  it('ölçüt yoksa (raf ömrü null) uyarı üretilmez — kabul akışı durmaz', () => {
    expect(meetsMlor(gun(1), null, NOW)).toEqual({ ok: true, remainingPercent: null });
  });
});
