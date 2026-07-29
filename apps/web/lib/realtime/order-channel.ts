/**
 * Bir siparişin canlı kanalı — **kapı zili, veri borusu değil.**
 *
 * Ödeme onayı bize Stripe webhook'uyla gelir ve o çağrı müşterinin tarayıcısından bağımsızdır:
 * müşteri onay ekranında "onaylanıyor" yazısına bakarken sipariş arka planda kesinleşir ve ekran
 * bunu ancak elle yenilenince görürdü.
 *
 * **Neden `postgres_changes` DEĞİL.** Projede hiç RLS yok; her okuma sunucuda, service-role ile
 * yapılıyor (STACK §6). Tarayıcıyı `order` tablosuna abone etmek o duvarda ilk delik olurdu —
 * tablo yayına açılır, satır güvenliği yazmak zorunda kalırdık ve bir yanlış politika bütün
 * siparişleri açardı. Broadcast'te tablo hiç görünmez: sunucu boş bir "değişti" mesajı atar,
 * tarayıcı da bunu duyunca sayfayı SUNUCUDAN yeniden ister. Veri yine tek kapıdan çıkar.
 *
 * Kanal adı siparişin kimliğidir (UUID): tahmin edilemez ve zaten mesaj taşımadığı için duyulması
 * da bir şey söylemez.
 */
export function orderChannelName(orderId: string): string {
  return `order:${orderId}`;
}

/** Tek olay adı: "bir şey değişti". Ne değiştiği söylenmez — cevabı sunucu render'ı verir. */
export const ORDER_CHANGED_EVENT = 'changed';
