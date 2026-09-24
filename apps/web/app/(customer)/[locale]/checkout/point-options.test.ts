import { describe, expect, it } from 'vitest';
import { openingLines } from './checkout-types';

describe('openingLines — teslim noktasının saatleri', () => {
  const sabah = ['08:00 - 12:00', '14:00 - 18:00'];

  it('aynı saatlere sahip ardışık günler tek satırda, farklı gün ayrı satırda', () => {
    const saatler = { '0': sabah, '1': sabah, '2': sabah, '3': sabah, '4': sabah, '5': ['09:00 - 12:00'], '6': [] };
    expect(openingLines(saatler, 'tr', 'kapalı')).toEqual(['Pzt–Cum 08:00 - 12:00, 14:00 - 18:00', 'Cmt 09:00 - 12:00', 'Paz kapalı']);
  });

  it('araya giren farklı gün birleşmeyi böler — uzak günler aynı saatte olsa da birleşmez', () => {
    const saatler = { '0': sabah, '1': [], '2': sabah, '3': sabah, '4': sabah, '5': sabah, '6': sabah };
    expect(openingLines(saatler, 'tr', 'kapalı')).toEqual(['Pzt 08:00 - 12:00, 14:00 - 18:00', 'Sal kapalı', 'Çar–Paz 08:00 - 12:00, 14:00 - 18:00']);
  });

  it('hiç saat bildirilmediyse bilinmiyor döner, "kapalı" değil', () => {
    expect(openingLines({ '0': [], '1': [] }, 'tr', 'kapalı')).toBeNull();
    expect(openingLines(null, 'tr', 'kapalı')).toBeNull();
  });
});
