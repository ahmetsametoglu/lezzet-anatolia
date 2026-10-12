'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, Country } from '@lezzet/types';
import { loadProductRowDetailAction } from '../../actions/row-detail';
import { marginAfterWrite } from './price-math';
import type { ProductRowDetail } from './row-detail-types';

/**
 * Açılan satırın ayrıntısı tek turda okunur ve okunduğu üründe önbellekte kalır; iki ürün arasında gidip gelen operatör her dönüşte
 * aynı turu ödemesin ve kırılım iskelete düşmesin.
 */
export interface RowDetailState {
  /** `null` → okuma sürüyor; okuma düşerse `error` dolar. */
  detail: ProductRowDetail | null;
  error: string | null;
}

export function useRowDetail(productId: string | null) {
  const [cache, setCache] = useState<Record<string, RowDetailState>>({});
  /** "İstendi" kümesi ref'te durur: state'te olsaydı ilk yazım effect'i yeniden kurar ve dönen cevap atılırdı. */
  const requested = useRef(new Set<string>());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (productId === null || requested.current.has(productId)) return;
    requested.current.add(productId);
    let alive = true;
    // Yalnız hiç veri yokken iskelete düşülür; yenilemede kırılım yerinde kalır.
    setCache((prev) => (prev[productId] ? prev : { ...prev, [productId]: { detail: null, error: null } }));
    void loadProductRowDetailAction(productId).then(({ data, error }) => {
      if (!alive) return;
      setCache((prev) => ({ ...prev, [productId]: { detail: data, error } }));
    });
    return () => {
      alive = false;
    };
  }, [productId, reloadToken]);

  /** Yeniden okur (düşen istek ya da tam formdan dönüş); mevcut hücreler silinmez. */
  const refresh = useCallback((id: string) => {
    requested.current.delete(id);
    setReloadToken((token) => token + 1);
  }, []);

  const patchVariant = useCallback(
    (id: string, variantId: string, patch: (row: ProductRowDetail['variants'][number]) => ProductRowDetail['variants'][number]) => {
      setCache((prev) => {
        const entry = prev[id];
        if (!entry?.detail) return prev;
        const variants = entry.detail.variants.map((row) => (row.variantId === variantId ? patch(row) : row));
        return { ...prev, [id]: { ...entry, detail: { ...entry.detail, variants } } };
      });
    },
    [],
  );

  /** Yazılan genel fiyat yerinde uygulanır: sunucu zaten yazdı, liste ve kırılım yeniden okunmaz. */
  const applyPrice = useCallback(
    (id: string, variantId: string, channel: Channel, amountCents: number) =>
      patchVariant(id, variantId, (row) =>
        row.price === null
          ? row
          : {
              ...row,
              price: {
                ...row.price,
                [channel]: { ...row.price[channel], amountCents },
                marginPercent: marginAfterWrite(row.price, channel, amountCents),
              },
            },
      ),
    [patchVariant],
  );

  /** Ülke fiyatı yerinde uygulanır; `null` kaldırıldı demektir ve hücre genel fiyata döner. */
  const applyCountryPrice = useCallback(
    (id: string, variantId: string, country: Country, channel: Channel, amountCents: number | null) =>
      patchVariant(id, variantId, (row) => {
        const cells = row.countryPrices[country] ?? { b2c: { amountCents: null, validFrom: null }, b2b: { amountCents: null, validFrom: null } };
        return { ...row, countryPrices: { ...row.countryPrices, [country]: { ...cells, [channel]: { ...cells[channel], amountCents } } } };
      }),
    [patchVariant],
  );

  return { state: productId === null ? undefined : cache[productId], refresh, applyPrice, applyCountryPrice };
}
