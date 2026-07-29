/**
 * Server Action hata normalizasyonu + sonuç sözleşmesi (referans deseni). Action'lar throw ETMEZ;
 * `{ data, error }` döner — UI hatayı bilinçli gösterir. `getErrorMessage` bilinen Error mesajını,
 * aksi halde genel metni verir (iç detay sızmaz).
 *
 * **İZ BURADA DÜŞÜLÜR.** Normalize edilen hata bir dizeye dönüşüp sonuç nesnesine giriyor; çağıran
 * onu göstermezse (sepet sağlayıcısı yalnız `data` okur) hata **hiçbir yerde** görünmeden kayboluyor.
 * Yaşandı (29.07): sepet okuması eksik bir tablo yüzünden düşüyordu, ekran "sepetiniz şu an
 * getirilemedi" diyordu ve ne sunucu kaydında ne tarayıcı konsolunda tek satır iz vardı — teşhis
 * ancak veritabanına elle bakılarak yapıldı.
 *
 * Doğrulama hataları da (geçersiz dil, eksik alan) buraya düşer ve onlar da yazılır: az gürültü,
 * kaybolan bir arızadan ucuzdur. Kaydı burada tutmanın sebebi tek funnel olması — her `catch`'e
 * ayrı log yazılsaydı biri eksik kalırdı ve eksik kalan hep en çok gereken olurdu.
 *
 * Biçim projenin bugünkü uzlaşısı: `[etiket]` + hata (`lib/order/transition.ts`, `login/actions.ts`).
 * BEKLEYEN(18.5): yapılandırılmış JSON log + kritik hatada alarm — o geldiğinde bu satır ona bağlanır.
 */
export function getErrorMessage(err: unknown): string {
  console.error('[action]', err);
  return err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
}

export type ActionResult<T = null> = { data: T | null; error: string | null };
