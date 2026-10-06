/**
 * Siparişin canlı kanalının adı; kanal veri taşımaz, yalnız "yeniden oku" der. Zili webhook da zamanlayıcı da çaldığı için ad tek
 * yerde durur; dosya bağımlılıksız, çünkü tarayıcıdaki dinleyici de bu alt yoldan okur.
 */
export function orderChannelName(orderId: string): string {
  return `order:${orderId}`;
}
