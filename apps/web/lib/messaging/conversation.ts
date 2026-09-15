import { ConversationService, serviceDb } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import type { Conversation, UserProfile } from '@lezzet/types';
import { defaultConversationHandler, findOrCreateCustomer } from '@lezzet/application';

// Tek açılış kapısı WhatsApp'ınki: Messenger PSID'si ve Instagram IGSID'si telefon taşımaz, o sohbetleri webhook kimliksiz açar.

// Kanıtın tek kaynağı imzalı webhook'tur ve bu kapı `phoneProven` geçirmez: kayıttaki numara kanıt sayılsaydı başkasının numarası
// önceden sahiplenilebilirdi.

/** Kimlik kurulamayan hâller sessizce geçilmez: çağıran akışı insana taşımalı. */
type OpenConversationResult =
  /** `customer` `null` olabilir: numara kanıtlı değilse kimlik kurulmaz; sohbet açılır ama kime ait olduğu iddia edilmez. */
  | { status: 'ok'; conversation: Conversation; customer: UserProfile | null; customerCreated: boolean }
  | { status: 'invalid_phone' }
  /** Sessizce seçim yapılmaz ve konuşma açılmaz: yanlış hesaba bağlanmış sohbet, bağlanmamış sohbetten pahalıdır. */
  | { status: 'conflict'; profileIds: string[] };

interface OpenConversationInput {
  /** Normalize burada yapılır, çağıran biçim bilmek zorunda değil. */
  phone: string;
  /** Yalnız yeni kayıtta kullanılır, mevcut müşterinin adını ezmez. */
  name?: string | null;
  email?: string | null;
}

/**
 * Kanıtlı anahtar yoksa konuşma kimliksiz açılır ve taslak müşteri de açılmaz: kanıtsız bir numaraya kimlik uydurulmaz. Aynı
 * numara ikinci sohbeti açmaz: `conversation_external_ref_key` uygulama katmanı unutsa da reddeder.
 */
export async function openWhatsappConversation(input: OpenConversationInput): Promise<OpenConversationResult> {
  // Normalize burada: `external_ref` ile kanıt satırı aynı dizeyi taşımalı, yoksa aynı kişi iki anahtarla iki kez görünür.
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: 'invalid_phone' };

  const identity = await findOrCreateCustomer({
    phone,
    email: input.email,
    name: input.name,
    // Doğrulanmış bir girişten geçmediği için kayıt taslak açılır.
    asDraft: true,
  });

  if (identity.status === 'conflict') return { status: 'conflict', profileIds: identity.profileIds };
  // Kanıtlı anahtar yoksa konuşma yine açılır: mesaj kaybolmamalı, yalnız kime ait olduğu iddia edilmez.
  const customer = identity.status === 'insufficient' ? null : identity.profile;

  const conversation = await new ConversationService(serviceDb()).open({
    source: 'whatsapp',
    externalRef: phone,
    customerId: customer?.id ?? null,
    // Profil adı konuşmaya da yazılır: müşteri bağlanmasa da sohbetin bir başlığı olur.
    profileName: input.name?.trim() || null,
    // Yürütücü ayardan, webhook'la aynı kapı; var olan sohbete dokunmaz.
    handledBy: await defaultConversationHandler(serviceDb()),
  });

  return {
    status: 'ok',
    conversation,
    customer,
    customerCreated: identity.status === 'created',
  };
}
