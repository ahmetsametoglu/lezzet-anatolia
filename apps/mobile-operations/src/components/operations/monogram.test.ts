import { monogramOf } from './monogram';

describe('monogramOf', () => {
  it('ilk iki kelimenin baş harfini alır', () => {
    expect(monogramOf('Fıstıklı Baklava')).toBe('FB');
  });

  it('üçüncü kelimeyi almaz — monogram iki harftir', () => {
    expect(monogramOf('Antep Fıstığı Ezmesi')).toBe('AF');
  });

  it('tek kelimede tek harf döner', () => {
    expect(monogramOf('Şöbiyet')).toBe('Ş');
  });

  /*
    TÜRKÇE BÜYÜK HARF — dosyanın var oluş sebebi. `toUpperCase()` burada "I" üretir ve depocu
    rafta olmayan bir harf arar; katalogda "İçli Köfte" ve "İzmir Kurabiyesi" gerçek adlardır.
  */
  it('noktalı i büyürken noktasını korur', () => {
    expect(monogramOf('İçli Köfte')).toBe('İK');
    expect(monogramOf('İzmir Kurabiyesi')).toBe('İK');
  });

  it('araya kaçmış fazla boşluk harf üretmez', () => {
    expect(monogramOf('Su  Böreği')).toBe('SB');
  });

  it('adsız satırda harf UYDURMAZ', () => {
    expect(monogramOf('')).toBe('');
    expect(monogramOf('   ')).toBe('');
  });

  /*
    HARFLE BAŞLAMAYAN KELİME (04.09) — operasyon adı "Ürün (boy)" biçiminde; tek kelimelik üründe
    ikinci kelime parantez ya da rakam çıkıyordu ("K(", "M·"). İşaret monogram değildir, atlanır.
  */
  it('parantez ve rakamla başlayan kelimeyi atlar, sıradaki harfli kelimeyi alır', () => {
    expect(monogramOf('Künefe (2 kişilik)')).toBe('KK');
    expect(monogramOf('Mantı · 500 g')).toBe('MG');
    expect(monogramOf('Su Böreği (1 kg)')).toBe('SB');
  });
});
