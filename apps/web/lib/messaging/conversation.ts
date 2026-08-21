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
 * ── BEKLEYEN(04.10): NUMARA DOĞRULANMIŞ DEĞİL ───────────────────────────────
 * Bu kapı `user_profiles.phone`'u kimlik anahtarı olarak okuyor, ama o kolon bugün serbest metinden
 * yazılabiliyor (hesap kartı + misafir checkout). Yani kayıtlı olmayan bir numara ÖNCEDEN
 * sahiplenilebilir ve gerçek sahibi WhatsApp'tan yazınca konuşması yabancı bir hesaba bağlanır.
 * Açığı bu dosya AÇMIYOR (yazma tarafında ve zaten açık), ama sonucunu buraya taşıyor. Kapatan iş
 * kimlik modülünde: `04.10` — e-posta çapası + güvenlik kodu.
 */

/**
 * Kimlik kurulamayan hâller sessizce geçilmez: çağıran akışı insana taşımalı.
 *
 * İhraç EDİLMİYOR (knip): tipin adını yazan bir tüketici yok — çağıran `openWhatsappConversation`
 * dönüşünden çıkarım yapıyor. Ekran yazıldığında adı gerekirse o gün ihraç edilir.
 */
type OpenConversationResult =
  | { status: 'ok'; conversation: Conversation; customer: UserProfile; customerCreated: boolean }
  /** Numara E.164'e çevrilemedi — kimlik anahtarı yok, konuşma bir kişiye bağlanamaz. */
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
 * Eşleşmeyen numara `is_draft` taslak müşteri açar (DOMAIN §10): WhatsApp'tan yazan yabancıdan
 * e-posta istemek, WhatsApp'ı seçme sebebimizi bozar — sürtünme kaybedecek bir şeyin olduğu ilk
 * anda konur, "merhaba" diyen kişide değil.
 *
 * **Aynı numara ikinci kez taslak AÇMAZ** ve bunu iki ayrı tekillik birden garantiliyor:
 * `user_profiles_phone_key` (kişi) ve `conversation_external_ref_key` (sohbet). Uygulama katmanı
 * unutsa bile veri katmanı ikinciyi reddeder.
 */
export async function openWhatsappConversation(input: OpenConversationInput): Promise<OpenConversationResult> {
  // Normalize BURADA, çünkü `external_ref` ile `user_profiles.phone` AYNI dizeyi taşımak zorunda:
  // biri normalize edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür.
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
  // `insufficient` buraya düşemez (telefon zaten normalize edildi), ama tip daraltması için gerekli;
  // sessizce `ok` dönmek, kimliksiz bir konuşmayı kimlikli sanmak olurdu.
  if (identity.status === 'insufficient') return { status: 'invalid_phone' };

  const conversation = await new ConversationService(serviceDb()).open({
    source: 'whatsapp',
    externalRef: phone,
    customerId: identity.profile.id,
    // Profil adı konuşmaya da yazılır: müşteri kaydı silinse/bağlanmasa da sohbetin bir başlığı olur.
    profileName: input.name?.trim() || null,
  });

  return {
    status: 'ok',
    conversation,
    customer: identity.profile,
    customerCreated: identity.status === 'created',
  };
}
