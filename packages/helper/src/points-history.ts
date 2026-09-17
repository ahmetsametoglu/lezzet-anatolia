/**
 * Puan geçmişinin görünümü: aynı gün, aynı sebep ve aynı işaretli ardışık hareketler tek satırda toplanır, çünkü ekranda
 * birbirinden ayırt edilemeyen satırlar bilgi değil gürültüdür. İşaret anahtarın parçasıdır; kazanç ile iptali toplamak olanı
 * gizlerdi.
 */
export interface PointsHistoryGroup<R extends string> {
  /** Grubun ilk (en yeni) hareketinin kimliği — liste anahtarı. */
  id: string;
  reason: R;
  /** Ekrana yazılan tarih; anahtar da budur, cihaz ile sunucunun saat dilimi aynı günü ayrı gruplamasın. */
  date: string;
  /** Grubun işaretli toplamı. */
  points: number;
  /** Kaç hareket; 1 ise ekran sayıyı yazmaz. */
  count: number;
}

/** Yalnız ardışık satırlar birleşir: liste yeniden eskiye sıralı gelir ve sıra değişirse görünüm sessizce yeniden dizilmez. */
export function groupPointsHistory<E extends { id: string; reason: string; points: number }>(
  entries: readonly E[],
  dateOf: (entry: E) => string,
): PointsHistoryGroup<E['reason']>[] {
  const groups: PointsHistoryGroup<E['reason']>[] = [];

  for (const entry of entries) {
    const date = dateOf(entry);
    const last = groups[groups.length - 1];

    if (last !== undefined && last.reason === entry.reason && last.date === date && last.points < 0 === entry.points < 0) {
      last.points += entry.points;
      last.count += 1;
      continue;
    }

    groups.push({ id: entry.id, reason: entry.reason, date, points: entry.points, count: 1 });
  }

  return groups;
}
