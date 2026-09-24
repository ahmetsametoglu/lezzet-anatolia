'use server';

import { DEFAULT_LOCALE, LOCALES, type Locale } from '@lezzet/i18n';
import { guarded, requireAuth } from '@/lib/guard';
import { mapTilesSession, type MapTiles } from './tiles-session';

/** Haritalar yalnız girişli yüzeylerde (checkout, operasyon); oturumsuz istek `null` alır. */
export async function loadMapTilesAction(language: string, highDpi: boolean): Promise<MapTiles | null> {
  const guard = await guarded(requireAuth);
  if (!guard.ok) return null;
  const locale: Locale = (LOCALES as readonly string[]).includes(language) ? (language as Locale) : DEFAULT_LOCALE;
  return mapTilesSession(locale, highDpi === true);
}
