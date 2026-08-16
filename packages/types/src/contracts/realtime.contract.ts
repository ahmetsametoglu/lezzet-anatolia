/*
  CANLI ZİLİN İSTEMCİYE BAKAN YÜZÜ — ad ve olay, **tek kaynak.**

  Zili ÇALAN taraf `@lezzet/application/realtime/bell.ts`tir ve orada kalır: `node:crypto` ve
  service-role anahtarı kullanır, istemci paketine hiç girmemeli. Ama zili DUYAN taraf artık iki
  ayrı istemci — web bileşenleri ve NATIVE UYGULAMA — ve mobil `@lezzet/application`a bağımlı
  DEĞİL (bilerek: o paket sunucu sırları taşıyor).

  Kanal adını ve olay adını mobilde yeniden yazmak, aynı sözleşmenin ikinci kopyası olurdu; biri
  değiştiği gün zil sessizce çalmaz olur ve **hiçbir test kırılmaz** (CLAUDE §1). Sözleşme bu
  yüzden buraya kondu: `@lezzet/types` hem sunucunun hem iki istemcinin ortak bağımlılığı.

  Şema YOK, çünkü doğrulanacak bir gövde yok: zilin yükü tanım gereği BOŞ. Burada yaşayan şey bir
  veri şekli değil, iki tarafın üzerinde anlaştığı iki dizge.
*/

/**
 * Zilin olay adı. "changed" der, NE değiştiğini SÖYLEMEZ — mesajın boş kalması kanalın güvenlik
 * dayanağıdır (gerekçesi `bell.ts` künyesinde: kanal, adını bilen herkese açıktır).
 */
export const BELL_EVENT = 'changed';

/**
 * TEK BİR TALEBİN MÜŞTERİ KANALI — adı talebin UUID'sidir.
 *
 * Sipariş zilinin (`orderChannelName`) aynı kalıbı ve aynı gerekçesi: ortada doğal bir sır var,
 * tahmin edilemez. Operasyon kuyruğunun kanalı BAŞKADIR ve sunucudaki sırdan türer — orada böyle
 * bir kimlik yok (`ticketsChannelName` künyesi).
 *
 * Yük boş olduğu için, adı ele geçiren biri "bu talepte bir hareket oldu"dan fazlasını öğrenemez;
 * mesajı okumak için yine guard'lı uçtan geçmek zorundadır.
 */
export function ticketChannelName(ticketId: string): string {
  return `ticket:${ticketId}`;
}
