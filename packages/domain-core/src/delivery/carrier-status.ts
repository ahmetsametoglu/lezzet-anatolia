import type { ShipmentStatus } from '@lezzet/types';

/**
 * TAŞIYICI DURUM KODU → BİZİM DURUMUMUZ (saf karar).
 *
 * ── NEDEN SEZGİSEL, VE NEDEN BU DÜRÜST OLAN ─────────────────────────────────
 * Sendcloud'un tam durum kodu listesi **kamuya açık dokümanda YOK** (28.08 taraması: durum
 * değerlerini sayan bir sayfa yok). Elimizde bilinen kodlar ve kalıplar var; küme zamanla
 * loglardan öğrenilecek.
 *
 * **BİLİNMEYEN KOD `null` DÖNER** ve çağıran mevcut durumu KORUR (`CLAUDE §1`: ölçülemeyen değer
 * sıfır değildir). Tahmin eden bir eşleme, siparişi yanlış yere taşır — "teslim edildi" diye
 * işaretlenen bir gönderi kâr snapshot'ı alır, müşteriye teslim maili gider ve geri alınması
 * elle düzeltme ister. Bilinmeyen kod ayrıca DEFTERE YAZILIR (`shipment_event`), böylece eşleme
 * sonradan büyütüldüğünde geçmiş yeniden okunabilir.
 *
 * ── SIRA ÖNEMLİ ─────────────────────────────────────────────────────────────
 * `OUT_FOR_DELIVERY` içinde `DELIVER` geçiyor; `DELIVERED` denetimi önce yapılırsa dağıtıma
 * çıkan koli teslim edilmiş sayılırdı. Terminal hâller en başta, aşamalar sonra.
 */
export function mapCarrierStatus(code: string | null | undefined): ShipmentStatus | null {
  if (!code) return null;
  const c = code.toUpperCase();

  // Terminal hâller önce — biri doğruysa gerisi sorulmaz.
  if (c.includes('CANCEL')) return 'cancelled';
  if (c.includes('RETURN')) return 'returned';
  // "DELIVERY_ATTEMPT" ve "OUT_FOR_DELIVERY" DELIVERED'dan ÖNCE elenmeli (künye: sıra önemli).
  if (c.includes('OUT_FOR_DELIVERY') || c.includes('DELIVERY_ATTEMPT') || c.includes('OUT FOR DELIVERY')) return 'out_for_delivery';
  if (c.includes('DELIVERED')) return 'delivered';

  if (c.includes('TRANSIT') || c.includes('EN_ROUTE') || c.includes('SORT')) return 'in_transit';
  if (c.includes('HANDED') || c.includes('HAND_OVER') || c.includes('COLLECTED') || c.includes('ACCEPTED') || c.includes('PICKED_UP')) {
    return 'handed_over';
  }
  if (c.includes('ANNOUNC') || c.includes('READY_TO_SEND') || c.includes('CREATED') || c.includes('LABEL')) return 'created';
  if (c.includes('ERROR') || c.includes('EXCEPTION') || c.includes('FAIL')) return 'error';

  return null; // bilinmeyen — çağıran mevcut durumu korur ve kodu deftere yazar
}

/** Terminal hâl mi — nöbet cron'u yalnız terminal OLMAYAN gönderileri yoklar. */
export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return status === 'delivered' || status === 'returned' || status === 'cancelled';
}
