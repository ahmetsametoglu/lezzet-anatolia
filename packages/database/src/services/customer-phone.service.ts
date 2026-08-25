import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CustomerPhoneInsertSchema,
  CustomerPhoneSchema,
  CustomerPhoneUpdateSchema,
  type CustomerPhone,
  type CustomerPhoneInsert,
  type CustomerPhoneUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * **Kimlik anahtarı: doğrulanmış telefon numarası** (04.10, migration 0001). DOMAIN §10.
 *
 * Servis karar vermez, satır getirir/yazar (STACK §4). Buradaki hiçbir metot *"bu numara kanıtlandı
 * mı"* sorusunu sormaz — sorunun cevabı çağıranın bağlamındadır ve tek meşru cevabı bugün imzası
 * doğrulanmış Meta webhook'udur (15.7). Servisi "kanıtı da ben ölçeyim" diye genişletmek, kanıtın
 * ne olduğu kararını veri katmanına gömerdi.
 *
 * **Numara normalize GELİR.** Burada normalize edilmez ve edilmemeli: `conversation.external_ref`
 * ile aynı dizeyi taşımak zorunda (0039) ve o dize çağıranda üretiliyor. İki yerde normalize etmek,
 * bir gün iki farklı sonuç üretmenin en kısa yoludur.
 */
/**
 * `recordProof`un cevabı. `previous` **tazelemeden ÖNCEKİ** satırdır ve tek bir soru için var:
 * *"bu mesaj gelmeden önce en son ne zaman görülmüştü?"*
 *
 * Sessizlik tetiği (DOMAIN §10) yalnız bu andan hesaplanabilir — `lastSeenAt` birazdan bu mesajla
 * tazelenecek ve boşluk sonradan bakan hiç kimseye görünmeyecek. Servis tetiği HESAPLAMAZ (karar
 * uygulamanın), yalnız hesaplanabilmesi için gereken gerçeği elden kaçırmaz.
 */
export type RecordProofResult = {
  status: 'bound' | 'seen' | 'taken';
  row: CustomerPhone | null;
  previous: CustomerPhone | null;
};

