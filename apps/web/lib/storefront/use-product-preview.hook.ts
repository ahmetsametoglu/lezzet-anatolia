'use client';

import { useSyncExternalStore } from 'react';
import { productPreviewOf, type ProductPreview } from './product-preview';

/** Kayıt sayfa açılmadan önce yazılır, açıkken değişmez; dinlenecek bir olay yok. */
const subscribe = () => () => undefined;

/** Ürünün kart bilgisi; sunucuda ve hidrasyonda `null`, ki doğrudan açılan sayfanın ilk çizimi sunucu çıktısıyla aynı olsun. */
export function useProductPreview(slug: string): ProductPreview | null {
  return useSyncExternalStore(
    subscribe,
    () => productPreviewOf(slug),
    () => null,
  );
}
