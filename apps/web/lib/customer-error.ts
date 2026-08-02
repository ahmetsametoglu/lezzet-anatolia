import 'server-only';
import { captureError, SOURCES } from '@lezzet/observability';

/**
 * **Müşteri yüzeyinin hata kapısı** — metin değil ANAHTAR döndürür (denetim H1/H2, 03.08).
 *
 * ## Neden ayrı bir kapı
 *
 * `lib/error.ts`'in künyesi *"iç detay sızmaz"* diyordu; kodu tersini yapıyordu — `Error` türevi
 * olan her şey mesajını aynen geçiriyor, jenerik metin yalnız `Error` OLMAYAN fırlatmalara
 * kalıyordu. Pratikte fırlatılan her şey `Error`. Sonuç: müşteri, kısıt adını
 * (`duplicate key value violates unique constraint "address_…"`), şema hatasını ya da iç önekli
 * mesajları (`[reserve] sipariş bulunamadı: <uuid>`) ekranında görebiliyordu.
 *
 * Denetim "varsayılanı tersine çevir" dedi; **çevrilemez**: `getErrorMessage` PAYLAŞILAN bir kapı,
 * operasyon yüzeyinde de 12 dosya çağırıyor ve **personelin iç mesajı görmesi doğru davranıştır.**
 * Tek kapıya bayrak eklemek de çözüm değil — bayrağı unutan ilk çağrı sızıntıyı geri getirir (aynı
 * sınıfın iki kaydı: `19.7`'nin `recordDemand` kararı, denetim `K2`).
 *
 * Bu yüzden ayrım **kapıda**: müşteri action'ı bu funnel'ı çağırır, operasyon ötekini. Yanlış
 * funnel'ı çağırmak import satırında görünür — bir bayrağın unutulması görünmez.
 *
 * ## Sözleşme
 *
 * Bilinen, müşteriye SÖYLENMEK İSTENEN hata `CustomerError` ile fırlatılır ve anahtarını taşır.
 * Geri kalan HER ŞEY `unexpected`e düşer; ham mesaj yalnız `error_log`'a gider (o kanal 18.5'te
 * kuruldu, maskelemesi 03.08'de tamamlandı).
 *
 * **Metin ekranda yaşar, burada değil.** Bu dosya `server-only`; çeviriyi buraya taşımak sunucuya
 * sayfa sözlüğü taşımak olurdu. Ekran anahtarı kendi `messages.json`'undan okur — jenerik cümle
 * dahil. Denetimin ikinci maddesi (jenerik metnin Türkçe sabit olması) böylece kendiliğinden
 * kapanıyor: çevrilecek hiçbir cümle sunucuda kalmıyor.
 *
 * Desen yeni değil, projede iki yerde zaten doğru çalışıyor (`authErrorMessage` · checkout
 * `t.rejected.*`). Genelleşmesi gereken oydu.
 */
export class CustomerError extends Error {
  constructor(readonly key: string) {
    // `message` anahtarın kendisi: `error_log`'a düşen kayıt da okunabilir kalsın.
    super(key);
    this.name = 'CustomerError';
  }
}

/** Her yüzeyin sözlüğünde bulunması ZORUNLU anahtarlar. */
export const SHARED_ERROR_KEYS = ['unexpected', 'session_expired'] as const;

/**
 * Anahtarı çıkarır ve izi düşer. `getErrorMessage` ile aynı iz sözleşmesi — kayıt kaybolmaz,
 * değişen tek şey müşterinin GÖRDÜĞÜ.
 */
export function customerErrorKey(err: unknown): string {
  void captureError(err, { source: SOURCES.webAction });
  return err instanceof CustomerError ? err.key : 'unexpected';
}

/** Müşteri yüzeyinin sonuç sözleşmesi — `error: string` yerine `errorKey`. */
export type CustomerResult<T = null> = { data: T | null; errorKey: string | null };
