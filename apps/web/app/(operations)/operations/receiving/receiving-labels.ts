import type { OpsTone } from '@/components/operation/ui/tone';
import type { IntakeRow, PendingPurchase } from './receiving-types';

/**
 * Mal kabul masasının sözlüğü (10.4).
 *
 * **Kural seti tasarımın kendi başlığından:** *"fiyat alanı yok, depo kimlikten ya da açık seçimden
 * gelir, kısa raf ömrü uyarısı engellemez, fark hata değildir."* Dördü de aşağıdaki metinlerde
 * yazılı — çünkü depocunun ekranda okuduğu şey kuralın kendisidir, kodun içindeki değil.
 */

/** Bekleyen sipariş kartının ikinci satırı: "TS-042 · 5 kalem · 3 gün". */
export function pendingSummary(purchase: PendingPurchase): string {
  const parts = [purchase.referenceNo ?? 'referanssız', `${purchase.missingLineCount} kalem bekliyor`];
  // Yaş ÖLÇÜLEMEDİYSE yazılmaz — "0 gün" bugün gönderilmiş göstermek olurdu (`CLAUDE §1`).
  if (purchase.ageDays !== null) parts.push(purchase.ageDays === 0 ? 'bugün gönderildi' : `${purchase.ageDays} gündür bekliyor`);
  return parts.join(' · ');
}

/** Kısmen gelmiş sipariş ayrı işaretlenir: kalanı aynı yerden açılacak. */
export function pendingBadge(purchase: PendingPurchase): { label: string; tone: OpsTone } | null {
  if (!purchase.isPartial) return null;
  return { label: 'kısmi geldi', tone: 'amber' };
}

/**
 * Satırın durum hücresi — tasarımın "girildi · −4 · +6 · Gelmedi" sütunu.
 *
 * **Fark HATA DEĞİLDİR** ve rengi de onu söylüyor: eksik/fazla amber (dikkat), kırmızı değil.
 * Kırmızı yazsaydık depocu her farkta bir şeyi yanlış yaptığını sanırdı — oysa tedarikçi eksik ya
 * da fazla göndermiş olabilir ve kayıt yalnızca gerçeği yazıyor.
 */
export function rowStatus(row: IntakeRow): { label: string; tone: OpsTone } | null {
  if (row.isMissing) return { label: 'Gelmedi', tone: 'red' };
  if (row.receivedQty === null) return null;
  if (row.expectedQty === null) return { label: 'girildi', tone: 'olive' };

  const fark = row.receivedQty - row.expectedQty;
  if (fark === 0) return { label: 'girildi', tone: 'olive' };
  return { label: fark > 0 ? `+${fark}` : `${fark}`, tone: 'amber' };
}

export const RECEIVING_NOTES = {
  empty: 'Kabul bekleyen tedarik siparişi yok. Siparişsiz gelen mal için "Boş formla kabul" kullanın.',
  pick: 'Soldan kabul edilecek siparişi seçin; kalemleri beklenen adetleriyle burada açılır.',
  /** Depo süzgeci YOK — depocu kendi evreninde çalışır (tasarımın kuralı). */
  noWarehouseFilter: 'Depo süzgeci yok — başka deponun stoğu bu ekranda görünmez.',
  /** Siparişsiz kabul: sonradan eşleştirme YOK, karar girişte verilir. */
  freeForm: 'Sipariş kaydı olmayan alım — kamyondan inen neyse o girilir; sonradan siparişle eşleştirilmez.',
  /** Klavye birinci giriş yolu (tasarımın etkileşim sözleşmesi). */
  keyboard: 'Tab sonraki alan · Enter satırı onaylar ve alta geçer · tarih GG/AA/YYYY',
  /** Boş satır ile "gelmedi" AYRI şeylerdir. */
  missingRule:
    'Gelmeyen kalemi boş bırakmayın, "Gelmedi" işaretleyin — boş satır "henüz saymadım" demektir ve yarım kabul tam sanılır.',
  /** Fiyat neden yok: alımın para tarafı başka ekranın işi. */
  noPrice: 'Fiyat alanı yok — alımın para tarafı yöneticinin Tedarik ekranında gider olarak kaydedilir.',
  /** Girişin birimi HER ZAMAN satılan paket. */
  packageUnit: 'Girişin birimi her zaman satılan paket; dökme yardımcısı yalnız hesap yapar.',
  /** MLOR: uyarır, engellemez (DOMAIN §4). */
  shortLife: 'Bu parti kısa ömürlü geldi — kalan raf ömrü beklenenden az. Kabul kararı sizin; uyarı engellemez.',
  /** Kabul sonrası ne olur: mal aynı anda satılabilir hâle gelir. */
  afterAccept: 'Kabul edilen kalemler bu anda satılabilir stoğa ve hazırlık önerilerine yansır.',
  /** Depo ön seçimi YOK (yönetici) — tasarım bunu ayrıca vurguluyor. */
  warehouseChoice:
    'Hangi depoya kabul ediliyor? Ön seçim yok: bağlam "Tüm depolar" olsa bile form varsayılan üretmez.',
  /** Katalogda olmayan ürün girilmez — ürün tanımı admin işi. */
  catalogOnly: 'Ürün katalogdan seçilir; katalogda olmayan ürün girilmez — ürün tanımı yöneticinin işidir.',
} as const;
