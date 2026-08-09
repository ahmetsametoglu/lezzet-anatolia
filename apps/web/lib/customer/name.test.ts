import { describe, expect, it } from 'vitest';
import { customerLabel } from './name';

// Kural tek yerde ve sınaması burada: talep kuyruğu ile talep detayı aynı müşteriyi aynı adla
// anmalı. İki yerde ayrı yazılsaydı biri bir gün boş dizgeyi "ad var" sayardı.

describe('customerLabel', () => {
  it('adı varsa adı — kırpılmış hâliyle', () => {
    expect(customerLabel('  Ayşe Kaya  ', 'ayse@example.com')).toBe('Ayşe Kaya');
  });

  it('AD BOŞ DİZGEYSE e-postaya düşer — kimlik trigger’ı ad vermeyen müşteriye ’’ yazıyor', () => {
    expect(customerLabel('', 'ayse@example.com')).toBe('ayse@example.com');
  });

  it('yalnız boşluktan ibaret ad da "ad yok" sayılır', () => {
    expect(customerLabel('   ', 'ayse@example.com')).toBe('ayse@example.com');
  });

  it('ne ad ne e-posta varsa satır SAHİPSİZ görünmez', () => {
    expect(customerLabel('', null)).toBe('Adsız müşteri');
    expect(customerLabel(null, undefined)).toBe('Adsız müşteri');
  });

  it('e-posta MASKELENMEZ — maskeleme log kuralı, bu personelin çalışma yüzeyi', () => {
    expect(customerLabel(null, 'ayse.kaya@example.com')).toBe('ayse.kaya@example.com');
  });
});
