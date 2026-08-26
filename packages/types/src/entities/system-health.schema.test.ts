import { describe, expect, it } from 'vitest';
import { HealthTrendPointSchema } from './system-health.schema';

/**
 * **ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR** (CLAUDE §1) — ve bu şema o kuralın en kırılgan yeri.
 *
 * Alanlar `->>` ile metin geldiği için `coerce` ediliyor; `null` da `coerce`'a uğrasaydı
 * `Number(null) === 0` ile ölçülemeyen disk **"%0 dolu"** olurdu ve sistem sağlıklı görünürdü.
 * Yaşandı. Şemayı `z.preprocess(Number, …)` gibi bir kalıba çeviren ilk düzenleme bu testi kırar —
 * kırması da tam olarak istenen şeydir.
 */
describe('HealthTrendPoint — null ölçüm sıfıra düşmez', () => {
  const temel = { at: '2026-08-26T10:00:00Z', status: 'ok' as const };

  it('`null` disk `null` KALIR — sıfır olmaz', () => {
    const p = HealthTrendPointSchema.parse({ ...temel, disk: null, memUsed: null, memTotal: null, load1: null, cores: null });
    expect(p.disk).toBeNull();
    expect(p.load1).toBeNull();
  });

  it('metin ölçüm sayıya iner — sürücü `->>` ile string döndürüyor', () => {
    const p = HealthTrendPointSchema.parse({ ...temel, disk: '42', memUsed: '1024', memTotal: '4096', load1: '0.75', cores: '8' });
    expect(p.disk).toBe(42);
    expect(p.load1).toBe(0.75);
    expect(p.cores).toBe(8);
  });
});
