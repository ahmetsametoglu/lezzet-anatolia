import { describe, expect, it } from 'vitest';
import { heuristicColumnMapper } from './column-mapping';
import { fingerprintRows } from './fingerprint';
import { isUnambiguous, suggestOrderMatches, type MatchCandidate } from './match';
import { parseAmountCents, parseBankRows, parseDate, type ParseProfile } from './parse';

/**
 * Banka import motoru (12.4). Doğrulanan üç şey — üçü de "sessiz yanlış"a karşı:
 * 1. **Sütun tanıma**: bakiyeyi tutar sanmak bütün ekstreyi çöpe çevirir.
 * 2. **Mükerrer koruması**: aynı satır iki kez yazılırsa her bakiye yalan söyler; ama aynı gün
 *    çekilen iki ayrı 20 € de gerçekten iki harekettir, biri yutulamaz.
 * 3. **Eşleştirme**: yanlış eşleşme parayı başka siparişin ödemesi yapar.
 */

// ── Sütun tanıma ────────────────────────────────────────────────────────────

describe('sütun tanıma (yapay zekânın yerini tutan sezgisel)', () => {
  it('Fransız bankası: işaretli tek tutar sütunu, virgüllü ondalık, gün/ay', () => {
    const suggestion = heuristicColumnMapper([
      { header: 'Date', values: ['13/07/2026', '15/07/2026'] },
      { header: 'Libellé', values: ['VIR SEPA LA-26-7K4M2P', 'PRLV EDF'] },
      { header: 'Montant', values: ['45,90', '-120,00'] },
      { header: 'Solde', values: ['1234,56', '1114,56'] },
    ]);

    expect(suggestion.amountMode).toBe('signed');
    expect(suggestion.mapping).toMatchObject({ date: 'Date', label: 'Libellé', amount: 'Montant' });
    expect(suggestion.decimalSeparator).toBe(',');
    expect(suggestion.dateFormat).toBe('dmy');
    expect(suggestion.missing).toEqual([]);
  });

  it('BAKİYE sütunu tutar sanılmaz — sanılsaydı bütün ekstre çöp olurdu', () => {
    const suggestion = heuristicColumnMapper([
      { header: 'Date', values: ['13/07/2026'] },
      { header: 'Libellé', values: ['VIR SEPA'] },
      { header: 'Solde', values: ['1234,56'] },
      { header: 'Montant', values: ['45,90'] },
    ]);

    expect(suggestion.mapping.amount).toBe('Montant');
  });

  it('borç/alacak geleneği tanınır — iki sütun da adıyla oturursa', () => {
    const suggestion = heuristicColumnMapper([
      { header: 'Datum', values: ['2026-07-13'] },
      { header: 'Buchungstext', values: ['Überweisung'] },
      { header: 'Soll', values: ['120,00'] },
      { header: 'Haben', values: ['45,90'] },
    ]);

    expect(suggestion.amountMode).toBe('debit_credit');
    expect(suggestion.mapping).toMatchObject({ debit: 'Soll', credit: 'Haben', amount: null });
    expect(suggestion.dateFormat).toBe('ymd');
  });

  it('tanınmayan zorunlu alan SESSİZ KALMAZ — eksik listesiyle döner', () => {
    const suggestion = heuristicColumnMapper([{ header: 'Kolon1', values: ['abc', 'def'] }]);
    expect(suggestion.missing).toContain('date');
    expect(suggestion.missing).toContain('amount');
  });

  it('güven düşükse ekranda işaretlenebilsin diye alan başına raporlanır', () => {
    const suggestion = heuristicColumnMapper([
      { header: 'Date', values: ['13/07/2026'] },
      { header: 'X', values: ['bir açıklama'] },
      { header: 'Y', values: ['45,90'] },
    ]);

    expect(suggestion.confidence.date).toBeGreaterThan(0.9); // adı da biçimi de tarih
    expect(suggestion.confidence.amount).toBeLessThan(0.6); // yalnız biçimden tahmin
  });
});

// ── Hücre okuma ─────────────────────────────────────────────────────────────

