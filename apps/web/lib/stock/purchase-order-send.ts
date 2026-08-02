import 'server-only';
import { PurchaseOrderService, constraintOf, serviceDb } from '@lezzet/database';
import { purchaseOrderReferenceNo } from '@lezzet/domain-core';
import type { PurchaseOrder } from '@lezzet/types';

/**
 * Tedarik siparişinin GÖNDERİLDİ işareti + numarasının üretilmesi (09.14 · operasyon talebi §3).
 *
 * **Uygulama katmanı, çünkü iki katmanı birleştiriyor** (`STACK §4`): numarayı motor üretir
 * (`generateReferenceNo` — rastgelelik orada), benzersizliği veritabanı tutar (unique indeks).
 * Servis ikisini de bilmez; ortada duran bu dosya bilir.
 *
 * **Numara gönderimde doğar, açılışta değil.** Taslak bizim içimizde bir hazırlık; numara karşı
 * tarafa verilen sözdür. Siparişteki "ilk kalıcı durum" kuralının buradaki karşılığı `sent` —
 * açılıp vazgeçilen taslaklar numara tüketmez.
 */

/**
 * Çarpışmada kaç kez yeniden denenir. Alfabe 26 karakter, uzunluk 6 → 3×10⁸ olasılık; iki denemede
 * çarpışma pratikte imkânsız, ama "imkânsız" bir sayı değil bir varsayımdır. Üç deneme sonunda hâlâ
 * çarpışıyorsa hata yukarı gider — sessizce numarasız göndermek, veritabanı kısıtının reddettiği
 * şeyi uygulamanın kabul etmesi olurdu.
 */
const MAX_ATTEMPTS = 3;

export async function sendPurchaseOrder(orderId: string): Promise<PurchaseOrder> {
  const orders = new PurchaseOrderService(serviceDb());
  const year = new Date().getFullYear();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await orders.markSent(orderId, purchaseOrderReferenceNo(year));
    } catch (error) {
      // **"Önce sorgula, boşsa yaz" DEĞİL:** iki eşzamanlı gönderim aynı anda sorgularsa ikisi de
      // "boş" görür ve ikisi de yazar. Karar veritabanında kalır, biz reddi yakalarız.
      const collided = constraintOf(error) === 'purchase_order_reference_no_key';
      if (!collided || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  // Ulaşılamaz: döngü ya döner ya fırlatır. Derleyici için.
  throw new Error('purchase_order: benzersiz numara üretilemedi');
}
