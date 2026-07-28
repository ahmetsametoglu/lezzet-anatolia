import { fromCents } from '@lezzet/helper';

/**
 * Operasyon yüzeyinin sayı/tarih biçimleri — TEK kaynak.
 *
 * Beş ayrı dosyada `toFixed(2).replace('.', ',')` yazılıydı: aynı karar beş yerde tutulunca biri
 * "12,60 €" derken öbürü "12,60" diyordu ve fark ancak ekranda görülüyordu. Para tamsayı CENT'te
 * taşınır (STACK §8); biçimlendirme yalnız sunum anında yapılır.
 */

/** "12,60 €" — cent girer, okunur tutar çıkar. `null` bilinmiyor demektir, sıfır değil. */
export function money(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `${fromCents(cents).toFixed(2).replace('.', ',')} €`;
}

/** "12,60" — para birimi SİMGESİZ (sütun başlığı zaten "€" diyorsa simge iki kez yazılmasın). */
export function amount(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return fromCents(cents).toFixed(2).replace('.', ',');
}

/**
 * "%18" · `digits=1` ile "%15,3". Basamak PARAMETRİK, çünkü iki farklı iş var: raf ömrü yüzdesi bir
 * karar eşiğidir (tam sayı yeter), marj ise ölçüdür ve ondalığı bilgi taşır.
 */
export function percent(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  return `%${value.toFixed(digits).replace('.', ',')}`;
}

/**
 * "22 Tem 2026" — kısa ve okunur. Tarih **UTC** okunur: parti son tarihi bir gündür, yerel saat
 * dilimine çevrilirse akşam saatlerinde bir gün geriye kayar ve "bugün son gün" yazan satır
 * "dün bitti"ye dönüşürdü.
 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "22 Tem 14:30" — hareket kayıtlarında saat de gerekir (aynı gün iki kayıt ayırt edilsin). */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Son tarihe kalan süreyi operatörün diliyle söyler. Mutlak tarih tek başına yetmiyor: "3 gün kaldı"
 * ile "12 Ağustos" arasındaki fark, aciliyetin okunup okunmamasıdır.
 */
export function daysLabel(days: number): string {
  if (days === 0) return 'bugün son gün';
  if (days === 1) return 'yarın son gün';
  if (days > 0) return `${days} gün kaldı`;
  if (days === -1) return 'dün geçti';
  return `${Math.abs(days)} gün geçti`;
}
