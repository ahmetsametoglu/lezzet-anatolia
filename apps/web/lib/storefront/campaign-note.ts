import type { ScopeCampaign } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from './format';

/*
  KAMPANYA CÜMLESİNİN WEB KARŞILIĞI (08.44) — mobilin `customer-kit/campaign-label` ikizi.

  İki yüzeyin cümlesi AYNI kalıptan kuruluyor ve sözlükleri de birebir aynı anahtarlarla yazıldı;
  ayrışabilecek tek şey biçimleyici (`formatPrice`), o da her yüzeyin kendi tek kaynağı.

  **Tutar vaat edilmez, kural söylenir.** Kampanya sepetten bağımsız değil — motor kazananı tüm
  sepet üzerinden tek-en-büyük seçer ve kalemlere oransal dağıtır; bir ürün fiyatı ancak sepetten
  bağımsızsa vaat edilebilir. Bu yüzden cümle *"sepette uygulanır"* der ve kart fiyatı değişmez.
*/

/**
 * Kısa değerin sözlüğü — rozet için bu kadarı yeter. Tam cümle kuran yüzey ayrıca `named`/`anon`
 * taşır (`CampaignNoteCopy`); vitrin kartında cümle YOK, o yüzden orası bu daraltmayı kullanıyor
 * ve sözlüğüne iki fazla anahtar koymak zorunda kalmıyor.
 */
interface CampaignValueCopy {
  percent: string;
  amount: string;
  withMinimum: string;
}

interface CampaignCopy extends CampaignValueCopy {
  named: string;
  anon: string;
}

/** Kampanyanın kısa değeri ("%15" · "3,00 €" · "60 € üzeri %15"); `null` = söylenecek değer yok. */
export function campaignValue(campaign: ScopeCampaign, t: CampaignValueCopy, locale: Locale): string | null {
  const value =
    campaign.percent != null
      ? t.percent.replace('{n}', String(campaign.percent))
      : campaign.amountCents != null
        ? t.amount.replace('{amount}', formatPrice(campaign.amountCents, locale))
        : null;
  if (value === null) return null;
  if (campaign.minBasketCents === null) return value;
  return t.withMinimum.replace('{minimum}', formatPrice(campaign.minBasketCents, locale)).replace('{value}', value);
}

/** Tam cümle — kampanyanın adı varsa onunla, yoksa adsız. `null` = çizilecek bir şey yok. */
export function campaignNote(campaign: ScopeCampaign | null, t: CampaignCopy, locale: Locale): string | null {
  if (campaign === null) return null;
  const value = campaignValue(campaign, t, locale);
  if (value === null) return null;
  const label = campaign.label === null ? null : (campaign.label[locale] ?? campaign.label.fr ?? campaign.label.tr ?? null);
  return label === null || label.trim() === ''
    ? t.anon.replace('{value}', value)
    : t.named.replace('{label}', label).replace('{value}', value);
}
