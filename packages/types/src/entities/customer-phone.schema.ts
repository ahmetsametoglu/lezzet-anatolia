import { z } from 'zod';

/**
 * **CustomerPhone — kimlik anahtarı** (04.10, migration 0001). DOMAIN §10.
 *
 * `UserProfile.phone`'dan farkı bir alan farkı değil, bir İDDİA farkıdır:
 *
 *   `user_profiles.phone` → *"müşteri bize bu numarayı verdi"* (form, doğrulanmamış, iletişim için)
 *   `customer_phone`      → *"bu numara bu kişide"* (kanıtlanmış zilyetlik, kimlik çözümü için)
 *
 * Satırın VARLIĞI kanıttır — bu yüzden `verifiedAt` nullable değil. Doğrulanmamış numaranın burada
 * satırı olmaz; olsaydı tablo yine iki işi birden yapar ve düzeltmeye çalıştığımız hatayı bir tablo
 * ötede tekrarlardı.
 *
 * **Kanıtın sınırı:** zilyetlik gerçektir ama BAĞ bayat olabilir. Bu kayıt "numara bugün kimde"
 * sorusunu cevaplar; "bu numaranın geçmişi kimin" sorusunu ÇAPA cevaplar (e-posta ya da 6 haneli
 * güvenlik kodu) — devredilmiş hattın yeni sahibi de numarayı meşru olarak elinde tutuyordur.
 */
export const CustomerPhoneSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /** E.164 normalize — `conversation.externalRef` ile AYNI dize (0039). */
  phone: z.string(),
  /** Zilyetliğin kanıtlandığı an. Satır varsa dolu. */
  verifiedAt: z.string().datetime({ offset: true }),
  /**
   * Bu numaradan gelen SON mesajın anı — sessizlik tetiğinin (~3 ay, DOMAIN §10) ölçütü.
   *
   * `verifiedAt` ile aynı başlar ve her gelen mesajda tazelenir. İkisi ayrı durur çünkü iki ayrı
   * soruya cevap veriyorlar: biri "ne zaman kanıtlandı" (değişmez), öteki "hâlâ canlı mı".
   */
  lastSeenAt: z.string().datetime({ offset: true }),
  /**
   * **Taşıyıcının son beyanı: ulaşılamadı** (`failed`) — kimlik şüphesinin ERKEN tetiği.
   *
   * Tahmin değil beyandır: numara kapanmış ya da bizi engellemiş. `lastSeenAt`ten ayrı durur çünkü
   * ayrı bir şey söylüyor — biri "en son ne zaman yazdı", öteki "yazdığımız yerine ulaştı mı".
   * Başarılı bir teslim onu SİLER (RPC), soru sorulduğunda da silinir: bir sinyal iki kez sayılmaz.
   */
  deliveryFailedAt: z.string().datetime({ offset: true }).nullable(),
  /**
   * Emeklilik anı — bağ koptu (hat devri / taşıyıcının `failed` beyanı). `null` = aktif.
   *
   * Satır SİLİNMEZ: silmek, o numaranın bir zamanlar bu kişiye ait olduğu bilgisini yok etmek olurdu
   * ve sonrasında "burada ne oldu" sorusunu kimse cevaplayamazdı. Tekillik yalnız aktif satırlarda
   * (`customer_phone_active_key`), yani emekli numara yeni sahibine açıktır.
   */
  retiredAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type CustomerPhone = z.infer<typeof CustomerPhoneSchema>;

/** Yazım: kanıt anı ve son görülme sunucunun damgasıdır — çağıran veremez. */
export const CustomerPhoneInsertSchema = CustomerPhoneSchema.pick({ customerId: true, phone: true });
export type CustomerPhoneInsert = z.infer<typeof CustomerPhoneInsertSchema>;

/**
 * Güncelleme YALNIZ iki damgayla sınırlı — ve sınır kimliğin kendisini korur.
 *
 * `customerId` ile `phone` bir kez yazılır: bağı "düzeltmek" diye bir işlem yok, çünkü bu satır bir
 * KANITTIR, bir tercih değil. Yanlış kurulmuş bağın yolu emeklilik + yeni satırdır (iz kalır);
 * güncellemeye açık bırakılsaydı kimlik, kaydı sessizce değiştirilebilen bir alana dönerdi.
 * `verifiedAt` de dokunulamaz: kanıtın tarihi geriye alınamaz.
 */
export const CustomerPhoneUpdateSchema = CustomerPhoneSchema.pick({ id: true }).extend(
  CustomerPhoneSchema.pick({ lastSeenAt: true, retiredAt: true }).partial().shape,
);
export type CustomerPhoneUpdate = z.infer<typeof CustomerPhoneUpdateSchema>;
