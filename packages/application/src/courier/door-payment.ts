import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import type { Order, OrderItem } from '@lezzet/types';

/**
 * **KAPIDA TAHSİLAT — TEK HESAP, İKİ OKUYUCU** (21.270 · denetim bulgusu 6'nın kalanı).
 *
 * Hesap `day.ts`in içinde yerel bir fonksiyondu ve rota kartı (`routes.ts`) onu okuyamıyordu — o da
 * kendi süzgecini yazmıştı: `toplam − (tahsil − iade) > 0`. Aradaki fark tek satırdı ama sonucu
 * çelişkiydi: **rota kartı vadeli siparişi "tahsilat" sayıyor, gün ekranı saymıyordu.** Kurye sabah
 * "2 tahsilat" diye seçtiği rotada akşam kapıda konuşulacak para bulamıyordu.
 *
 * Buraya taşındı çünkü bağımlılık TEK YÖNLÜ olmalı: `day.ts` zaten `routes.ts`i çağırıyor
 * (`startCourierDay` → `listCourierRoutes`), yani ters yönde bir import döngü olurdu. Üçüncü bir
 * dosya ikisini de besliyor ve kural tek yerde kalıyor (CLAUDE §1).
 */
/**
 * Kapıda tahsil edilecek tutar. `null` = kapıda para konuşulmaz.
 *
 * ── İKİ ARIZA DÜZELTİLDİ (01.09) ────────────────────────────────────────────────────────────────
 *
 * **(1) VADELİ SİPARİŞ ARTIK MUAF.** Hesap `total − net tahsilat` idi ve `on_account`'a hiç
 * bakmıyordu; alanın künyesi de yalnız tek muafiyet tanıyordu ("önceden ödenmiş"). Sonuç: vade
 * limiti tanımlı, vade günü belli bir B2B siparişinde kuryenin ekranı **"kapıda 234,80 € al"**
 * diyordu. `DOMAIN §7` tersini yazıyor: *"vadeli sipariş… sonra **banka havalesiyle** ödenir ve
 * banka import eşleştirmesinde `paid` olur."* Kurye o kapıdan para istemez; isteseydi restoranın
 * ay sonu mutabakatı bizde bozulurdu.
 *
 * **(2) TABAN ARTIK KARŞILANAN TUTAR.** `order.totalCents` SİPARİŞ EDİLENİ söyler; kısmi
 * karşılamada kapıda ödenecek olan gitmiş maldır. Ölçüldü (`LA-26-93UXKY`): sipariş 46,39 €,
 * teslim edilen 27,29 € — kurye 19,10 € fazla tahsil ederdi. Cevabı motor veriyor
 * (`derivePaymentStatusForOrder`), yani kuryenin gördüğü sayı ile sipariş detayının gösterdiği
 * sayı aynı hesaptan çıkıyor.
 *
 * "Kuruş altı kalıntı sıfır sayılır" kuralı KALKTI (02.9) ve kalkması gerekiyordu: hesap artık
 * tamsayı cent üstünde yapılıyor, yani 0,004 € gibi bir kalıntı ARTIK DOĞAMAZ. O eşik kayan nokta
 * çıkarmasının ürettiği çöpü süpürmek içindi; sebep ortadan kalkınca eşik de bir sayıyı sessizce
 * yutan gereksiz bir kapıya dönüşürdü.
 */
export function amountDueCents(order: Order, lines: readonly OrderItem[]): number | null {
  // Vadeli satışta kapıda tahsilat YOKTUR — borç deftere yazıldı, havaleyle kapanacak.
  if (order.onAccount) return null;

  const dueCents = derivePaymentStatusForOrder(order, lines, {
    collectedCents: order.amountCollectedCents,
    refundedCents: order.amountRefundedCents,
  }).amountToCollectCents;
  return dueCents > 0 ? dueCents : null;
}
