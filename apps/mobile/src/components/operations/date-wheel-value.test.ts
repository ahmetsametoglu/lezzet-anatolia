import {
  clampDay,
  dayRange,
  daysInMonth,
  fromIsoDate,
  quickPicks,
  toIsoDate,
  yearRange,
} from './date-wheel-value';

/*
  TARİH SEÇİCİNİN KURALLARI — ekrandan ayrı ölçülüyor: hepsi tarih kuralıdır ve bir hatası rampada
  yanlış SKT, yani yanlış zamanda imha ya da satılan bozuk mal demektir.
*/

describe('ayın uzunluğu', () => {
  it('artık yılı sayar — seçicide yıl da seçildiği için 29 Şubat gerçekten gelebilir', () => {
    expect(daysInMonth(2, 2028)).toBe(29);
    expect(daysInMonth(2, 2026)).toBe(28);
    expect(daysInMonth(4, 2026)).toBe(30);
    expect(daysInMonth(12, 2026)).toBe(31);
  });
});

describe('gün kırpma', () => {
  /* 31 Ocak'tan Şubat'a geçen seçici "31 Şubat"ta kalamaz. Klavyeyle yazarken bu hata yapılabilir
     ve yakalanması gerekiyordu; seçicide hiç doğmuyor. */
  it('ay kısaldığında gün son güne iner', () => {
    expect(clampDay({ day: 31, month: 2, year: 2026 })).toEqual({ day: 28, month: 2, year: 2026 });
    expect(clampDay({ day: 31, month: 4, year: 2026 })).toEqual({ day: 30, month: 4, year: 2026 });
  });

  it('sığan gün DOKUNULMAZ', () => {
    expect(clampDay({ day: 15, month: 2, year: 2026 })).toEqual({ day: 15, month: 2, year: 2026 });
  });

  it('artık yılda 29 Şubat KIRPILMAZ', () => {
    expect(clampDay({ day: 29, month: 2, year: 2028 })).toEqual({ day: 29, month: 2, year: 2028 });
  });
});

describe('ISO çevrimi', () => {
  it('tek haneli gün ve ay sıfırla yazılır — sözleşmenin biçimi', () => {
    expect(toIsoDate({ day: 5, month: 3, year: 2026 })).toBe('2026-03-05');
  });

  it('geri çevrim aynı hâli verir', () => {
    expect(fromIsoDate('2026-03-05')).toEqual({ day: 5, month: 3, year: 2026 });
  });

  it('takvimde OLMAYAN tarih tanınmaz — null döner, düzeltilmez', () => {
    expect(fromIsoDate('2026-02-31')).toBeNull();
    expect(fromIsoDate('2026-13-01')).toBeNull();
    expect(fromIsoDate('05.03.2026')).toBeNull();
  });
});

describe('sütunlar', () => {
  it('gün sütunu ayın gerçek uzunluğu kadar — "31 Şubat" listede HİÇ yok', () => {
    expect(dayRange({ day: 1, month: 2, year: 2026 })).toHaveLength(28);
    expect(dayRange({ day: 1, month: 1, year: 2026 })).toHaveLength(31);
  });

  /* Geçmiş yıl SUNULMAZ: SKT geleceğe bakar. Geçmiş tarihli mal gelirse o karar sayım/düzeltmenin
     işidir — burada geçmişi kolay yazılır kılmak yanlışı kolaylaştırmak olurdu. */
  it('yıl sütunu BU yıldan başlar ve ileri gider', () => {
    const years = yearRange(new Date(2026, 7, 30));
    expect(years[0]).toBe(2026);
    expect(years).toHaveLength(6);
    expect(years.some((y) => y < 2026)).toBe(false);
  });
});

describe('hızlı seçim çipleri', () => {
  /* İlk çip ÖLÇÜLMÜŞ olandır: ürünün raf ömrü biliniyorsa "bugün üretilmiş" varsayımının tarihi.
     Bilinmiyorsa çizilmez — uydurma bir "beklenen SKT" doğrulanmış bir tarih gibi görünürdü. */
  it('raf ömrü biliniyorsa ilk çip onun tarihidir', () => {
    const picks = quickPicks(new Date(2026, 7, 30), 90);
    expect(picks[0]?.label).toContain('90 gün');
    expect(toIsoDate(picks[0]!.value)).toBe('2026-11-28');
  });

  it('raf ömrü bilinmiyorsa o çip HİÇ çizilmez', () => {
    const picks = quickPicks(new Date(2026, 7, 30), null);
    expect(picks.some((p) => p.label.includes('raf ömrü'))).toBe(false);
    expect(picks).toHaveLength(3);
  });

  it('ay eklerken ayın son günü TAŞMAZ — 31 Ocak + 1 ay Şubat sonudur', () => {
    const picks = quickPicks(new Date(2026, 0, 31), null);
    // +3 ay → 30 Nisan (31 Nisan yok)
    expect(toIsoDate(picks[0]!.value)).toBe('2026-04-30');
  });
});
