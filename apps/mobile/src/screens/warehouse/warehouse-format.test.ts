import { batchLabel, boxSizeLine, parseDate, parseQty, productLabel, qtyToText, shortDate } from './warehouse-format';
import { warehouseCopy } from './copy';

/*
  BİÇİMLEME BİRİM TESTİ — ekran çizmeden, yalnız kurallar.

  En önemli iddia `parseQty`in `null`/`0` ayrımı: bütün D5 ekranı bu ayrımın üstünde duruyor
  ("0 = geldi ama kayıp; boş = sayılmadı") ve bir gün biri "boşu sıfır sayalım" derse bu dosya
  kırmızıya döner.
*/

describe('parseQty · boş ile sıfır AYRI şeydir', () => {
  it('boş girdi `null` döner — sıfır DEĞİL', () => {
    expect(parseQty('')).toBeNull();
    expect(parseQty('   ')).toBeNull();
  });

  it('sıfır GEÇERLİ bir beyandır', () => {
    expect(parseQty('0')).toBe(0);
  });

  it('işaretli adet okunur (D4 iki yönlüdür)', () => {
    expect(parseQty('-3')).toBe(-3);
    expect(parseQty('12')).toBe(12);
  });

  it('ondalık ve harf reddedilir — adet tamdır', () => {
    expect(parseQty('1,5')).toBeNull();
    expect(parseQty('1.5')).toBeNull();
    expect(parseQty('iki')).toBeNull();
  });

  it('`qtyToText` boşu boş bırakır (yer tutucu görünsün)', () => {
    expect(qtyToText(null)).toBe('');
    expect(qtyToText(0)).toBe('0');
  });
});

describe('SKT çevrimi', () => {
  it('ISO → kısa yazım', () => {
    expect(shortDate('2026-08-12')).toBe('12.08.26');
  });

  it('tanınmayan biçim `null` — uydurma tarih yazılmaz', () => {
    expect(shortDate('12/08/2026')).toBeNull();
  });

  it('noktalı, tireli, iki ve dört haneli yıl kabul edilir', () => {
    expect(parseDate('12.08.2026')).toBe('2026-08-12');
    expect(parseDate('12.8.26')).toBe('2026-08-12');
    expect(parseDate('12-08-2026')).toBe('2026-08-12');
    expect(parseDate('2026-08-12')).toBe('2026-08-12');
  });

  it('TAKVİMDE OLMAYAN gün reddedilir — `Date` sessizce kaydırmasın', () => {
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('00.01.2026')).toBeNull();
  });

  it('boş ve bozuk girdi `null`', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('yarın')).toBeNull();
  });
});

describe('künye yazımı', () => {
  it('parti kodu varsa kodla, yoksa yalnız SKT', () => {
    expect(batchLabel('P-0712', '2026-08-12')).toBe('P-0712 · SKT 12.08.26');
    expect(batchLabel(null, '2026-08-12')).toBe('SKT 12.08.26');
  });

  it('tanınmayan tarih HAM geçer — gizlenmez', () => {
    expect(batchLabel('P-1', 'bilinmiyor')).toBe('P-1 · SKT bilinmiyor');
  });

  it('tek boylu üründe ayraç yazılmaz', () => {
    expect(productLabel('Mantı', '500 g')).toBe('Mantı · 500 g');
    expect(productLabel('Künefe', '')).toBe('Künefe');
  });
});

/*
  KARGO KUTUSU TANITIM SATIRI (07.12) — iki iddia, ikisi de `CLAUDE §1`in aynı kuralı:

  · mm → cm YALNIZ GÖSTERİMDE; kayda giden değer hep mm (ondalık kalınlık yuvarlanmasın diye)
  · `maxContentG: null` = sınır BİLİNMİYOR, sıfır değil — "en çok 0 kg" kutuyu kullanılamaz
    gösterirdi ve bilinmeyen bir sınır uydurulmuş bir sınırdan iyidir
*/
describe('boxSizeLine · ölçü satırı', () => {
  const copy = warehouseCopy.picking.box;
  const karton = { lengthMm: 400, widthMm: 300, heightMm: 250, tareG: 220, maxContentG: 20_000 };

  it('mm santime çevrilir ve dara gram kalır', () => {
    expect(boxSizeLine({ ...karton, maxContentG: null }, copy)).toBe('40×30×25 cm · dara 220 g');
  });

  it('sınır varsa kilo yazılır; tam sayıda ondalık asılmaz', () => {
    expect(boxSizeLine(karton, copy)).toBe('40×30×25 cm · dara 220 g · en çok 20 kg');
    expect(boxSizeLine({ ...karton, maxContentG: 2500 }, copy)).toContain('en çok 2,5 kg');
  });

  it('dara SIFIR meşrudur (poşet/zarf) — satır yine yazılır', () => {
    expect(boxSizeLine({ lengthMm: 350, widthMm: 250, heightMm: 30, tareG: 0, maxContentG: null }, copy)).toBe(
      '35×25×3 cm · dara 0 g',
    );
  });
});
