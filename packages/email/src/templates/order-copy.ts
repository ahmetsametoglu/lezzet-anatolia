import type { NotificationStep, PreferredLanguage } from '@lezzet/types';
import { BRAND_COPY } from './brand-copy';

/**
 * Üç sipariş e-postasının PAYLAŞILAN metinleri — zaman çizgisi adımları, alt bilgi, ortak kart
 * başlıkları. Şablon başına tekrarlansaydı "Bildirim tercihleri" üç yerde durur, biri değişince
 * ikisi eskirdi.
 *
 * Metin üç dilde: müşterinin `preferred_language`'ı (DOMAIN §10). Operasyon yüzeyi Türkçedir ama
 * bu maller MÜŞTERİYE gider — dil onun tercihidir.
 */

type OrderCopyLocale = PreferredLanguage;

interface SharedCopy {
  region: string;
  steps: Record<NotificationStep['key'], string>;
  itemsTitle: string;
  sentItemsTitle: string;
  totalsTitle: string;
  currentTotal: string;
  viewOrder: string;
  footerNotice: (referenceNo: string) => string;
  preferences: string;
}

export const SHARED_COPY: Record<OrderCopyLocale, SharedCopy> = {
  tr: {
    ...BRAND_COPY.tr,
    steps: { received: 'Alındı', prepared: 'Hazırlandı', on_the_way: 'Yolda', delivered: 'Teslim edildi' },
    itemsTitle: 'Kalemler',
    sentItemsTitle: 'Gönderilen kalemler',
    totalsTitle: 'Tutar',
    currentTotal: 'Güncel toplam',
    viewOrder: 'Siparişimi görüntüle',
    footerNotice: (ref) => `Bu e-posta ${ref} numaralı siparişinizle ilgili gönderilmiştir.`,
  },
  fr: {
    ...BRAND_COPY.fr,
    steps: { received: 'Reçue', prepared: 'Préparée', on_the_way: 'En route', delivered: 'Livrée' },
    itemsTitle: 'Articles',
    sentItemsTitle: 'Articles expédiés',
    totalsTitle: 'Montant',
    currentTotal: 'Total actualisé',
    viewOrder: 'Voir ma commande',
    footerNotice: (ref) => `Cet e-mail concerne votre commande ${ref}.`,
  },
  de: {
    ...BRAND_COPY.de,
    steps: { received: 'Eingegangen', prepared: 'Vorbereitet', on_the_way: 'Unterwegs', delivered: 'Zugestellt' },
    itemsTitle: 'Artikel',
    sentItemsTitle: 'Versandte Artikel',
    totalsTitle: 'Betrag',
    currentTotal: 'Aktueller Gesamtbetrag',
    viewOrder: 'Meine Bestellung ansehen',
    footerNotice: (ref) => `Diese E-Mail betrifft Ihre Bestellung ${ref}.`,
  },
};
