import type { MarketingChannel, MarketingConsent } from '@lezzet/types';

/** Kanal başına "açık mı" bayrakları. Değer boolean, çünkü kanıtın zamanını ve kaynağını sunucu yazar. */
export type MarketingConsentToggles = Partial<Record<MarketingChannel, boolean>>;

/**
 * İzin nesnesinin yeni hâli; değişen kanal yoksa `null`. Yalnız değişen kanal damgalanır, çünkü aynı değeri yeniden damgalamak hiç
 * yaşanmamış bir onay anı uydurur ve ilk kaynağı (`checkout`) ezerdi.
 */
export function nextMarketingConsent(
  current: MarketingConsent,
  toggles: MarketingConsentToggles,
  source: string,
  at: string,
): MarketingConsent | null {
  const next: MarketingConsent = { ...current };
  let changed = false;

  for (const channel of Object.keys(toggles) as MarketingChannel[]) {
    const granted = toggles[channel];
    if (granted === undefined) continue;
    // Kayıtsız kanal `false` sayılır: "hiç sorulmadı" ret kaydına dönmesin, gerçek geri çekme yine damgalansın.
    if ((current[channel]?.granted ?? false) === granted) continue;
    next[channel] = { granted, at, source };
    changed = true;
  }

  return changed ? next : null;
}

/** Kampanya e-postası bu yazımla mı açıldı; bilgi e-postası yalnız o an gider, aynı değerin yeniden kaydı ya da kapatma göndermez. */
export function startsEmailSubscription(previous: MarketingConsent, next: MarketingConsent | null): boolean {
  return next?.email?.granted === true && previous.email?.granted !== true;
}
