import type { MovementDirection, MovementType } from '@lezzet/types';

/**
 * Para hareketi kuralları (12.1) — DOMAIN §9. Saf: yazım BURADA YAPILMAZ, karar verilir.
 *
 * Veritabanı yalnız **veri bozukluğunu** engeller (transferin karşı ucu var mı, tutar pozitif mi).
 * Burada duran şey **anlam**: satış parayı içeri alır, gider dışarı verir; tedarikçiye ödemenin
 * tedarikçisi belli olmalıdır. İhlali bozuk veri değil, YANLIŞ veridir — raporu sessizce kaydırır.
 */

/**
 * Sebep yönü belirler mi? Çoğu tipte evet: sipariş tahsilatı hep giriş, iade hep çıkış. `transfer`
 * ve `misc` serbesttir — transfer iki hesabı birden ilgilendirir (yön gönderenin gözünden yazılır),
 * `misc` zaten "sınıflandırılamayan" demektir.
 */
export function expectedDirection(type: MovementType): MovementDirection | null {
  switch (type) {
    case 'order_payment':
    case 'capital':
      return 'in';
    case 'order_refund':
    case 'purchase':
    case 'expense':
      return 'out';
    default:
      return null;
  }
}

export type MovementCheck =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'amount_not_positive'
        | 'direction_mismatch' // tip yönü belirliyor, verilen yön ona uymuyor
        | 'transfer_needs_counter' // transferin karşı ucu yok
        | 'transfer_same_account' // kendine transfer
        | 'counter_on_non_transfer' // transfer olmayan harekette karşı hesap
        | 'order_link_missing' // tahsilat/iade hangi siparişin?
        | 'supply_link_missing'; // alım hangi girişe/tedarikçiye?
    };

export interface MovementInput {
  accountId: string;
  direction: MovementDirection;
  amount: number;
  type: MovementType;
  counterAccountId?: string | null;
  orderId?: string | null;
  stockIntakeId?: string | null;
  supplierId?: string | null;
}

/**
 * Hareket tutarlı mı. Reddetme bir HATA DEĞERİDİR, fırlatma değil (STACK §8) — çağıran
 * `{data, error}` sözleşmesine çevirir ve kullanıcıya sebebi gösterir.
 */
export function validateMovement(input: MovementInput): MovementCheck {
  if (!(input.amount > 0)) return { valid: false, reason: 'amount_not_positive' };

  const beklenen = expectedDirection(input.type);
  if (beklenen && input.direction !== beklenen) return { valid: false, reason: 'direction_mismatch' };

  if (input.type === 'transfer') {
    if (!input.counterAccountId) return { valid: false, reason: 'transfer_needs_counter' };
    if (input.counterAccountId === input.accountId) return { valid: false, reason: 'transfer_same_account' };
  } else if (input.counterAccountId) {
    return { valid: false, reason: 'counter_on_non_transfer' };
  }

  // Sipariş parası siparişsiz olmaz: `Order.amount_*` cache'i bu bağdan türetilir (12.2). Bağsız
  // tahsilat, siparişin ödemesi görünmeden kasayı şişirirdi.
  if ((input.type === 'order_payment' || input.type === 'order_refund') && !input.orderId) {
    return { valid: false, reason: 'order_link_missing' };
  }

  // Stok alımı ya bir mal kabule ya bir tedarikçiye bağlanır — tedarikçi borcu (Σ giriş − Σ ödeme)
  // ve alım maliyeti bu bağların üstünde durur (12.3).
  if (input.type === 'purchase' && !input.stockIntakeId && !input.supplierId) {
    return { valid: false, reason: 'supply_link_missing' };
  }

  return { valid: true };
}

/**
 * Bir hareketin VERİLEN HESAP için işaretli tutarı. Transferde karşı uçta işaret terstir: para
 * gönderenden çıkar, alana girer.
 *
 * Aynı kural `account_movement` görünümünde SQL olarak da yaşıyor — orası toplama (bakiye) içindir,
 * burası tek satırın önizlemesi (form "bu hareket kasadan −50 € düşecek" der). İkisi aynı üç satırı
 * anlatır; ayrıştıklarında bu fonksiyonun testi sessiz kalmaz.
 */
export function signedAmountFor(
  movement: { accountId: string; counterAccountId?: string | null; direction: MovementDirection; amount: number },
  accountId: string,
): number {
  if (movement.accountId === accountId) return movement.direction === 'in' ? movement.amount : -movement.amount;
  if (movement.counterAccountId === accountId) return movement.direction === 'in' ? -movement.amount : movement.amount;
  return 0; // hareket bu hesaba dokunmuyor
}
