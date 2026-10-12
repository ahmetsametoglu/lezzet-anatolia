'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel } from '@lezzet/types';
import { loadProductRowDetailAction } from '../../actions/row-detail';
import type { VariantRowDetail } from '../../products-types';
import { marginAfterWrite } from './price-math';

/**
 * AÇILAN SATIRIN boy ayrıntısı: barkod · depo dağılımı · en yakın parti · kanal fiyatları.
 * Listeyle gelmeyen dört şey; tek turda okunur ve okunduğu üründe önbellekte kalır.
 *
 * Önbellek bilinçli: operatör iki ürün arasında gidip gelirken her dönüşte aynı turu ödemek ve
 * kartları iskelete düşürmek, ekranı sebepsiz oynatırdı.
 */
export interface RowDetailState {
  /** `null` → okuma sürüyor; dizi → geldi. */
  rows: VariantRowDetail[] | null;
  error: string | null;
}

export function useRowDetail(productId: string | null) {
  const [cache, setCache] = useState<Record<string, RowDetailState>>({});
  /**
   * "İstendi" kümesi REF'te durur, state'te değil — ölçülmüş bir arızanın düzeltmesi: küme
   * `cache`in kendisiyken effect'in bağımlılığı da `cache` oluyor, ilk yazım effect'i yeniden
   * kurup temizleyiciyi çalıştırıyor ve dönen cevap atılıyordu (hücreler sonsuza kadar iskelet).
   */
  const requested = useRef(new Set<string>());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (productId === null || requested.current.has(productId)) return;
    requested.current.add(productId);
    let alive = true;
    // Yalnız HİÇ veri yokken iskelete düşülür: yenilemede kartlar yerinde kalır, ekran oynamaz.
    setCache((prev) => (prev[productId] ? prev : { ...prev, [productId]: { rows: null, error: null } }));
    void loadProductRowDetailAction(productId).then(({ data, error }) => {
      if (!alive) return;
      setCache((prev) => ({ ...prev, [productId]: { rows: data, error } }));
    });
    return () => {
      alive = false;
    };
  }, [productId, reloadToken]);

  /** Yeniden okur (düşen istek ya da tam formdan dönüş) — mevcut kartlar silinmez. */
  const refresh = useCallback((id: string) => {
    requested.current.delete(id);
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * Yazılan fiyatı YERİNDE uygular: sunucu zaten yazdı, ekranın onu yeniden okumasına gerek yok.
   * Liste ve kartlar aynı anda güncellenir, hiçbir şey yeniden yüklenmez (kullanıcı kararı).
   */
  const applyPrice = useCallback((id: string, variantId: string, channel: Channel, amountCents: number) => {
    setCache((prev) => {
      const entry = prev[id];
      if (!entry?.rows) return prev;
      const rows = entry.rows.map((row) => {
        if (row.variantId !== variantId || row.price === null) return row;
        const price = {
          ...row.price,
          [channel]: { ...row.price[channel], amountCents },
          marginPercent: marginAfterWrite(row.price, channel, amountCents),
        };
        return { ...row, price };
      });
      return { ...prev, [id]: { ...entry, rows } };
    });
  }, []);

  return { state: productId === null ? undefined : cache[productId], refresh, applyPrice };
}
