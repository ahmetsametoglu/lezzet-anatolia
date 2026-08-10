import 'server-only';
import { serviceDb } from '@lezzet/database';
import { readDeliveryProof, requestDeliveryProofUploadUrl as requestUploadUrlFor } from '@lezzet/application';

/**
 * Teslim kanıtının yükleme kapısı (11.2) — **geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * Gövde `@lezzet/application/courier/proof`ta: imzalı adresin neden sunucudan değil doğrudan
 * istemciden yüklendiği, tavanın neden orada durduğu ve yetki sorusunun neden kapıya ait olduğu
 * künyeyle birlikte orada.
 *
 * `readDeliveryProof` **düz geçiyor** — okuma tarafı `db` istemiyor (imzalı adresi kimlikten
 * çözüyor), yani araya bir sarmalayıcı koymak boş bir katman olurdu.
 *
 * `server-only` burada kalıyor, pakette değil ve gerekçesi paketin kendi künyesinde: o bir NEXT
 * paketleyici korumasıdır, mobil uç Node'da koşuyor. Koruma paketin içinde değil, onu çağıran
 * yüzeyin sunucu dosyasında durur — yani tam olarak burada.
 */

export { readDeliveryProof };

export function requestDeliveryProofUploadUrl(input: Parameters<typeof requestUploadUrlFor>[1]) {
  return requestUploadUrlFor(serviceDb(), input);
}
