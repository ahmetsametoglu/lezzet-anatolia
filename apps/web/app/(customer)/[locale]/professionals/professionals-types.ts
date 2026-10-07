import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type professionalsCopy from '@lezzet/i18n/customer/professionals';
import type { B2bApplicationStatus } from '@lezzet/domain-core';
import type { SitePageImage } from '@/lib/storefront/site-image';
import type messages from './messages.json';

/** Telefonun native'le ortak metni. */
export type ProfessionalsCopy = LocalizedCopy<typeof professionalsCopy>;
/** Web'in metni: masaüstü düzeni, künye ve adres önerilerinin sözcükleri. */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Masaüstü formunun adımı; `verify` girişli müşteride hiç oluşmaz. Ayrı bir adım olması "gönderildi ama sahibi yok" ara hâlini
 * görünür kılar ki aday geri dönüp formu düzeltebilsin.
 */
export type ApplicationStep = 'form' | 'verify' | 'sent';

/** Masaüstü ve telefon görünümünün ortak props'u — ikisi aynı veriyi farklı yerleştirir. */
export interface ProfessionalsViewProps {
  t: Messages;
  copy: ProfessionalsCopy;
  locale: Locale;
  /** Girişli ziyaretçinin başvuru hâli; girişsizde daima `none`. */
  status: B2bApplicationStatus;
  /**
   * Reddin gerekçesi başvuru sahibinin dilinde; reddedilmemişse `null`. `translated` makine çevirisinde `true` ve ekran bunu
   * söylemek zorunda; orijinal taşınmaz, çünkü Türkçe orijinal başka dildeki adaya bir şey söylemez.
   */
  rejection: { reason: string; translated: boolean } | null;
  /** Girişliyse kod adımı atlanır ve form kimlik alanlarını hazır getirir. */
  signedIn: boolean;
  /** Hesaptan gelen ön dolgu (ad/e-posta/telefon) — girişsizde boş. */
  defaults: ApplicationDefaults;
  /** WhatsApp köprüsü — numara `@lezzet/brand`ten, metin sözlükten. */
  whatsappHref: string;
  whatsappNumber: string;
  /** Masaüstü kahramanının görseli (`site_image.professionals_hero`); `null` = henüz yüklenmedi, çerçeve yer tutucuyla durur. */
  hero: SitePageImage | null;
}

export interface ApplicationDefaults {
  contactName: string;
  email: string;
  phone: string;
}
