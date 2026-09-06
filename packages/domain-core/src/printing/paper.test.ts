import { describe, expect, it } from 'vitest';

import { defaultLabelSizeFor, labelSizeMm } from './paper';

describe('defaultLabelSizeFor', () => {
  it('102 mm sınıfı SÜREKLİ RULOYA düşer — kalıp kesime DEĞİL (kullanıcı kararı 06.09)', () => {
    /* Geniş yazıcı taşıyıcının A6 etiketini basıyor (148×105); kalıp kesim boyu SABİT bir
       kâğıttır ve dışarıdan gelen bir etiketi ortasından keserdi. */
    expect(defaultLabelSizeFor('QL-1110NWB')).toBe('RollW103');
    expect(defaultLabelSizeFor('QL-1115NWB')).toBe('RollW103');
  });

  it('62 mm sınıfının üç ailesi de sürekli ruloya düşer', () => {
    expect(defaultLabelSizeFor('QL-820NWB')).toBe('RollW62');
    expect(defaultLabelSizeFor('QL-720NW')).toBe('RollW62');
    expect(defaultLabelSizeFor('QL-600')).toBe('RollW62');
  });

  it('kural İŞE bakmıyor: bir yazıcıda bir rulo var, hangi işe baktığı onu değiştirmez', () => {
    // İmza `purpose` almıyor — bu test o kararın kendisini çiviliyor: aynı model, tek cevap.
    expect(defaultLabelSizeFor('QL-820NWB')).toBe(defaultLabelSizeFor('QL-820NWB'));
  });

  it('tanınmayan model null döner — varsaymak basımı sessizce hataya gönderirdi', () => {
    // Ağda gerçekten duran bir cihaz (ölçüldü 05.09): A4 lazer çok-işlevli, QL etiket hattının değil.
    expect(defaultLabelSizeFor('MFC-9330CDW')).toBeNull();
    expect(defaultLabelSizeFor('PT-P900W')).toBeNull();
    expect(defaultLabelSizeFor('')).toBeNull();
  });

  it('büyük/küçük harf ve boşluk kuralı düşürmez', () => {
    expect(defaultLabelSizeFor('  ql-1110nwb ')).toBe('RollW103');
  });

  it('hiçbir model KALIP KESİME düşmez — boyu sabit kâğıt varsayılmıyor', () => {
    for (const model of ['QL-1110NWB', 'QL-820NWB', 'QL-720NW', 'QL-600']) {
      expect(defaultLabelSizeFor(model)).not.toMatch(/DieCut/);
    }
  });
});

describe('labelSizeMm', () => {
  it('sürekli rulonun BOYU YOKTUR — `null` "bilmiyorum" değil, "içerik belirler" demek', () => {
    expect(labelSizeMm('RollW62')).toEqual({ widthMm: 62, heightMm: null });
    expect(labelSizeMm('RollW103')).toEqual({ widthMm: 103, heightMm: null });
  });

  it('kalıp kesimde iki ölçü de sabit — içerik ona sığmak zorunda', () => {
    expect(labelSizeMm('DieCutW103H164')).toEqual({ widthMm: 103, heightMm: 164 });
    expect(labelSizeMm('DieCutW62H29')).toEqual({ widthMm: 62, heightMm: 29 });
  });

  it('tanınmayan ad null — uydurulmuş ölçü, yanlış boyda etiket demektir', () => {
    expect(labelSizeMm('Bilinmeyen')).toBeNull();
    expect(labelSizeMm('')).toBeNull();
  });
});
