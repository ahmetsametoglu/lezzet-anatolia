/**
 * Siparişin canlı kanalı veri taşımaz, yalnız "değişti" der ve tarayıcı sayfayı sunucudan yeniden ister. `postgres_changes`
 * kullanılmaz, çünkü tabloyu yayına açmak satır güvenliği gerektirirdi; kanal adı tahmin edilemeyen sipariş kimliğidir.
 */
export { orderChannelName } from '@lezzet/application/realtime/order-channel';
