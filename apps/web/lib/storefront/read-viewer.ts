import 'server-only';
import { cache } from 'react';
import { serviceDb } from '@lezzet/database';
import { pricingViewerFor } from '@lezzet/application';
import type { PricingViewer } from '@lezzet/application';
import { readSessionProfile } from '@/lib/guard';

/**
 * Fiyat görüşünün web sarmalayıcısı: gövde native'le ortak (`@lezzet/application`), burada yalnız Next'e bağlı iki parça durur.
 * `cache` istek başına tek çözüm verir ki aynı sayfada kart fiyatı ile detay fiyatı ayrışmasın; kimlik oturum çerezinden okunur.
 */
export { VISITOR } from '@lezzet/application';
export type { PricingViewer } from '@lezzet/application';

/** Oturumdaki müşterinin görüntüleyen künyesi — vitrin okumalarının (anasayfa/katalog/detay) kapısı. */
export const readPricingViewer = cache(async (): Promise<PricingViewer> => pricingViewerFor(serviceDb(), await readSessionProfile()));