describe('para ve tarih okuma', () => {
  it('binlik ayırıcı, para simgesi ve boşluk temizlenir', () => {
    expect(parseAmountCents('1.234,56 €', ',')).toBe(123456);
    expect(parseAmountCents('1 234,56', ',')).toBe(123456);
    expect(parseAmountCents('1,234.56', '.')).toBe(123456);
    expect(parseAmountCents('-45,90', ',')).toBe(-4590);
  });

  it('MUHASEBE PARANTEZİ eksi demektir — düz okuma onu artı sayardı', () => {
    expect(parseAmountCents('(120,00)', ',')).toBe(-12000);
  });

  it('okunamayan hücre null döner, 0 değil — 0 sessizce "bedava" demek olurdu', () => {
    expect(parseAmountCents('n/a', ',')).toBeNull();
    expect(parseAmountCents('', ',')).toBeNull();
  });

  it('tarih düzeni profilden gelir; olmayan gün reddedilir', () => {
    expect(parseDate('13/07/2026', 'dmy')).toBe('2026-07-13');
    expect(parseDate('2026-07-13', 'ymd')).toBe('2026-07-13');
    expect(parseDate('07/13/2026', 'mdy')).toBe('2026-07-13');
    // 31 Şubat sessizce 3 Mart'a kaymaz.
    expect(parseDate('31/02/2026', 'dmy')).toBeNull();
  });
});

const PROFILE: ParseProfile = {
  amountMode: 'signed',
  mapping: { date: 'Date', label: 'Libellé', amount: 'Montant', debit: null, credit: null, reference: null },
  decimalSeparator: ',',
  dateFormat: 'dmy',
};

describe('satır okuma', () => {
  it('işaret YÖNE çevrilir, tutar pozitif kalır (12.1 kuralı)', () => {
    const { rows } = parseBankRows(
      [
        { Date: '13/07/2026', 'Libellé': 'VIR SEPA', Montant: '45,90' },
        { Date: '14/07/2026', 'Libellé': 'PRLV EDF', Montant: '-120,00' },
      ],
      PROFILE,
    );

    expect(rows[0]).toMatchObject({ valueDate: '2026-07-13', amount: 45.9, direction: 'in' });
    expect(rows[1]).toMatchObject({ valueDate: '2026-07-14', amount: 120, direction: 'out' });
  });

  it('borç/alacak geleneğinde yön SÜTUNDAN gelir', () => {
    const { rows } = parseBankRows(
      [
        { Datum: '2026-07-13', Text: 'Überweisung', Soll: '', Haben: '45,90' },
        { Datum: '2026-07-14', Text: 'Miete', Soll: '120,00', Haben: '' },
      ],
      {
        amountMode: 'debit_credit',
        mapping: { date: 'Datum', label: 'Text', amount: null, debit: 'Soll', credit: 'Haben', reference: null },
        decimalSeparator: ',',
        dateFormat: 'ymd',
      },
    );

    expect(rows[0]).toMatchObject({ amount: 45.9, direction: 'in' });
    expect(rows[1]).toMatchObject({ amount: 120, direction: 'out' });
  });

  it('okunamayan satır SESSİZCE ATLANMAZ, sebebiyle döner', () => {
    const { rows, failures } = parseBankRows(
      [
        { Date: '13/07/2026', 'Libellé': 'iyi satır', Montant: '10,00' },
        { Date: 'gecersiz', 'Libellé': 'kötü tarih', Montant: '10,00' },
        { Date: '13/07/2026', 'Libellé': 'kötü tutar', Montant: 'n/a' },
        { Date: '13/07/2026', 'Libellé': 'sıfır', Montant: '0,00' },
      ],
      PROFILE,
    );

    expect(rows).toHaveLength(1);
    expect(failures.map((f) => f.reason)).toEqual(['bad_date', 'bad_amount', 'zero_amount']);
    expect(failures[0]!.rowIndex).toBe(1); // hangi satır olduğu da belli
  });
});

// ── Mükerrer koruması ───────────────────────────────────────────────────────

