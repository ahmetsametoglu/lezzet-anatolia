import type { ParsedBankRow } from '@lezzet/types';
import type { ParsedRow } from './parse';

/**
 * **Mükerrer koruması** (12.4) — banka import'unun en kritik parçası.
 *
 * Aynı ekstre iki kez yüklenirse ya da dönemler çakışırsa (1–31 Ocak, sonra 15 Ocak–15 Şubat) para
 * iki kez yazılır; o andan sonra her bakiye ve her kâr raporu yalan söyler. Bankalar satır kimliği
 * VERMEZ, o yüzden kimliği biz üretiriz.
 *
 * Naif bir "tarih + tutar + açıklama" özeti YETMEZ: aynı gün çekilen iki ayrı 20 €'luk nakit
 * gerçekten iki ayrı harekettir, biri sessizce yutulurdu. Bu yüzden parmak izine **tekrar sırası**
 * (`occurrence`) girer: dosyadaki birinci 20 € ile ikincisi ayrı kimliklerdir, ama dosya yeniden
 * yüklendiğinde ikisi de kendi eşiyle çakışır ve hiçbiri tekrar yazılmaz.
 */

/** Açıklamayı kimlik için sadeleştir — banka aynı satırı ay sonunda fazladan boşlukla verebilir. */
function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Basit, sabit bir özet (FNV-1a 32 bit → base36). Kriptografik güvenlik GEREKMEZ: bu bir kimlik,
 * sır değil. Aranan şey **belirlilik** — aynı girdi her makinede, her sürümde aynı çıktıyı versin.
 */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Satırlara parmak izi basar. **Sıra önemlidir:** `occurrence` dosyadaki görülme sırasından gelir,
 * o yüzden aynı ekstre aynı sırayla verildiğinde aynı kimlikler üretilir.
 *
 * `accountId` kimliğin içindedir: aynı tutar aynı gün iki farklı hesapta olabilir ve bunlar ayrı
 * hareketlerdir.
 */
export function fingerprintRows(accountId: string, rows: readonly ParsedRow[]): ParsedBankRow[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const seed = [
      accountId,
      row.valueDate,
      row.amount.toFixed(2),
      row.direction,
      normalizeLabel(row.label),
    ].join('|');

    const occurrence = seen.get(seed) ?? 0;
    seen.set(seed, occurrence + 1);

    return { ...row, fingerprint: `${hash(seed)}-${occurrence}` };
  });
}
