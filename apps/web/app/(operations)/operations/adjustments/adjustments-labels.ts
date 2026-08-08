import type { WarehouseReason } from '@/lib/stock/adjustment';

/**
 * Stoktan düşme masasının sözlüğü (10.5).
 *
 * **İç terim yok** (tasarımın kuralı): "adjustment", "fire", "shrinkage" geçmez — ekranda
 * *"stoktan düş"*, *"stoğa geri al"*, *"son tarihi geçti"* yazar.
 */

/** Dört sebep, depocunun dilinde. `return_restock` YOK — admin istisnası, tipte de yok. */
export const REASON_LABEL: Record<WarehouseReason, string> = {
  expired: 'Son tarihi geçti',
  damaged: 'Hasar',
  count_diff: 'Sayım farkı',
  lost: 'Kayıp',
};

export const ADJ_NOTES = {
  /** Sebep neden zorunlu: rapor bu kayıtlardan çıkar. */
  reasonRequired:
    'Sebep zorunlu — "bu üründen yılda ne kadar çöpe gitti" raporu bu kayıtlardan çıkar; sebepsiz düşüş izi kaybettirir.',
  /** Kayıt anında stok düşer — geri alma yok. */
  immediate: 'Kayıt anında stok düşer. Yanlış giriş için son kaydı düzeltin; toptan geri alma yoktur.',
  /** Para bu yüzeyde yok. */
  noMoney: 'Fire maliyeti ve parasal değer görünmez — para tarafı yöneticinin Stok ekranında.',
  /** Artı yönlü düzeltme buradan YAPILMAZ. */
  positiveElsewhere:
    'Artı yönlü düzeltme buradan yapılmaz — mal kabul ekranı kullanılır. Sayım farkı yalnız eksiye düşer.',
  /** Belge numarası OLAY başınadır, satır başına değil. */
  documentRule:
    'Bir kayıtta birden çok parti düşülebilir; hepsi tek belge numarasını paylaşır. Bir satır tutmazsa hiçbiri yazılmaz.',
  empty: 'Bugün stoktan düşülen bir şey yok.',
  noBatch: 'Elde düşülebilecek parti yok — stok girişi yapılmamış ya da kapsamınızdaki depo boş.',
  /** Sıcaklık kaydı: arka ucu yok. */
  temperaturePending:
    'Sıcaklık kaydı henüz açık değil: ölçüm noktalarını ve dereceyi saklayacak kayıt (`TemperatureLog`) yazılmadı. Bugünkü ölçümleri kâğıda işleyip operasyona bildirin.',
} as const;

/** Partinin son tarih rozeti — geçmiş parti listede kalır ve işaretlenir. */
export function expiryLabel(expiryDate: string, isExpired: boolean): string {
  const gun = new Date(expiryDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  return isExpired ? `son tarih ${gun} · geçti` : `son tarih ${gun}`;
}
