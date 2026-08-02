import type { PreferredLanguage } from '@lezzet/types';

/**
 * MARKA metinleri — hangi mail olursa olsun aynı kalan iki satır: başlığın yanındaki bölge etiketi
 * ve alt bilgideki tercih bağlantısının adı.
 *
 * Ayrı dosya, çünkü bunlar bir olayın değil markanın sözleri. Sipariş ailesi (`order-copy`), talep
 * ailesi (`ticket-copy`) ve değerlendirme daveti kendi metinlerini taşır ama bu ikisini paylaşır;
 * her aile kendi kopyasını tutsaydı (bir süre öyleydi) "Strasbourg & environs" bir dosyada, "&
 * alentours" ötekinde yazardı ve müşteri iki mailde iki farklı marka görürdü.
 *
 * `footerNotice` burada YOKTUR: o cümle mailin neyle ilgili olduğunu söyler ("… siparişinizle
 * ilgili" / "… açtığınız talep hakkında") ve aileye göre değişir.
 */

interface BrandCopy {
  /** Başlığın sağındaki küçük bölge etiketi. */
  region: string;
  /** Alt bilgideki bağlantının adı — bildirim tercihleri sayfası. */
  preferences: string;
}

export const BRAND_COPY: Record<PreferredLanguage, BrandCopy> = {
  tr: { region: 'Strasbourg & çevresi', preferences: 'Bildirim tercihleri' },
  fr: { region: 'Strasbourg & environs', preferences: 'Préférences de notification' },
  de: { region: 'Straßburg & Umgebung', preferences: 'Benachrichtigungseinstellungen' },
};
