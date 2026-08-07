import { parseLinearGradient } from './gradient';

describe('CSS gradyanı → expo-linear-gradient prop’ları', () => {
  it('rgba renklerini içindeki virgüllere rağmen doğru böler', () => {
    const parsed = parseLinearGradient(
      'linear-gradient(180deg, rgba(21, 23, 15, 0.28), rgba(21, 23, 15, 0) 32%)',
    );

    expect(parsed.colors).toEqual(['rgba(21, 23, 15, 0.28)', 'rgba(21, 23, 15, 0)']);
    expect(parsed.locations).toEqual([0, 0.32]);
  });

  it('yazılmamış uç durakları 0 ve 1 ile doldurur', () => {
    const parsed = parseLinearGradient('linear-gradient(180deg, #000 40%, #fff)');

    expect(parsed.locations).toEqual([0.4, 1]);
  });

  it('aradaki eksik durağı iki komşu arasında eşit aralıklı doldurur', () => {
    const parsed = parseLinearGradient('linear-gradient(180deg, #000, #888, #fff 100%)');

    expect(parsed.locations).toEqual([0, 0.5, 1]);
  });

  it('açıyı başlangıç/bitiş noktasına çevirir', () => {
    expect(parseLinearGradient('linear-gradient(180deg, #000, #fff)').start).toEqual({ x: 0.5, y: 0 });
    expect(parseLinearGradient('linear-gradient(180deg, #000, #fff)').end).toEqual({ x: 0.5, y: 1 });
    expect(parseLinearGradient('linear-gradient(90deg, #000, #fff)').start).toEqual({ x: 0, y: 0.5 });
    expect(parseLinearGradient('linear-gradient(90deg, #000, #fff)').end).toEqual({ x: 1, y: 0.5 });
  });

  it('tanınmayan dizgede sessizce düz renge düşmez, fırlatır', () => {
    expect(() => parseLinearGradient('radial-gradient(#000, #fff)')).toThrow(/linear-gradient/);
    expect(() => parseLinearGradient('linear-gradient(to bottom, #000, #fff)')).toThrow(/deg/);
    expect(() => parseLinearGradient('linear-gradient(180deg, #000)')).toThrow(/iki renk/);
  });
});
