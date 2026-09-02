import {
  batchLabel,
  boxSizeLine,
  orderPickingQueue,
  parseDate,
  productLabel,
  shortDate,
} from './warehouse-format';
import { warehouseCopy } from './copy';

/*
  BİÇİMLEME BİRİM TESTİ — ekran çizmeden, yalnız kurallar.

  Boş ile sıfır ayrımı (D5: "0 = geldi ama kayıp; boş = sayılmadı") artık burada değil kitin
  sayacında sınanıyor (`stepper-group.test.tsx`, 02.09): adet metinden okunmuyor, sayılıyor.
*/

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

/*
  KUYRUK SIRASI (v3:320) — dipnot "yarım kalan kutu en üstte durur" diye SÖZ VERİYOR ve uç bunu
  yapmıyor (teslim gününe göre sıralıyor). Ölçüldü 30.08, fiziksel cihazda: yarım sipariş dokuz
  satırın sekizincisindeydi. Sözünü tutmayan bir dipnot, olmayan bir kuraldan kötüdür.

  İkinci iddia daha önemli: sıralama KARARLI olmalı — grup içinde ucun teslim-günü sırası bozulursa
  dipnotun İLK yarısı ("teslim gününe göre sıralı") bu kez yalan olur.
*/
describe('orderPickingQueue · yarım kalan en üstte', () => {
  const order = (id: string, picked: number, total: number) => ({ id, pickedLineCount: picked, lineCount: total });

  it('yarım kalan sipariş listenin başına çıkar', () => {
    const sorted = orderPickingQueue([order('a', 0, 1), order('b', 1, 2), order('c', 3, 3)]);

    expect(sorted.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });

  it('grup İÇİNDE ucun sırası korunur (kararlı) — "teslim gününe göre" de bir sözdür', () => {
    const sorted = orderPickingQueue([order('a', 0, 1), order('b', 0, 2), order('c', 1, 2), order('d', 2, 4)]);

    // İki yarım (c, d) ucun sırasıyla başa; kalan ikisi (a, b) yine ucun sırasıyla arkada.
    expect(sorted.map((row) => row.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('hiç yarım yoksa sıra HİÇ değişmez', () => {
    const input = [order('a', 0, 1), order('b', 2, 2), order('c', 0, 3)];

    expect(orderPickingQueue(input).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('girdiyi DEĞİŞTİRMEZ — kopya üzerinde çalışır', () => {
    const input = [order('a', 0, 1), order('b', 1, 2)];
    orderPickingQueue(input);

    expect(input.map((row) => row.id)).toEqual(['a', 'b']);
  });
});
