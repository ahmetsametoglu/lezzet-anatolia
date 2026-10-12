'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * "İstendi" kümesi REF'te durur, state'te değil — ve bu, ölçülmüş bir arızanın düzeltmesidir:
   * küme `cache`in kendisiyken effect'in bağımlılığı da `cache` oluyordu, istek başlar başlamaz
   * ilk `setCache` effect'i yeniden kurup temizleyiciyi çalıştırıyor, dönen cevap `alive = false`
   * olduğu için atılıyordu. Ekranda hücreler sonsuza kadar iskelet kalıyordu (dev modda görüldü).
   */
  const requested = useRef(new Set<string>());
  /** `invalidate` sonrası okumayı yeniden başlatan tetik — açık satır değişmediği için gerekli. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (openId === null || requested.current.has(openId)) return;
    requested.current.add(openId);
    let alive = true;
    setCache((prev) => ({ ...prev, [openId]: { rows: null, error: null } }));
    void loadProductRowDetailAction(openId).then(({ data, error }) => {
      if (!alive) return;
      setCache((prev) => ({ ...prev, [openId]: { rows: data, error } }));
    });
    return () => {
      alive = false;
    };
  }, [openId, reloadToken]);

  const toggle = useCallback((productId: string) => {
    setOpenId((current) => (current === productId ? null : productId));
  }, []);

  /** Okumayı yeniden denetir (düşen istek) ya da yazma sonrası bayat kaydı düşürür. */
  const invalidate = useCallback((productId: string) => {
    // İki yerden de düşer: "istendi" işareti kalsaydı yeniden okuma hiç başlamazdı.
    requested.current.delete(productId);
    setCache((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setReloadToken((token) => token + 1);
  }, []);

  return { openId, toggle, invalidate, state: openId === null ? undefined : cache[openId] };
}
