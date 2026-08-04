import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { B2bApplicationStatus } from '@lezzet/domain-core';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Professionnels sayfasının tip modülü (view DEĞİL — gerçek view `professionals.desktop/.mobile`).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Ekranın adımı — tanıtım hep görünür, DEĞİŞEN yalnız sağdaki/alttaki kutu.
 *
 * `verify` adımı girişli müşteride HİÇ oluşmaz (kimlik zaten kurulu); tek bayrakla değil ayrı bir
 * adım olarak durması, "form gönderildi ama sahibi yok" ara hâlinin ekranda da görünür olması
 * için — o hâlde geri dönüp formu düzeltmek hâlâ mümkün.
 */
export type ApplicationStep = 'form' | 'verify' | 'sent';

/** Masaüstü ve mobil görünümün ORTAK props'u — ikisi aynı veriyi farklı yerleştiriyor. */
export interface ProfessionalsViewProps {
  t: Messages;
  locale: Locale;
  /** Girişli ziyaretçinin başvuru hâli; girişsizde daima `none`. */
  status: B2bApplicationStatus;
  /**
   * Reddin gerekçesi — **başvuru sahibinin dilinde** (20.2). Reddedilmemişse `null`.
   *
   * `translated` yalnız makine çevirisinde `true` ve ekran bunu söylemek zorunda. Orijinal
   * TAŞINMIYOR ve bu bilinçli: gerekçenin orijinali Türkçedir, Fransız bir başvuru sahibinin
   * onunla yapabileceği bir şey yok — yorumdaki iki yönlü bağlantı burada rozete iniyor.
   */
  rejection: { reason: string; translated: boolean } | null;
  /** Girişliyse kod adımı atlanır ve form kimlik alanlarını hazır getirir. */
  signedIn: boolean;
  /** Hesaptan gelen ön dolgu (ad/e-posta/telefon) — girişsizde boş. */
  defaults: ApplicationDefaults;
  /** WhatsApp köprüsü — numara `@lezzet/brand`ten, metin sözlükten. */
  whatsappHref: string;
  whatsappNumber: string;
}

export interface ApplicationDefaults {
  contactName: string;
  email: string;
  phone: string;
}
