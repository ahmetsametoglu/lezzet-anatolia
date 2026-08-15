import type { Locale } from '@lezzet/i18n';
import type { PointsReason } from '@lezzet/types';

import type { PointsHistoryEntry } from '@/lib/api/points';
import { formatOrderDate } from '@/screens/orders/order-format';

/*
  AYNI GÜN + AYNI SEBEP TEK SATIRDA (kullanıcı isteği 15.08: *"bu lezzet oylarının hepsi teker teker
  değil de birleşik gelse olmaz mı?"*).

  ── NEDEN BİRLEŞTİRME BİLGİ KAYBETMİYOR ─────────────────────────────────────
  Satırın gösterdiği üç şey var: sebep · tarih · tutar. Bir keşif turunun sekiz oyunda üçü de aynı
  ("Yeni lezzet oyu · 15 Ağu 2026 · +2"), yani satırları birbirinden ayıran HİÇBİR ŞEY yok. Oyun
  hangi ürüne verildiği zaten gösterilmiyor — `refId` sözleşmede bilerek dışarıda (iç kimlik,
  müşterinin açabileceği bir şeye işaret etmiyor). Sekiz özdeş satır bilgi değil GÜRÜLTÜDÜR ve
  arşivde asıl aranan şeyi (davet ödülü, kupona çevirme) aşağı iter.

  **Defterde birleştirme YOK ve olamaz:** tekillik `(müşteri, sebep, kaynak)` üçlüsünde ve "aynı
  ürüne bir kez puan" kuralı oradan geliyor. Bu dosya yalnız GÖRÜNÜMÜ kuruyor.

  ── KURAL TEK, SEBEP AYRIMI YOK ─────────────────────────────────────────────
  "Şu sebepler birleşsin, şunlar birleşmesin" diye bir liste tutulmuyor: ölçüt sebep değil,
  AYIRT EDİLEBİLİRLİK. Ekranda özdeş görünen iki satır hangi sebepten olursa olsun tek satırdır;
  günde bir kez yazılan `visit` zaten hiç birleşmez (birleşecek ikinci satırı yok).

  ── GRUP ANAHTARI, GÖRÜNEN TARİHTİR ─────────────────────────────────────────
  Ham damganın gün parçası değil, ekrana YAZILAN tarih (`formatOrderDate`) anahtar: cihazın saat
  dilimi ile sunucununki ayrıştığında "aynı gün yazıyor ama ayrı gruplar" gibi bir tuhaflık
  doğmasın. Kullanıcının gördüğü şey neyse, gruplama da odur.

  ── SIRA KORUNUR: YALNIZ ARDIŞIK SATIRLAR BİRLEŞİR ──────────────────────────
  Liste yeniden eskiye sıralı geliyor, yani aynı gün+sebep satırları zaten yan yana. Ardışık
  birleştirme ile küresel gruplama bu sırada AYNI sonucu verir — ama ardışık olanı seçmek, sıra bir
  gün değişirse listeyi sessizce yeniden dizmemeyi garanti eder.

  ── SON GRUP BÜYÜYEBİLİR ────────────────────────────────────────────────────
  Sayfa sınırı bir grubun ortasına düşerse kuyruktaki grup "3 hareket" görünür, sonraki sayfa
  gelince "8"e çıkar. Bu bir yalan değil, henüz tamamlanmamış bir sayıdır ve sonsuz kaydırmada
  kullanıcı zaten oraya vardığında devamı yükleniyor. Alternatifi (son grubu hiç çizmemek) listenin
  sonunu boş göstermek olurdu.
*/

export interface PointsHistoryGroup {
  /** Liste anahtarı — grubun İLK (en yeni) satırının kimliği; damga+sebepten türetmeye gerek yok. */
  id: string;
  reason: PointsReason;
  /** Ekrana yazılan tarih — anahtarın kendisi, ikinci kez biçimlendirilmez. */
  date: string;
  /** Grubun TOPLAM tutarı (işaretli). */
  points: number;
  /** Kaç defter hareketi — 1 ise ekran sayıyı hiç yazmaz. */
  count: number;
}

export function groupPointsHistory(entries: readonly PointsHistoryEntry[], locale: Locale): PointsHistoryGroup[] {
  const groups: PointsHistoryGroup[] = [];

  for (const entry of entries) {
    const date = formatOrderDate(entry.at, locale);
    const last = groups[groups.length - 1];

    if (last !== undefined && last.reason === entry.reason && last.date === date) {
      last.points += entry.points;
      last.count += 1;
      continue;
    }

    groups.push({ id: entry.id, reason: entry.reason, date, points: entry.points, count: 1 });
  }

  return groups;
}
