import {
  breakdownRows,
  breakdownText,
  caseKey,
  quantityTotal,
  setCaseCount,
  EMPTY_BREAKDOWN,
  type CaseSize,
} from './quantity-value';

/*
  ADET DÖKÜMÜNÜN KURALLARI (v3 · `sheetAdet`) — ekrandan ayrı ölçülüyor, çünkü hepsi SAYIM
  kuralı: bir hatası depoda olmayan malın var görünmesi demek.
*/

const KOLI_12: CaseSize = { code: '18691000023757', qtyPerCode: 12 };
const KOLI_24: CaseSize = { code: '18691000047514', qtyPerCode: 24 };

const COPY = { loose: '{n} tek paket', total: '{parts}  =  {n} paket', empty: 'henüz sayılmadı' };

describe('toplam DÖKÜMDEN türer', () => {
  it('koli çarpanla, tek paket birebir sayılır', () => {
    const value = setCaseCount({ ...EMPTY_BREAKDOWN, loose: 3 }, KOLI_12, 2);
    expect(quantityTotal(value)).toBe(27);
  });

  it('hiç sayılmamış döküm sıfırdır — ama "sayılmadı" cümlesini kuran metindir, sayı değil', () => {
    expect(quantityTotal(EMPTY_BREAKDOWN)).toBe(0);
    expect(breakdownText(EMPTY_BREAKDOWN, COPY)).toBe('henüz sayılmadı');
  });

  it('hesap satırı YOLU yazar, yalnız sonucu değil', () => {
    const value = setCaseCount({ ...EMPTY_BREAKDOWN, loose: 3 }, KOLI_12, 2);
    expect(breakdownText(value, COPY)).toBe('2 × 12  +  3 tek paket  =  27 paket');
  });

  it('sıfır sayılmış koli hesaba GİRMEZ — "0 × 12" bir bilgi değil gürültüdür', () => {
    const value = setCaseCount({ ...EMPTY_BREAKDOWN, loose: 2 }, KOLI_12, 0);
    expect(breakdownText(value, COPY)).toBe('2 tek paket  =  2 paket');
  });
});

describe('kayıtlı boy ile sahada eklenen boy AYRI kimliktir', () => {
  it('kayıtlı boy kodundan, sahada eklenen çarpanından tanınır', () => {
    expect(caseKey(KOLI_12)).toBe('18691000023757');
    expect(caseKey({ code: null, qtyPerCode: 12 })).toBe('x12');
  });

  /* Kritik: aynı çarpanlı ama KAYITSIZ bir boy, kayıtlı boyun sayısına eklenmemeli — biri ürünün
     kayıtlı kolisi, öteki depocunun sahada tarif ettiği bir kutu. */
  it('aynı çarpanlı kayıtlı ve kayıtsız boy birbirine karışmaz', () => {
    let value = setCaseCount(EMPTY_BREAKDOWN, KOLI_12, 1);
    value = setCaseCount(value, { code: null, qtyPerCode: 12 }, 2);
    expect(value.cases).toHaveLength(2);
    expect(quantityTotal(value)).toBe(36);
  });

  it('sayılmamış KAYITLI boy listede DURUR — depocu neyin sorulduğunu görmeli', () => {
    const rows = breakdownRows(EMPTY_BREAKDOWN, [KOLI_12, KOLI_24]);
    expect(rows.map((row) => row.qtyPerCode)).toEqual([12, 24]);
    expect(rows.every((row) => row.count === 0)).toBe(true);
  });

  it('sahada eklenen boy kayıtlıların ARDINDAN gelir ve eklenme sırasını korur', () => {
    let value = setCaseCount(EMPTY_BREAKDOWN, { code: null, qtyPerCode: 8 }, 1);
    value = setCaseCount(value, { code: null, qtyPerCode: 3 }, 1);
    const rows = breakdownRows(value, [KOLI_12]);
    expect(rows.map((row) => row.qtyPerCode)).toEqual([12, 8, 3]);
  });

  it('kayıtlı boy iki kez çizilmez — döküm satırı listedeki satırla eşleşir', () => {
    const value = setCaseCount(EMPTY_BREAKDOWN, KOLI_12, 3);
    const rows = breakdownRows(value, [KOLI_12]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(3);
  });
});

describe('sıfıra inen boy', () => {
  it('KAYITLI boy listede kalır — ürünün kutu tipi silinmiş olmaz', () => {
    const value = setCaseCount(setCaseCount(EMPTY_BREAKDOWN, KOLI_12, 2), KOLI_12, 0);
    expect(breakdownRows(value, [KOLI_12])).toHaveLength(1);
  });

  /* Sahada eklenen boy sıfırlanınca DÜŞER: sayısı sıfır olan bir "ürüne kaydedilecek" satırı,
     yanlışlıkla eklendiğinde geri alınamaz bir kalıntı olurdu. */
  it('SAHADA EKLENEN boy dökümden düşer', () => {
    const added = setCaseCount(EMPTY_BREAKDOWN, { code: null, qtyPerCode: 8 }, 1);
    const cleared = setCaseCount(added, { code: null, qtyPerCode: 8 }, 0);
    expect(cleared.cases).toHaveLength(0);
  });

  it('eksiye inilemez — negatif adet bir sayım değil, yazım hatasıdır', () => {
    const value = setCaseCount(EMPTY_BREAKDOWN, KOLI_12, -3);
    expect(quantityTotal(value)).toBe(0);
  });
});
