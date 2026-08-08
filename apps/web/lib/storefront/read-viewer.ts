import 'server-only';
import { cache } from 'react';
import { serviceDb } from '@lezzet/database';
import { pricingViewerOf } from '@lezzet/application';
import type { PricingViewer } from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';

/**
 * Vitrinin "KİM soruyor" kapısının WEB İNCE SARMALAYICISI (08.10 → terfi 21.6).
 *
 * Gövde (`pricingViewerOf`, `VISITOR`, `PricingViewer` ve tüm kanal/onay gerekçeleri)
 * `@lezzet/application/catalog/pricing-viewer`'a terfi etti — native uygulama da aynı hesabı
 * kullanır, iki yazım "sitede bir fiyat, uygulamada başka fiyat" demekti. Burada kalan tek şey
 * Next'e bağlı iki parça:
 *
 * - `cache()` — istek başına BİR kez çözüm; optimizasyon değil TUTARLILIK aracı (aynı sayfada kart
 *   fiyatı ile detay fiyatı ayrışamaz; `read-place.ts` ile aynı gerekçe).
 * - `currentCustomerId()` — oturum/çerez okuması; paket istek bağlamını bilemez, kimlik çağırandan.
 *
 * `VISITOR` ve `PricingViewer` çağıranlar için buradan yeniden dışa verilir — vitrin dosyaları tek
 * yoldan okumaya devam eder, kaynak tektir.
 */
export { VISITOR } from '@lezzet/application';
export type { PricingViewer } from '@lezzet/application';

/** Oturumdaki müşterinin görüntüleyen künyesi — vitrin okumalarının (anasayfa/katalog/detay) kapısı. */
export const readPricingViewer = cache(async (): Promise<PricingViewer> => pricingViewerOf(serviceDb(), await currentCustomerId()));