export class CustomerPhoneService extends BaseDbService<CustomerPhone, CustomerPhoneInsert, CustomerPhoneUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'customer_phone', CustomerPhoneSchema, CustomerPhoneInsertSchema, CustomerPhoneUpdateSchema, false);
  }

  /**
   * **Kimlik çözümünün tek okuması:** bu numara bugün kimde.
   *
   * Emekli satırlar süzgecin DIŞINDA ve bu ayrım tasarımın kendisidir: devredilmiş bir hattın eski
   * kaydı durur (geçmiş silinmez) ama gelen mesajı artık o kişiye bağlamaz. Süzgeç unutulsaydı yeni
   * sahibin mesajı önceki kişinin hesabına düşerdi — düzeltmeye çalıştığımız arızanın ta kendisi.
   */
  findActive(phone: string): Promise<CustomerPhone | null> {
    return this.getOneBy({ phone }, { isNullFields: ['retired_at'] });
  }

  /** Bir müşterinin AKTİF numaraları — müşteri kartı, sohbet paneli, çapa akışı. */
  listActiveByCustomer(customerId: string): Promise<CustomerPhone[]> {
    return this.getAll({ customerId }, { isNullFields: ['retired_at'], orderBy: 'verifiedAt', orderDirection: 'asc' });
  }

  /**
   * **Kanıtı kaydet** — numara bu müşteride, ve şu an görüldü.
   *
   * Üç hâl döner ve üçü de çağıran için AYRI birer olaydır:
   *   `bound`  — bağ yeni kuruldu (numaranın ilk kanıtı)
   *   `seen`   — bağ zaten vardı, `lastSeenAt` tazelendi (sessizlik tetiğinin ölçütü)
   *   `taken`  — numara BAŞKA bir müşteride aktif. Yazım yapılmaz.
   *
   * **`taken` bir hata değil, bir GERÇEKTİR** ve sessizce ezilemez: numaranın kimde olduğu bir
   * kanıta dayanıyor ve ikinci bir kanıt onu geçersiz kılmaz — hattın devredildiğini söyleyen şey
   * mesajın gelmesi değil, ESKİ bağın kopmasıdır (sessizlik ya da taşıyıcının `failed` beyanı).
   * Çağıran bu hâlde konuşmayı kimliksiz açar; çözüm insana ya da çapaya kalır.
   *
   * **"Önce sorgula, yoksa yaz" yarışına karşı:** iki webhook mesajı aynı anda düşerse ikisi de
   * "yok" görebilir; ikincinin yazımı kısmi unique indekse takılır (`23505`) ve satır yeniden
   * okunur. Karar veritabanında kalır (`insertIgnoringConflict` künyesiyle aynı gerekçe).
   */
  async recordProof(customerId: string, phone: string): Promise<RecordProofResult> {
    const mevcut = await this.findActive(phone);
    if (mevcut) {
      if (mevcut.customerId !== customerId) return { status: 'taken', row: mevcut, previous: null };
      return { status: 'seen', row: await this.touchSeen(mevcut.id), previous: mevcut };
    }

    const yeni = await this.insertIgnoringConflict({ customerId, phone });
    if (yeni) return { status: 'bound', row: yeni, previous: null };

    // Yarışı kaybettik: satırı kazanan yazdı. Kim yazdıysa gerçeği o taşıyor — yeniden oku.
    const kazanan = await this.findActive(phone);
    if (!kazanan) return { status: 'taken', row: null, previous: null }; // aynı anda emekliye ayrılmış: çağıran tekrar dener
    if (kazanan.customerId !== customerId) return { status: 'taken', row: kazanan, previous: null };
    return { status: 'seen', row: kazanan, previous: kazanan };
  }

  /**
   * **Taşıyıcının teslim beyanını yaz** (04.10) — `failed` damgalar, başarılı teslim SİLER.
   *
   * Numarayla çağrılır, satır kimliğiyle değil: taşıyıcının elinde bizim kimliğimiz yok,
   * `recipient_id` var. Tek deyimde döner (RPC) — bir okuma + bir yazma yerine tek tur.
   *
   * Tanımadığımız numara `null` döner ve bu olağandır: kanıt satırı olmayan bir numaraya mesaj
   * göndermiş olabiliriz (elle işlenen konuşma). Sessiz geçmesi doğru — kimlik künyesi yoksa
   * güncellenecek kimlik de yoktur.
   */
  async markDelivery(phone: string, failed: boolean): Promise<CustomerPhone | null> {
    const rows = await this.executeRpc<unknown[]>('mark_customer_phone_delivery', { p_phone: phone, p_failed: failed });
    return this.parseRows(rows ?? [])[0] ?? null;
  }

  /**
   * **Son görülmeyi tazele** — damgayı VERİTABANININ saati yazar (`touch_customer_phone`).
   *
   * `update({ lastSeenAt: new Date()… })` yazmıyoruz ve bu bir üslup tercihi değil: satır doğarken
   * damgalar kolon varsayılanından, yani DB saatinden geliyor. Tazelemeyi uygulamanın saatiyle
   * yazsaydık iki AYRI saat karışırdı ve aralarındaki kayma kadar **`lastSeenAt` geriye gidebilirdi**
   * (ölçüldü 25.08, tam pakette test düştü: 10 ms). Sessizlik tetiği tam olarak bu damgadan
   * hesaplanacak; geriye giden bir damga o hesabı bozar.
   *
   * Emekli satır tazelenmez → `null`. Çağıran bunu bir yarış olarak okur.
   */
  async touchSeen(id: string): Promise<CustomerPhone | null> {
    const rows = await this.executeRpc<unknown[]>('touch_customer_phone', { p_id: id });
    return this.parseRows(rows ?? [])[0] ?? null;
  }
}
