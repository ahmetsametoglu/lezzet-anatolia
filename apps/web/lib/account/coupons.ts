import 'server-only';
import { listCustomerCoupons as listCoupons, type CustomerCoupon } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * Müşterinin KULLANILABİLİR kişisel kuponları — hesaptaki "Kuponlarım" kutusunun kaynağı (17.5).
 *
 * ── BU DOSYA ARTIK BİR KÖPRÜ, KURALIN KENDİSİ DEĞİL (09.08) ─────────────────
 * Kural `@lezzet/application`'a terfi etti (21.17, mobil şeridi) ama web kendi kopyasını
 * TUTMAYA DEVAM ETTİ ve iki uygulama yan yana yaşadı: aynı üç eleme, iki dosyada, iki `CustomerCoupon`
 * tipiyle. Ölçüldü — gövdeler birebir aynıydı.
 *
 * Bugün kupon penceresi düzeltilirken (08.5) tehlike görünür oldu: **tek kopyayı düzeltmek, ötekini
 * bozuk bırakmak** demekti. Web hesabı doğru listeyi gösterirken native uygulama eksik gösterirdi ve
 * ikisi de "kuponlarım" diyordu. Kopya silindi; burada yalnız oturum kapısı ve istemci kalıyor.
 *
 * Tip de tek kaynaktan geliyor — ikinci bir `CustomerCoupon` tanımı, bir gün ayrışacak iki
 * sözleşmeydi.
 */
export type { CustomerCoupon };

export function listCustomerCoupons(customerId: string): Promise<CustomerCoupon[]> {
  return listCoupons(serviceDb(), customerId);
}
