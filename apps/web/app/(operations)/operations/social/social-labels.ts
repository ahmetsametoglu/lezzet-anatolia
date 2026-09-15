import type { OutboundLanguageBasis } from '@lezzet/domain-core';
import { PreferredLanguageEnum, type ConversationSource, type MessageKind, type PreferredLanguage, type TemplateCategory } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { WindowView } from './social-types';

// Ad haritaları enum'un yanında değil, çünkü tek tüketicisi bu ekran; ikinci bir yüzey okuduğunda `packages/types`a taşınır.

/**
 * `text` de haritada: gövdesiz metin olayı boş balon bırakır ve operatör mesajın kaybolduğunu sanırdı. Köşeli parantez bunun
 * müşterinin cümlesi değil, bizim açıklamamız olduğunu gösterir.
 */
export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  text: '[boş mesaj]',
  interactive: '[etkileşimli kart]',
  template: '[kalıp mesaj]',
  media: '[görsel / dosya]',
};

/** Kategori ücret sınıfıdır: pazarlama en pahalısı, işlem kalıbı pencere içinde ücretsiz. */
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  marketing: 'pazarlama',
  utility: 'işlem',
  authentication: 'doğrulama',
};

export const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  tr: 'Türkçe',
  fr: 'Fransızca',
  de: 'Almanca',
};

export function languageLabel(code: string | null): string {
  const parsed = PreferredLanguageEnum.safeParse(code);
  if (parsed.success) return LANGUAGE_LABELS[parsed.data];
  return code ? code.toUpperCase() : 'dil bilinmiyor';
}

/** Varsayılana düşen sohbet ayrıca söylenir: operatör dili biliyorsa doğrudan o dilde yazabilir, kapı yazılan dili tanır ve çevirmez. */
export const LANGUAGE_BASIS_NOTE: Record<OutboundLanguageBasis, string> = {
  conversation: 'son mesajından',
  customer: 'profil tercihinden',
  default: 'varsayılan — müşteri henüz Türkçe, Fransızca ya da Almanca yazmadı',
};

export const WINDOW_TONE: Record<WindowView['tone'], OpsTone> = {
  open: 'olive',
  soon: 'amber',
  closed: 'red',
  idle: 'neutral',
};

/**
 * Cümleler kanala göre ayrışmak zorunda: "kapalı" WhatsApp'ta bir ücret kararıdır, Messenger/Instagram'da bir kural sınırı.
 * `closed` kaçırılmış fırsat, `never` kurulmamış ilişkidir; Messenger/Instagram'da sohbeti daima müşteri başlatır.
 */
export const WINDOW_NOTE: Record<ConversationSource, Record<WindowView['state'], string>> = {
  whatsapp: {
    // Açık hâlin cümlesini kalan süre tamamlar, o yüzden nokta yok.
    open: 'Cevap süresi açık ·',
    // Motor bu hâli WhatsApp'ta üretmez; cümle tip bütünlüğü için.
    human: 'Cevap süresi doldu — WhatsApp\'ta insan temsilci istisnası yok; yalnız onaylı kalıp mesaj gider.',
    closed: 'Cevap süresi doldu — serbest mesaj gönderilemez. Yalnız onaylı kalıp mesaj (ücretli) gider.',
    never: 'Müşteri bize hiç yazmadı — pencere hiç açılmadı. Kalıp mesaj bile ancak pazarlama izniyle gider.',
  },
  // 24 saat dolunca insan temsilci süresi başlar; cümleyi kalan süre tamamlar.
  messenger: {
    open: 'Cevap süresi açık ·',
    human: 'Standart 24 saat doldu — insan temsilci olarak yazabilirsiniz ·',
    closed: '7 günlük insan temsilci süresi de doldu — Messenger\'a mesaj gönderilemez; müşterinin yeniden yazması gerekir.',
    never: 'Müşteri henüz yazmadı — Messenger sohbetini her zaman müşteri başlatır.',
  },
  instagram: {
    open: 'Cevap süresi açık ·',
    human: 'Standart 24 saat doldu — insan temsilci olarak yazabilirsiniz ·',
    closed: '7 günlük insan temsilci süresi de doldu — Instagram\'a mesaj gönderilemez; müşterinin yeniden yazması gerekir.',
    never: 'Müşteri henüz yazmadı — Instagram sohbetini her zaman müşteri başlatır.',
  },
};

/** Gelen balona ad yazılmaz: kimin yazdığını başlık söylüyor, her balonda ad diziyi gürültüye boğardı. */
export const OUTBOUND_LABEL = 'Siz';

export const AI_OUTBOUND_LABEL = 'AI ajanı';
