import { centsToAmountText, dayLabel, parseAmountToCents, shortName, signedMoney, turkishUpper } from './courier-format';

/*
  Biçimleme kuralları SAF olduğu için ayrı ve ucuz ölçülüyor: üç ekran testinin hepsinde aynı
  çevrimler geçiyor ve bir hatası ekranda "yanlış ama düzgün görünen" bir sayı olarak çıkardı.

  İçerik özeti ayrıştırmasının testleri 21.10e'de KALDIRILDI: kural kalktı (kalem satırları artık
  sözleşmeden geliyor), dolayısıyla ölçecek bir şey de kalmadı.
*/

describe('gün adı', () => {
  it('Türkçe ay adıyla ve büyük harfle yazar', () => {
    expect(dayLabel('2026-08-08')).toBe('8 AĞUSTOS');
    expect(dayLabel('2026-04-01')).toBe('1 NİSAN');
  });

  it('tanınmayan biçimde UYDURMAZ, null döner', () => {
    expect(dayLabel('08.08.2026')).toBeNull();
    expect(dayLabel('2026-13-01')).toBeNull();
  });
});

describe('Türkçe büyük harf', () => {
  it('noktalı/noktasız i ayrımını korur — `toUpperCase` tek başına yanlış olurdu', () => {
    expect(turkishUpper('Ali Yılmaz')).toBe('ALİ YILMAZ');
    expect('Ali Yılmaz'.toUpperCase()).not.toBe(turkishUpper('Ali Yılmaz'));
  });
});

describe('kısa ad', () => {
  it('soyadı baş harfe iner', () => {
    expect(shortName('Musa Kaya')).toBe('Musa K.');
    expect(shortName('  Ayşe Nur Demir ')).toBe('Ayşe Nur D.');
  });

  it('tek kelimelik ad olduğu gibi kalır', () => {
    expect(shortName('Musa')).toBe('Musa');
  });
});

describe('tutar çevrimi', () => {
  it('virgülü de noktayı da kabul eder', () => {
    expect(parseAmountToCents('42,50')).toBe(4250);
    expect(parseAmountToCents('42.50')).toBe(4250);
    expect(parseAmountToCents('7')).toBe(700);
  });

  it('boş ve bozuk girdide SIFIR değil null döner', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('  ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('4,2,5')).toBeNull();
  });

  it('cent → metin çevrimi simgesiz ve virgüllüdür', () => {
    expect(centsToAmountText(4200)).toBe('42,00');
    expect(centsToAmountText(0)).toBe('0,00');
  });
});

describe('işaretli fark', () => {
  /* Simge ile sayı arasındaki boşluk BÖLÜNMEYENDİR (`@lezzet/helper`ın kararı: satır sonu tutarı
     ikiye ayırmasın) ve kaynakta kaçış dizisiyle yazılır — düz metne gömülü bir U+00A0, dosyayı
     açan kişiye sıradan boşluk gibi görünürdü. Karşılaştırma onu düz boşluğa indirir: ölçülen şey
     İŞARET, tipografi değil; boşluğun kendisi ayrıca aşağıda doğrulanıyor. */
  const NBSP = ' ';
  const plain = (value: string): string => value.split(NBSP).join(' ');

  it('eksi eksik teslim, artı fazla para — mutlak değere İNDİRGENMEZ', () => {
    expect(plain(signedMoney(-350))).toBe('−3,50 €');
    expect(plain(signedMoney(1200))).toBe('+12,00 €');
    expect(plain(signedMoney(0))).toBe('0,00 €');
  });

  it('eksi işareti U+2212, tire DEĞİL — rakamla aynı genişlikte durur ve sütun hizası bozulmaz', () => {
    expect(signedMoney(-350).startsWith('−')).toBe(true);
    expect(signedMoney(-350)).toContain(NBSP);
  });
});
