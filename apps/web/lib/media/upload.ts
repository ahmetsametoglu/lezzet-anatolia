import 'server-only';
import { validateImageUpload } from '@lezzet/types';

/**
 * **Görsel yüklemenin TEK KAPISI** (05.7) — R2'ye yazan hiçbir eylem `FormData`'dan dosyayı
 * kendisi okumaz, buradan geçer.
 *
 * ── NEDEN TEK KAPI: KURALIN YAZILI OLMASI ÇALIŞTIĞI ANLAMINA GELMİYORDU ─────
 * `05.7` "yükleme action'ı (tip/boyut sınırı)" diye kapanmıştı ve kural gerçekten yazılıydı
 * (`image.schema.ts`) — ama **sıfır çağıranı vardı** (ölçüldü 28.08). Beş yükleme eylemi de yalnız
 * "dosya boş mu" diye bakıp `file.type`'ı olduğu gibi R2'ye geçiriyordu. Yani depoya keyfi biçimde
 * ve keyfi büyüklükte dosya yazılabiliyordu, ve o dosya sonra ürün görseli diye müşteriye servis
 * ediliyordu. Bu, bu depoda tekrar tekrar çıkan **yalan söyleyen künye** kalıbı: künye özelliği
 * iddia edince okuyan bir daha bakmıyor.
 *
 * Denetimin beş yere kopyalanması aynı arızayı daha sinsi hâliyle geri getirirdi — altıncı eylem
 * yazıldığı gün denetimsiz doğar ve kimse fark etmez. Tek kapı, yeni eylemin dosyayı okumak için
 * mecburen uğradığı yer.
 *
 * ── İSTEMCİDEKİ `accept` BİR SINIR DEĞİL, İPUCUDUR ──────────────────────────
 * Dosya seçicinin `accept` değeri tarayıcıya "önce şunları göster" der; kullanıcı "tüm dosyalar"a
 * geçebilir ve bunlar Server Action, yani istek tarayıcı olmadan da atılabilir. Kapı SUNUCUDA
 * durmak zorunda; `accept` yalnız operatörü gereksiz bir hatadan korur (`IMAGE_ACCEPT_ATTR`).
 *
 * ── KURAL BURADA DEĞİL, `@lezzet/types`TE ───────────────────────────────────
 * Hangi biçim kabul, tavan kaç bayt — kararı `validateImageUpload` veriyor. Bu dosya yalnız
 * `FormData`'dan dosyayı çıkarır ve kararı uygular: ikinci bir "biçim listesi" burada yazılsaydı
 * bir gün ötekinden ayrılırdı ve fark yalnız operatörün ekranında görünürdü.
 */
export function readImageUpload(form: FormData, field = 'file'): File {
  const file = form.get(field);
  // Boş dosya bir boyut ihlali DEĞİL, seçimin hiç yapılmamış olması — mesajı da o yüzden ayrı.
  if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
  const hata = validateImageUpload({ type: file.type, size: file.size });
  if (hata) throw new Error(hata);
  return file;
}
