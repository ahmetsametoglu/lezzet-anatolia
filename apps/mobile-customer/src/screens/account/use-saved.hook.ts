import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { MeCartViewLine, MeSavedView } from '@lezzet/types';

import { cancelZoneNotice, fetchSaved, restoreSaved } from '@/lib/api/saved';
import { toastError } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { refreshCart } from '@/screens/customer-kit/cart-store';

/*
  "Sonraya kaydedilenler" kartının durumu. Okuma düşerse kart çizilmez: uydurulmuş boş bir liste müşteriye kalemlerinin kaybolduğunu
  söylerdi. Posta kodu satırın bu adrese gelip gelmediğini çözdürür, değişince kart yeniden okunur.
*/

export function useSaved(
  enabled: boolean,
  locale: Locale,
  postalCode: string | undefined,
  failedText: string,
): {
  view: MeSavedView | null;
  busy: boolean;
  restore: (lines: readonly MeCartViewLine[]) => void;
  cancelNotice: (code: string) => void;
} {
  const [view, setView] = useState<MeSavedView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchSaved(locale, postalCode).then((result) => {
      if (alive) setView(result.error === null ? result.data : null);
    });
    return () => {
      alive = false;
    };
  }, [enabled, locale, postalCode]);

  const settle = (request: Promise<Awaited<ReturnType<typeof fetchSaved>>>, afterwards?: () => void) => {
    setBusy(true);
    void request.then((result) => {
      setBusy(false);
      if (result.error !== null) {
        toastError(failedText);
        return;
      }
      setView(result.data);
      afterwards?.();
    });
  };

  return {
    view,
    busy,
    // Taşınan kalem sepetin kendisine girer; sepet ayrıca tazelenir ki rozet ve sepet ekranı aynı anda değişsin.
    restore: (lines) =>
      settle(
        restoreSaved(
          lines.map((line) =>
            line.kind === 'bundle'
              ? { kind: 'bundle' as const, bundleId: line.bundleId }
              : { kind: 'variant' as const, variantId: line.variantId, stockId: line.stockId },
          ),
          locale,
          postalCode,
        ),
        refreshCart,
      ),
    cancelNotice: (code) => settle(cancelZoneNotice(code, locale, postalCode)),
  };
}
