import { resolveLocalizedText, type LocalizedText, type PreferredLanguage } from '@lezzet/types';
import type { ScopeCampaign } from '@lezzet/application';

/*
  KAMPANYANIN TELE ÇIKIŞI — motorun kampanyası ile sözleşmenin kampanyası arasındaki TEK çeviri.

  ── NEDEN TEK YER ──────────────────────────────────────────────────────────
  Aynı çeviri artık ÜÇ yerde gerekiyor: vitrin bandı (`home.ts` → `toBand`), katalog kesitinin
  başlığı ve 23.08'den beri KARTIN ROZETİ (`catalog.ts`). Üçü de aynı iki işi yapıyor — adı dile
  çözmek ve kimliği düşürmek — ve üçe yazılsaydı bir gün ayrışırlardı: aynı kampanya vitrinde adıyla,
  katalogda adsız görünebilirdi. `campaign-label` kitinin sunucu tarafındaki karşılığı budur.

  ── NE ÇÖZÜLÜR, NE ÇÖZÜLMEZ ────────────────────────────────────────────────
  · **Ad ÇÖZÜLÜR** — sözleşme tek dize taşır, çünkü ekranın dili istekte belli.
  · **Tutar ÇÖZÜLMEZ** — taşınan şey tutar değil KURALIN kendisi (`percent`/`amountCents`); cümleyi
    ekran kendi diliyle kurar (para gösterimi dile bağlı, sözleşme dil-bağımsız).
  · **`id` GİTMEZ** — ekranın kampanyayı ayırt etmesi gereken bir yer yok; kimlik sunucunun işi.
  · **Boş ad `null`a düşer** (`resolvedOrNull`): `{tr:''}` form artığıdır, ad değildir. Boş dize
    gönderilseydi ekran "adı var" sanıp adsız bir cümle kurardı.
*/

export interface WireCampaign {
  label: string | null;
  percent: number | null;
  amountCents: number | null;
  minBasketCents: number | null;
}

/** Ad boşsa `null` — `{tr:''}` gibi form artıkları ad sayılmaz. */
function resolvedOrNull(value: LocalizedText | null, locale: PreferredLanguage): string | null {
  if (!value) return null;
  const text = resolveLocalizedText(value, locale).trim();
  return text.length > 0 ? text : null;
}

/**
 * Kampanyanın sözleşme hâli. `null`/`undefined` girdi `null` döner — çağıran "yok"u kendi
 * sözleşmesinin deyimine çevirir (`HomeBand.campaign` `null` taşır, kart alanı ise HİÇ taşımaz).
 */
export function toWireCampaign(
  campaign: ScopeCampaign | null | undefined,
  locale: PreferredLanguage,
): WireCampaign | null {
  if (!campaign) return null;
  return {
    label: resolvedOrNull(campaign.label, locale),
    percent: campaign.percent,
    amountCents: campaign.amountCents,
    minBasketCents: campaign.minBasketCents,
  };
}
