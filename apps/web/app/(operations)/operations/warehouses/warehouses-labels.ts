import type { OpsTone } from '@/components/operation/ui/tone';
import { WEEKDAYS } from '@/components/operation/form/calendar-math';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import type { ClosureWeight, WarehouseAddressView, WarehouseRowView } from './warehouses-types';

// Depolar ekranının SÖZLÜĞÜ — etiket ve renk kararları tek yerde. Sayı biçimlendirme burada YOK:
// o `components/operation/ui/format` işidir ve ekranlar arası ortaktır.

/**
 * ISO gün (1=Pazartesi … 7=Pazar) → kısaltma. Takvimin sözlüğünü PAYLAŞIR (`WEEKDAYS`), ikinci bir
 * gün adı dizisi yazmaz: bir ekranın "Cmt", ötekinin "Ct" dediği bir sistem, aynı günü iki ad
 * altında konuşur. Tasarım çizimi üç harfli yazıyor — sapma bilinçli ve tek harfliktir.
 */
function weekdayLabel(iso: number): string {
  return WEEKDAYS[iso - 1] ?? String(iso);
}

/** Bölgenin gün şeridi; gün verilmemişse `null` — "her gün" DEĞİL, "henüz belirlenmedi". */
export function weekdayList(weekdays: readonly number[]): string[] {
  return [...weekdays].sort((a, b) => a - b).map(weekdayLabel);
}

/** Deponun durumu — üç hâl: aktif · kurulumu eksik · kapalı. Sıra ağırlığa göre okunur. */
export function statusLabel(row: Pick<WarehouseRowView, 'isActive' | 'setupGap'>): string {
  if (!row.isActive) return 'Kapalı';
  return row.setupGap ? 'Kurulumu eksik' : 'Aktif';
}

export function statusTone(row: Pick<WarehouseRowView, 'isActive' | 'setupGap'>): OpsTone {
  if (!row.isActive) return 'neutral';
  return row.setupGap ? 'amber' : 'olive';
}

/**
 * Adresin okunur hâli — iki satır: sokak / kod + şehir + ülke.
 *
 * Adres YOKSA `null` döner ve ekran o zaman adres yazmaz. Boş bir satır çizmek "adres girilmiş ama
 * boş" gibi okunurdu; eksiklik kendi cümlesiyle söylenir.
 */
function addressLines(address: WarehouseAddressView, countryCode: keyof typeof COUNTRY_LABELS): string[] | null {
  if (!address) return null;
  const second = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [address.line1, `${second} · ${COUNTRY_LABELS[countryCode]}`].filter((line) => line.trim().length > 0);
}

/** Tek satırlık adres (liste satırı) — ayraç `·` çünkü satır sarılabilir. */
export function addressOneLine(address: WarehouseAddressView, countryCode: keyof typeof COUNTRY_LABELS): string | null {
  const lines = addressLines(address, countryCode);
  return lines ? lines.join(' · ') : null;
}

/** Kapatma sonucunun ağırlığı — sıralamayı ve rengi belirler; etiket kullanıcıya bunu söyler. */
export const CLOSURE_WEIGHT_LABEL: Record<ClosureWeight, string> = {
  hardest: 'EN SERT',
  heavy: 'AĞIR',
  pending: 'BEKLEYEN',
};

export const CLOSURE_WEIGHT_TONE: Record<ClosureWeight, OpsTone> = {
  hardest: 'red',
  heavy: 'amber',
  pending: 'blue',
};

/** Sıralama ölçütü: en sert önce. Liste bir uyarı listesi; en ağır sonuç en üstte durmalı. */
export const CLOSURE_WEIGHT_ORDER: Record<ClosureWeight, number> = { hardest: 0, heavy: 1, pending: 2 };

/**
 * Posta kodunun ekrandaki hâli. Ülke eki YALNIZ deponun kendi ülkesinden farklıysa yazılır: bölge
 * sınır ötesi olabilir (Strasbourg rotası Kehl'i kapsayabilir) ve orada ülke ayırt edicidir; aynı
 * ülkede ise her kodun yanına "FR" yazmak on iki kez tekrarlanan bir gürültüdür.
 */
export function postalCodeLabel(
  pick: { country: keyof typeof COUNTRY_LABELS; postalCode: string },
  homeCountry: keyof typeof COUNTRY_LABELS,
): string {
  return pick.country === homeCountry ? pick.postalCode : `${pick.postalCode} (${pick.country})`;
}
