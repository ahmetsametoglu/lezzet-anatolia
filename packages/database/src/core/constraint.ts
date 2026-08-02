/**
 * Veritabanı kısıtının ADINI hatadan çıkarır (operasyon şeridinin talebi §7).
 *
 * **Neden ad, cümle değil:** kısıt DB'de duruyor ve ihlal edildiğinde Postgres İngilizce bir cümle
 * fırlatıyor (`duplicate key value violates unique constraint "warehouse_single_online"`). O cümle
 * `getErrorMessage` funnel'ından geçip olduğu gibi ekrana düşüyordu — operatör bir indeks adı
 * okuyordu. Ayrım `healthSignals`'ınkiyle aynı: **hangi kuralın tuttuğu veri katmanının bilgisi, o
 * kuralın nasıl anlatılacağı arayüzün işi.** Cümleyi servise koymak bir kısıtı bir dile bağlamak
 * olurdu.
 *
 * **Ölçüldü, varsayılmadı** (yerel DB, 02.08). PostgREST hatası yapılandırılmış bir `constraint`
 * alanı TAŞIMIYOR; ad yalnız `message` içinde ve tırnak içinde geçiyor:
 *
 * ```
 * 23505 → duplicate key value violates unique constraint "warehouse_single_online"
 * 23514 → new row for relation "postal_code_place" violates check constraint "postal_code_place_point"
 * ```
 *
 * Talep "mesajı regex'leme" diyordu ve gerekçesi doğruydu — ama kırılgan olan şey mesajın NESRİ,
 * tırnak içindeki tanımlayıcı değil: Postgres o cümleyi yerelleştirir (`lc_messages`), biçim
 * dizesindeki `"%s"` her dilde yerinde kalır. Bu yüzden burada nesir değil **tırnaklı tanımlayıcı**
 * aranıyor, ve hangi hatada ad taşındığı `code`'a bakılarak kararlaştırılıyor.
 */

/**
 * Ad taşıyan hata sınıfları. Liste kapalı ve bilerek: `23502` (not-null) bu listede YOKTUR çünkü
 * mesajı bir kısıt adı taşımaz — son tırnaklı tanımlayıcı ilişkinin adıdır ve onu kısıt sanmak,
 * ekranı olmayan bir kurala göre konuşturmak olurdu.
 */
const NAMED: Record<string, true> = {
  '23505': true, // unique_violation
  '23503': true, // foreign_key_violation
  '23514': true, // check_violation
  '23P01': true, // exclusion_violation
};

/** Mesajdaki SON tırnaklı tanımlayıcı — 23514 iki tane taşır (ilki tablo, ikincisi kısıt). */
const QUOTED = /"([^"]+)"/g;

/**
 * Kısıt adı, ya da `null`.
 *
 * `null` "kural ihlali yok" demek DEĞİL, "bu hatanın adı yok" demektir: RPC'lerin kendi
 * `raise exception`'ları (`P0001`) serbest metin taşır ve ekran onları bugünkü gibi gösterir.
 * O yolun okunur karşılığı ayrı bir iştir — mesajı burada tahmin etmeye çalışmak, iki farklı
 * mekanizmayı tek fonksiyonun içinde bulanıklaştırırdı.
 */
export function constraintOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || !NAMED[code]) return null;
  if (typeof message !== 'string') return null;

  const names = [...message.matchAll(QUOTED)].map((match) => match[1]!);
  return names.at(-1) ?? null;
}
