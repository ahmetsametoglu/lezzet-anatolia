import { describe, expect, it } from 'vitest';
import { cellText, decodeTextBytes, findHeaderRow, parseCsv, sheetToRows } from './file';

// Banka dosyasının okunması (12.10): ızgaradan satıra. Motorun sütun tanıma ve satır okuma
// testleri `bank.test.ts`te; burada yalnız "hücreyi bul" katmanı.

describe('CSV okuma', () => {
  it('Fransız bankası: `;` ayırıcı, alıntı içinde ayırıcı ve çift tırnak, CRLF, BOM', () => {
    const text = '\uFEFFDate;Libellé;Montant\r\n12/09/2026;"VIR SEPA ""DUPONT""; ref 123";-45,90\r\n13/09/2026;PRLV;12,00\r\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Libellé', 'Montant'],
      ['12/09/2026', 'VIR SEPA "DUPONT"; ref 123', '-45,90'],
      ['13/09/2026', 'PRLV', '12,00'],
    ]);
  });

  it('virgül ve sekme ayırıcı da tanınır; tamamen boş satır düşer', () => {
    expect(parseCsv('a,b,c\n\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a\tb\tc\n1\t2\t3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('alıntı içindeki satır sonu hücreyi bölmez', () => {
    expect(parseCsv('a;b\n"iki\nsatır";x')).toEqual([['a', 'b'], ['iki\nsatır', 'x']]);
  });
});

describe('ızgaradan satıra', () => {
  it('künye satırları atlanır, başlık ARANIR — "Compte;FR76…;Solde;1 234,56" başlık sayılmaz', () => {
    const matrix = [
      ['Relevé de compte', '', '', ''],
      ['Compte', 'FR76 1234', 'Solde', '1 234,56'],
      [],
      ['Date', 'Libellé', 'Montant', 'Solde'],
      ['12/09/2026', 'VIR SEPA DUPONT', '-45,90', '1 188,66'],
      ['', '', '', ''],
      ['13/09/2026', 'PRLV EDF', '-120,00', '1 068,66'],
    ];
    const sheet = sheetToRows(matrix);
    expect(sheet.headerRowIndex).toBe(3);
    expect(sheet.headers).toEqual(['Date', 'Libellé', 'Montant', 'Solde']);
    expect(sheet.rows).toEqual([
      { Date: '12/09/2026', 'Libellé': 'VIR SEPA DUPONT', Montant: '-45,90', Solde: '1 188,66' },
      { Date: '13/09/2026', 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '1 068,66' },
    ]);
    expect(sheet.blankRows).toBe(1);
  });

  it('xlsx hücreleri: sayı noktalı metin, tarih YEREL gün, eksik hücre boş, boş/yinelenen başlık adlandırılır', () => {
    const matrix = [
      ['Date', '', 'Montant', 'Montant'],
      [new Date(2026, 8, 12), 'VIR', -45.9, 100],
      [new Date(2026, 8, 13), 'PRLV'],
    ];
    const sheet = sheetToRows(matrix);
    expect(sheet.headers).toEqual(['Date', 'Sütun 2', 'Montant', 'Montant (2)']);
    expect(sheet.rows).toEqual([
      { Date: '2026-09-12', 'Sütun 2': 'VIR', Montant: '-45.9', 'Montant (2)': '100' },
      { Date: '2026-09-13', 'Sütun 2': 'PRLV', Montant: '', 'Montant (2)': '' },
    ]);
  });

  it('başlık bulunamazsa boş döner ve bunu söyler (-1) — sessizce sıfır satır değil', () => {
    expect(findHeaderRow([])).toBe(-1);
    expect(sheetToRows([['12/09/2026', '-45,90'], ['13/09/2026', '12,00']])).toMatchObject({ headerRowIndex: -1, rows: [], headers: [] });
  });

  it('hücre metni: Date geçersizse boş, sonsuz sayı boş, boolean metin', () => {
    expect(cellText(new Date('bozuk'))).toBe('');
    expect(cellText(Number.POSITIVE_INFINITY)).toBe('');
    expect(cellText(true)).toBe('true');
    expect(cellText('  x ')).toBe('x');
  });
});

describe('bayt çözme', () => {
  it('UTF-8 olduğu gibi; Latin-1 (Windows-1252) dosyada "é" bozulmaz', () => {
    expect(decodeTextBytes(new TextEncoder().encode('Libellé'))).toBe('Libellé');
    expect(decodeTextBytes(new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]))).toBe('Libellé');
  });
});
