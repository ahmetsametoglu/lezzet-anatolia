import 'server-only';
import { captureError, SOURCES } from '@lezzet/observability';

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
 * **Gözlemlemeye bağlandı (18.5):** iz artık yapılandırılmış log'a VE `error_log` tablosuna gidiyor
 * (`captureError` — önce stdout, sonra DB, asla fırlatmaz). Doğrulama hataları da yazılıyor ve bu
 * listeyi boğmuyor, çünkü aynı parmak izli kayıtlar tek satırda gruplanıyor: bin "geçersiz dil" bir
 * satır. Gruplama olmasaydı bu karar yanlış olurdu.
 *
 * `void` ile ateşlenir: bu fonksiyon SENKRON ve `catch` bloklarının içinde çağrılıyor — beklemek
 * her action'ı hata kaydının hızına bağlardı.
 *
 * **`server-only`:** artık sunucu paketleri (`pino`, Supabase istemcisi) içeriyor. İşaret sınırı
 * zorlar — bir istemci komponenti `getErrorMessage`'ı çağırmaya kalkarsa anlaşılır bir hata alır,
 * paketleyiciden gelen anlaşılmaz bir hata değil. `ActionResult` tipi etkilenmez (tip import'ları silinir).
 */
export function getErrorMessage(err: unknown): string {
  void captureError(err, { source: SOURCES.webAction });
  return err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
}

export type ActionResult<T = null> = { data: T | null; error: string | null };
