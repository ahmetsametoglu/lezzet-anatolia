import type { CustomerOrderStatus, OrderStatus } from '@lezzet/types';

/**
 * Sipariş durumunun müşteriye görünen karşılığı (08.5) — saf karar, DB'siz.
 *
 * Dokuz iç durum altı kategoriye iner. Daraltma bilinçlidir ve tasarımın kuralıdır: *"iç durum
 * adları ve durum makinesinin ara halleri görünmez — müşteri dilinde az sayıda hal yeter."*
 *
 * Birleşen iki çift:
 * - `preparing` + `ready` → **hazırlanıyor.** "Hazır" depo için bir aşamadır (paket toplandı,
 *   araca bekliyor); müşteri için henüz değişen bir şey yok — siparişi hâlâ yola çıkmamıştır.
 * - `delivered` + `completed` → **teslim edildi.** `completed` bir MUHASEBE kapanışıdır (tahsilat
 *   mutabık). Müşteriye "tamamlandı" demek, elindeki paketi aldıktan sonra bir şey daha
 *   beklediğini düşündürürdü.
 *
 * **`draft` için `null` döner ve bu bir hata değil, cevabın kendisidir:** taslak henüz bir sipariş
 * değil (checkout yarıda kalmış). Ona uydurma bir müşteri hâli vermek — "alındı" demek — müşteriye
 * vermediği bir siparişi göstermek olurdu. Çağıran onu listeden düşürür.
 */
export function customerOrderStatus(status: OrderStatus): CustomerOrderStatus | null {
  switch (status) {
    case 'draft':
      return null;
    case 'confirmed':
      return 'received';
    case 'preparing':
    case 'ready':
      return 'preparing';
    case 'out_for_delivery':
      return 'on_the_way';
    case 'delivered':
    case 'completed':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    case 'returned':
      return 'returning';
  }
}

/**
 * Sipariş müşteri için hâlâ "akıyor" mu — liste bunu en üstte ve yeşil çerçeveyle ayırır
 * (tasarım: *"aktif sipariş listenin en üstünde, yeşil çerçeveyle ayrışır"*).
 *
 * Ölçüt "kapanmış mı" değil **"beklediğim bir şey var mı"**: teslim edilmiş sipariş de iptal de
 * iade de kapanmıştır — müşterinin takip edeceği bir hareket kalmamıştır. İade sürecini aktif
 * saymadık: orada topu müşteri değil biz taşıyoruz, ve listede yeşil çerçeve "yolda" beklentisi
 * yaratırdı.
 */
export function isActiveForCustomer(status: CustomerOrderStatus): boolean {
  return status === 'received' || status === 'preparing' || status === 'on_the_way';
}
