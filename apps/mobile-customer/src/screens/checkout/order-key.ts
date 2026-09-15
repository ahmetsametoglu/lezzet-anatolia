/*
  AYNI SİPARİŞİ İKİ KEZ AÇMANIN PANZEHİRİ — istemcinin ürettiği tekrar anahtarı.

  Anahtar müşterinin bastığı DÜĞMEYE aittir (sözleşme künyesi, `CheckoutOrderBodySchema`): ekran
  açılışında BİR KEZ üretilir ve seçimler değişse de KORUNUR — çift dokunuş, ağın yeniden denemesi
  ve arka plandan dönüşte yeniden kurulan ekran aynı niyettir. Sunucu aynı anahtarla ikinci kez
  sipariş AÇMAZ, açılmış olanı döndürür.

  ── RASTGELELİK ─────────────────────────────────────────────────────────────
  Üretici ortak (`lib/random-key.ts`, 21.313'te buradan ayrıldı; kaynağın ölçümü orada). **Bu bir
  güvenlik anahtarı DEĞİL, bir tekrar bileti:** kimseye yetki vermez, yalnız "bu istek az önceki
  isteğin aynısı mı" sorusunu cevaplar. Yine de anahtarın sunucudaki araması MÜŞTERİYE SÜZÜLMÜYOR
  (`OrderService.findByIdempotencyKey`) — çakışan bir anahtar başkasının siparişini döndürürdü; bu
  yüzden uzunluk ve rastgelelik cömert tutuldu ve durum yöneticiye raporlandı.
*/

import { randomKey } from '@/lib/random-key';

/** Yeni bir tekrar anahtarı — sözleşmenin sınırları içinde (8–64 hane). */
export function newOrderKey(): string {
  return randomKey();
}
