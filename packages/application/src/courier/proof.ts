import { OrderService } from '@lezzet/database';
import { attachmentToken, checkAttachment } from '@lezzet/domain-core';
import { privateReadUrl, privateUploadUrl, r2Keys } from '@lezzet/storage';
import { DeliveryProofRecordSchema, type DeliveryProofRecord } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Teslim kanıtının yükleme kapısı** (11.2) — imzalı adres burada doğar. Terfi 21.10 (K3);
 * kaynağı `apps/web/lib/courier/proof.ts`, web kopyası geçiş köprüsüdür.
 *
 * `confirmDoorDelivery` kanıtı `imageKey` ile alıyordu ama o anahtarı üretecek kapı yoktu; kanıtın
 * zorunlu olduğu kanalda (varsayılan B2B) teslim kapanamıyordu. Operasyon şeridi uydurma bir
 * anahtar yazıp teslimi kapatmayı **bilerek yapmadı** ve haklıydı: kanıtı VAR göstermek, "eksik
 * geldi" ihtilafının tek sigortası açıldığında boş çıkması demekti.
 *
 * ── DOSYA SUNUCUDAN GEÇMEZ ──────────────────────────────────────────────────
 * İstemci doğrudan R2'ye yükler; sunucunun yaptığı tek şey **yetkiyi doğrulayıp kısa ömürlü bir
 * izin yazmak**. Sunucu üzerinden geçirmek fotoğrafı iki kez taşımak ve gövde sınırıyla boğuşmak
 * olurdu (emsal `lib/ticket/attachments.ts`). Mobil için de aynı: cihaz imzalı adrese yükler.
 *
 * ── ANAHTARI ÇAĞIRAN SEÇMEZ, BURASI SEÇER ───────────────────────────────────
 * Seçseydi istemciden gelen yolu doğrulamak zorunda kalırdık ve o doğrulamanın unutulduğu gün
 * private kovanın herhangi bir yerine yazma izni verilirdi. Kapı anahtarı kendi kurunca istismar
 * edilecek bir girdi kalmıyor.
 *
 * ── `server-only` KALKTI, KORUMA KALKMADI ───────────────────────────────────
 * Web kopyasında `import 'server-only'` vardı; o bir **Next paketleyici koruması**dır ve bu paketin
 * bağımlısı değil (mobil uç Node'da koşuyor, Next yok). Paketin bugünkü tamamı aynı hâlde
 * (`auth/otp` service-role istemci alıyor, o da işaretsiz): koruma paketin İÇİNDE değil, onu
 * çağıran yüzeyin sunucu dosyasında durur. Kapı zaten yalnız enjekte edilen service-role istemciyle
 * çalışıyor — istemci pakete girmiyorsa bu modül de giremez.
 *
 * ── YAZMA VE OKUMA AYNI DOSYADA, VE BU BİLİNÇLİ ─────────────────────────────
 * Şikâyet ekinde ikisi ayrı dosyada (`ticket/attachments.ts` + `ticket/read.ts`) ve orada sorun
 * yok, çünkü aradaki sözleşme bir tablo satırı. Kanıtta sözleşme bir **jsonb bloğu** ve tam da bu
 * yüzden bir kez ayrıştı: yazan `imageKey` koyuyordu, ekran `photos[]` arıyordu; ortak tek alan
 * `at` idi. Ekran kanıtı "var" gösteriyor ama neyin var olduğunu söyleyemiyordu ve `imageKey` hiç
 * okunmuyordu — yani **kanıt yazılıyor, hiç açılamıyordu.** Şekil artık `packages/types`'ta tek
 * şema (`DeliveryProofRecordSchema`); iki uç da onu kullanıyor, yanlış alan adı derleme hatası.
 */

type ProofUploadResult =
  | { ok: true; key: string; uploadUrl: string }
  | { ok: false; reason: 'unsupported_type' | 'too_many' | 'not_found' | 'storage_unavailable' };

export async function requestDeliveryProofUploadUrl(
  db: SupabaseClient,
  input: {
    orderId: string;
    /** Yetki sorusu: sipariş BU kuryenin mi. `confirmDoorDelivery`'nin sorduğuyla aynı soru. */
    courierId: string;
    filename: string;
    /** Bu teslimat için daha önce kaç kanıt istendiği — tavan kontrolü (imza + birkaç fotoğraf). */
    alreadyRequested?: number;
  },
): Promise<ProofUploadResult> {
  const check = checkAttachment(input.filename, input.alreadyRequested ?? 0);
  if (!check.ok) return { ok: false, reason: check.reason };

  const order = await new OrderService(db).getById(input.orderId);
  // **"Yok" ile "senin değil" AYNI cevabı verir** (emsal `requestTicketUploadUrl`): olmayan bir
  // siparişin varlığı doğrulanmaz. Ayrı cevap verseydik, kimlik deneyerek hangi siparişlerin var
  // olduğu haritalanabilirdi.
  if (!order || order.courierId !== input.courierId) return { ok: false, reason: 'not_found' };

  const key = r2Keys.deliveryProof(input.orderId, attachmentToken(), input.filename);

  // `jpg` uzantısının MIME karşılığı `image/jpeg`; imza içerik türünü bağlar, uyuşmazsa yükleme
  // R2 tarafında reddedilir.
  const contentType = `image/${check.extension === 'jpg' ? 'jpeg' : check.extension}`;
  const uploadUrl = await privateUploadUrl(key, contentType);
  // Kova yapılandırılmamış (yerel geliştirme): sessizce "oldu" demek en kötü yalan olurdu — kurye
  // kanıtı yüklediğini sanır, teslim kanıtsız kapanır ve bunu ancak ihtilaf gününde öğreniriz.
  if (!uploadUrl) return { ok: false, reason: 'storage_unavailable' };

  return { ok: true, key, uploadUrl };
}

/**
 * Ekranın gördüğü kanıt: kayıt + açılabilir adres. `imageUrl` null = kova yok ya da anahtar ölü.
 *
 * **Adıyla dışa AÇILMIYOR** (bugün): tüketicisi henüz yok ve `knip` adlandırılmış ölü bir tipi
 * doğru olarak işaretliyor. `readDeliveryProof`'un dönüş tipi zaten yapısal olarak çağırana
 * geçiyor; ekran tipi adıyla istediği gün `export` eklenir.
 */
interface DeliveryProofView extends DeliveryProofRecord {
  /** SÜRELİ imzalı adres (varsayılan 15 dk) — kalıcı değil, paylaşılan bir bağlantı olmaz. */
  imageUrl: string | null;
}

/**
 * Siparişe yazılmış kanıtı okunur hâle getirir — **"eksik geldi" ihtilafında açılan şey budur.**
 *
 * Kanıt yazılıyordu ama hiçbir yerde açılmıyordu: `imageKey`in okuyucusu yoktu. Yazılıp hiç
 * okunmayan bir sigorta, olmayan bir sigortadır.
 *
 * **Ham jsonb'yi çağıran ayrıştırmaz**, buradan geçer. Ekran kendi ayrıştırsaydı alan adları yine
 * ayrışırdı — bir kez ayrıştı zaten. Şema tutmuyorsa `null`: eski biçimde yazılmış bir blok varsa
 * yarım bir kanıt göstermektense hiç göstermemek doğru, çünkü yarım kanıt "kanıt var" der.
 *
 * `db` ALMAZ ve bu bilinçli: girdi zaten okunmuş satırdan gelen ham blok, imzalı adres de kovadan.
 */
export async function readDeliveryProof(raw: unknown): Promise<DeliveryProofView | null> {
  const parsed = DeliveryProofRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  // `box_scan` görselsizdir (23.8): kanıt okutulan kodların kendisi, açılacak bir dosya yok.
  return { ...parsed.data, imageUrl: parsed.data.imageKey ? await privateReadUrl(parsed.data.imageKey) : null };
}