describe('parmak izi — mükerrer koruması', () => {
  const ACCOUNT = 'acc-1';
  const row = (over: Partial<{ valueDate: string; amount: number; direction: 'in' | 'out'; label: string }> = {}) => ({
    valueDate: '2026-07-13', amount: 20, direction: 'out' as const, label: 'RETRAIT DAB', reference: null, ...over,
  });

  it('aynı dosya iki kez okunursa AYNI kimlikler çıkar — ikinci yükleme yazamaz', () => {
    const first = fingerprintRows(ACCOUNT, [row(), row({ amount: 45.9, direction: 'in' })]);
    const second = fingerprintRows(ACCOUNT, [row(), row({ amount: 45.9, direction: 'in' })]);

    expect(second.map((r) => r.fingerprint)).toEqual(first.map((r) => r.fingerprint));
  });

  it('aynı gün aynı tutarlı İKİ GERÇEK hareket ayrışır — biri yutulmaz', () => {
    const [left, right] = fingerprintRows(ACCOUNT, [row(), row()]);
    expect(left!.fingerprint).not.toBe(right!.fingerprint);
  });

  it('çakışan dönem yeniden yüklenince aynı satırlar aynı kimliği alır', () => {
    // Ocak dosyası: 13 Temmuz'da iki çekim. Şubat dosyası aynı iki satırı yeniden içeriyor.
    const january = fingerprintRows(ACCOUNT, [row(), row(), row({ valueDate: '2026-07-20' })]);
    const february = fingerprintRows(ACCOUNT, [row(), row(), row({ valueDate: '2026-08-02' })]);

    expect(february[0]!.fingerprint).toBe(january[0]!.fingerprint);
    expect(february[1]!.fingerprint).toBe(january[1]!.fingerprint);
    expect(february[2]!.fingerprint).not.toBe(january[2]!.fingerprint); // farklı gün, farklı satır
  });

  it('BAŞKA HESAPTA aynı satır ayrı harekettir', () => {
    const left = fingerprintRows('acc-1', [row()]);
    const right = fingerprintRows('acc-2', [row()]);
    expect(left[0]!.fingerprint).not.toBe(right[0]!.fingerprint);
  });

  it('açıklamadaki boşluk/aksan farkı kimliği değiştirmez', () => {
    const left = fingerprintRows(ACCOUNT, [row({ label: 'VIR  SEPA  Café' })]);
    const right = fingerprintRows(ACCOUNT, [row({ label: 'vir sepa cafe' })]);
    expect(left[0]!.fingerprint).toBe(right[0]!.fingerprint);
  });
});

// ── Eşleştirme ──────────────────────────────────────────────────────────────

describe('eşleştirme önerisi', () => {
  const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
    orderId: 'o1', referenceNo: 'LA-26-7K4M2P', outstandingCents: 4590, saleDate: '2026-07-13', ...over,
  });
  const row = (over: Partial<{ valueDate: string; amount: number; direction: 'in' | 'out'; label: string }> = {}) => ({
    valueDate: '2026-07-13', amount: 45.9, direction: 'in' as const, label: 'VIR SEPA LA-26-7K4M2P', ...over,
  });

  it('referans açıklamada geçiyorsa güçlü öneri çıkar', () => {
    const [suggestion] = suggestOrderMatches(row(), [candidate()]);
    expect(suggestion!.orderId).toBe('o1');
    expect(suggestion!.reasons).toContain('reference_in_label');
    expect(suggestion!.score).toBeGreaterThan(0.9);
  });

  it('referans yoksa tutar + tarih ile de öneri çıkar, ama daha zayıf', () => {
    const [suggestion] = suggestOrderMatches(row({ label: 'VIREMENT RECU' }), [candidate()]);
    expect(suggestion!.reasons).toEqual(expect.arrayContaining(['exact_amount', 'same_day']));
    expect(suggestion!.score).toBeLessThan(0.9);
  });

  it('PARA ÇIKIŞI sipariş tahsilatı olarak önerilmez', () => {
    expect(suggestOrderMatches(row({ direction: 'out' }), [candidate()])).toEqual([]);
  });

  it('tamamı tahsil edilmiş sipariş candidate değildir (çağıran süzer) — açık bakiye 0 ise puan almaz', () => {
    const suggestions = suggestOrderMatches(row({ label: 'VIREMENT RECU' }), [candidate({ outstandingCents: 0 })]);
    expect(suggestions).toEqual([]);
  });

  it('küçük fark tolere edilir — banka masrafı eşleşmeyi öldürmesin', () => {
    const [suggestion] = suggestOrderMatches(row({ amount: 45.6, label: 'VIREMENT' }), [candidate()]);
    expect(suggestion?.reasons).toContain('close_amount');
  });

  it('iki candidate birbirine yakınsa ÖNERİ TEK BAŞINA SAYILMAZ — otomatik onay teklif edilmez', () => {
    const suggestions = suggestOrderMatches(row({ label: 'VIREMENT RECU' }), [
      candidate({ orderId: 'o1' }),
      candidate({ orderId: 'o2' }),
    ]);

    expect(suggestions).toHaveLength(2);
    expect(isUnambiguous(suggestions)).toBe(false);
  });

  it('tek güçlü candidate varsa net kabul edilir', () => {
    expect(isUnambiguous(suggestOrderMatches(row(), [candidate()]))).toBe(true);
    expect(isUnambiguous([])).toBe(false);
  });

  it('uzak tarihli sipariş eşik altında kalır', () => {
    const suggestions = suggestOrderMatches(row({ label: 'VIREMENT' }), [candidate({ saleDate: '2026-01-01' })]);
    expect(suggestions).toEqual([]);
  });
});
