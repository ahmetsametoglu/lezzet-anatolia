import { ConversationService, serviceDb } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import type { Conversation, UserProfile } from '@lezzet/types';
import { findOrCreateCustomer } from '../identity/find-or-create';

/**
 * Konuşma AÇILIŞ kapısı (15.1/15.2; üç kanal 21.08, ADR-006) — **motor ile servisi birleştiren
 * yer** (STACK §4).
 *
 * KAYIT yarısı (recordInbound/OutboundMessage) 21.08'de `@lezzet/application`a TERFİ ETTİ
 * (`messaging/record.ts`): mobil `/social` uçları da aynı deftere yazıyor ve `apps/mobile-api`
 * web'den import edemez. Bu dosyada kalan tek kapı açılış — çünkü kimlik çözümü
 * (`findOrCreateCustomer`) web'in identity katmanında yaşıyor ve açılışın bugünkü iki tüketicisi
 * de web (elle işleme + Meta webhook'u). İkinci yüzey doğduğu gün o da terfi eder.
 *
 * `openWhatsappConversation` adı KANALINI söylüyor ve tek açılış kapısı bilerek bu: telefon
 * kimlik çözümü yalnız WhatsApp'ta mümkün (Messenger PSID'si ve Instagram IGSID'si telefon
 * taşımaz). Messenger/IG konuşmalarını webhook açıyor (15.7) — kimlik çözümü hiç denenmez,
 * konuşma kimliksiz doğar (bağlama 15.16).
 *
 * ── OPERATÖRÜN YAZDIĞI NUMARA KANIT DEĞİLDİR (04.10) ────────────────────────
 * Bu kapı bir tur numarayı kimlik anahtarı olarak okuyordu ve o okuma bir açıktı: kolon serbest
 * metinden yazılabildiği için kayıtlı olmayan bir numara ÖNCEDEN sahiplenilebiliyor, gerçek sahibi
 * WhatsApp'tan yazınca konuşması yabancı bir hesaba bağlanıyordu.
 *
 * Artık kimlik anahtarı **kanıtlanmış** numaradır (`customer_phone`) ve kanıtın tek kaynağı imzalı
 * webhook'tur. Operatörün telefonundan okuyup klavyeye geçirdiği numara kanıt değildir — bu yüzden
 * bu kapı `phoneProven` BAYRAĞINI GEÇİRMEZ. Sonucu doğrudan görünür: elle işlenen sohbet, o numara
 * daha önce WhatsApp'tan yazmadıysa **kimliksiz** açılır. Kaybedilen bir şey yok — kazanılan şey,
 * sohbetin yanlış hesaba bağlanmamış olması; bağı kurmanın yolu ya müşterinin kendi mesajı ya
 * operatörün kanıtlı bağlama eylemidir (15.19).
 */

/**
 * Kimlik kurulamayan hâller sessizce geçilmez: çağıran akışı insana taşımalı.
 *
 * İhraç EDİLMİYOR (knip): tipin adını yazan bir tüketici yok — çağıran `openWhatsappConversation`
 * dönüşünden çıkarım yapıyor. Ekran yazıldığında adı gerekirse o gün ihraç edilir.
 */
type OpenConversationResult =
  /**
   * Konuşma açıldı. **`customer` `null` OLABİLİR** (04.10): operatörün yazdığı numara kanıt
   * olmadığı için, o numara daha önce WhatsApp'tan yazmamışsa kimlik kurulmaz. Bu bir hata değil
   * doğru cevaptır — sohbet açılır ve mesaj yazılır, yalnız kime ait olduğunu iddia etmeyiz.
   */
  | { status: 'ok'; conversation: Conversation; customer: UserProfile | null; customerCreated: boolean }
  /** Numara E.164'e çevrilemedi — `external_ref` üretilemez, konuşma açılamaz. */
  | { status: 'invalid_phone' }
  /**
   * Telefon ve e-posta AYRI müşterilere çıktı — sessizce seçim yapılmaz (DOMAIN §10). Konuşma
   * AÇILMAZ: yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir sohbetten pahalıdır.
   */
  | { status: 'conflict'; profileIds: string[] };

interface OpenConversationInput {
  /** Ham numara — normalize burada yapılır, çağıran biçim bilmek zorunda değil. */
  phone: string;
  /** WhatsApp profil adı; yalnız YENİ kayıtta kullanılır, mevcut müşterinin adını ezmez. */
  name?: string | null;
  /** İkinci kimlik anahtarı — biliniyorsa (elle işlemede admin girebilir). */
  email?: string | null;
}

/**
 * **Numaradan konuşmaya** (15.2): müşteriyi bul-veya-oluştur, konuşmayı aç-ya-da-bul.
 *
 * Kimlik ancak İKİNCİ anahtardan kurulabilir: operatörün yazdığı numara kanıt olmadığı için
 * (`phoneProven` geçilmiyor), bağ ya e-posta verilmişse ya da o numara daha önce WhatsApp'tan
 * yazıp kanıt satırını doğurmuşsa kurulur. İkisi de yoksa **konuşma kimliksiz açılır** — taslak
 * müşteri de AÇILMAZ. Bir tur burada taslak açılıyordu ve doğruydu (kanıt o zaman numaranın
 * kendisiydi); bugün açmak, klavyeden geçmiş bir dizeye kimlik uydurmak olurdu.
 *
 * **Aynı numara ikinci kez sohbet AÇMAZ:** `conversation_external_ref_key` (0039) ikinciyi
 * reddeder — uygulama katmanı unutsa bile veri katmanı tutar.
 */
export async function openWhatsappConversation(input: OpenConversationInput): Promise<OpenConversationResult> {
  // Normalize BURADA, çünkü `external_ref` ile kanıt satırının numarası AYNI dizeyi taşımak
  // zorunda: biri normalize edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür.
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: 'invalid_phone' };

  const identity = await findOrCreateCustomer({
    phone,
    email: input.email,
    name: input.name,
    // WhatsApp'tan otomatik açılan kayıt TASLAKTIR: doğrulanmış bir girişten geçmedi.
    asDraft: true,
  });

  if (identity.status === 'conflict') return { status: 'conflict', profileIds: identity.profileIds };
  // `insufficient` = elde kanıtlı anahtar yok (numara kanıtsız, e-posta verilmemiş). Konuşma yine
  // açılır: mesaj kaybolmamalı (15.7'nin kuralı burada da geçerli), yalnız kime ait olduğunu
  // iddia etmeyiz.
  const customer = identity.status === 'insufficient' ? null : identity.profile;

  const conversation = await new ConversationService(serviceDb()).open({
    source: 'whatsapp',
    externalRef: phone,
    customerId: customer?.id ?? null,
    // Profil adı konuşmaya da yazılır: müşteri kaydı silinse/bağlanmasa da sohbetin bir başlığı olur.
    profileName: input.name?.trim() || null,
  });

  return {
    status: 'ok',
    conversation,
    customer,
    customerCreated: identity.status === 'created',
  };
}
