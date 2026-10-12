'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadProductRowDetailAction } from '../../actions/row-detail';
import type { VariantRowDetail } from '../../products-types';

/**
 * Açılan satırın ayrıntısı: AÇILINCA okunur, kapanınca atılmaz.
 *
 * Önbellek bilinçli: operatör iki ürünü karşılaştırırken satırları açıp kapatıyor ve her açılışta
 * aynı turu yeniden ödemek, kapanmış bir satırın verisini silmek demekti. Fiyat yazıldıktan sonra
 * ilgili ürünün kaydı `invalidate` ile düşürülür — ekran kendi yazdığı değeri bayat göstermesin.
 */
export interface RowDetailState {
  /** `null` → okuma sürüyor; dizi → geldi. */
  rows: VariantRowDetail[] | null;
  error: string | null;
}

export function useRowDetail() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, RowDetailState>>({});

  useEffect(() => {
    if (openId === null || cache[openId]) return;
    let alive = true;
    setCache((prev) => ({ ...prev, [openId]: { rows: null, error: null } }));
    void loadProductRowDetailAction(openId).then(({ data, error }) => {
      if (!alive) return;
      setCache((prev) => ({ ...prev, [openId]: { rows: data, error } }));
    });
    return () => {
      alive = false;
    };
  }, [openId, cache]);

  const toggle = useCallback((productId: string) => {
    setOpenId((current) => (current === productId ? null : productId));
  }, []);

  /** Okumayı yeniden denetir (düşen istek) ya da yazma sonrası bayat kaydı düşürür. */
  const invalidate = useCallback((productId: string) => {
    setCache((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  return { openId, toggle, invalidate, state: openId === null ? undefined : cache[openId] };
}
