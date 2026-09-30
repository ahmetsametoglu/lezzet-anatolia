'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { useListReturn } from '@/lib/use-list-return.hook';
import type { StorefrontCatalog, StorefrontProduct } from '@lezzet/application';
import { loadMoreCatalogAction } from './actions';
import type { PlaceMode } from '@/lib/delivery/read-place';
import type { CatalogFilterPatch, CatalogFilters, CatalogHref, Messages } from './catalog-types';
import { CatalogDesktop } from './catalog.desktop';
import { CatalogMobile } from './catalog.mobile';

/**
 * Katalogun cihaz çatalı ve sayfalama sahibi: süzgeç adreste yaşar, burada yalnız kaydırdıkça eklenen sayfalar durur. Süzgeç
 * değişince eklenen sayfalar sıfırlanır; ürüne gidip geri dönülünce aynı geçmiş kaydının sayfaları ve konumu geri kurulur.
 */
interface CatalogClientProps {
  t: Messages;
  locale: Locale;
  data: StorefrontCatalog;
  active: CatalogFilters;
  /** Yerin teslimat kipi — "adresime gönderilebilir" çipinin hâli (künye `catalog-types.ts`). */
  placeMode: PlaceMode;
  device: Device;
  /** Arama kutusundaki sorgu — sonraki sayfa isteği aynı süzgeci taşımalı. */
  search?: string;
}

export function CatalogClient({ t, locale, data, active, placeMode, device, search }: CatalogClientProps) {
  const resolved = useDevice(device);

  const listReturn = useListReturn<StorefrontProduct, StorefrontCatalog['nextCursor']>(JSON.stringify(['catalog', locale, active, search ?? null]));
  const [extraPages, setExtraPages] = useState<StorefrontProduct[]>(() => listReturn.restored?.items ?? []);
  const [cursor, setCursor] = useState(() => (listReturn.restored === null ? data.nextCursor : listReturn.restored.cursor));
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  /* Yeni ilk sayfa gelince kuyruk sayfaları render sırasında atılır, efektte değil: efekt bir render geç koştuğu için o karede eski
     süzgecin ürünleri yeni listeyle birleşirdi. */
  const [shown, setShown] = useState(data);
  if (shown !== data) {
    setShown(data);
    setExtraPages([]);
    setCursor(data.nextCursor);
    setTailFailed(false);
  }

  const products = [...data.products, ...extraPages];

  const { remember } = listReturn;
  useEffect(() => remember(extraPages, cursor), [remember, extraPages, cursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setTailFailed(false);
    // Süzgeç alan alan sayılmaz, yayılarak geçer ki eklenen yeni süzgeç sonraki sayfa isteğinden düşmesin.
    void loadMoreCatalogAction(locale, { ...active, search }, cursor)
      .then(({ data: page, errorKey }) => {
        // Liste olduğu yerde kalır ve düşüş görünüme söylenir: telefonun tetikleyicisi kendiliğinden yeniden denemez, sonda "Tekrar dene" çizer.
        if (errorKey || !page) {
          setTailFailed(true);
          return;
        }
        setExtraPages((prev) => [...prev, ...page.products]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  /** Bir süzgeci değiştirir, ötekileri korur; `null` kategori süzgecini kaldırır ve imleç taşınmaz, çünkü süzgeç değişince liste baştan başlar. */
  const hrefFor = (patch: CatalogFilterPatch): CatalogHref => {
    const category = patch.category === null ? undefined : (patch.category ?? active.category);
    const collection = patch.collection === null ? undefined : (patch.collection ?? active.collection);
    const sort = patch.sort ?? active.sort;
    const onlyOffers = patch.onlyOffers ?? active.onlyOffers;
    const onlyShippable = patch.onlyShippable ?? active.onlyShippable;
    const query: Record<string, string> = {};
    if (category) query.category = category;
    if (collection) query.collection = collection;
    if (sort !== 'featured') query.sort = sort;
    if (onlyOffers) query.offers = '1';
    if (onlyShippable) query.shippable = '1';
    // Arama da bir süzgeçtir: kategoriye basmak yazılmış aramayı silmez; yama aramayı değiştirebilir ya da `null` ile düşürebilir.
    const q = patch.search === null ? undefined : (patch.search ?? search);
    if (q) query.q = q;
    return { pathname: '/catalog', query };
  };

  const view = { t, locale, placeMode, data, products, hasMore: cursor !== null, loadingMore, tailFailed, onLoadMore, active, hrefFor, search };
  return resolved === 'mobile' ? <CatalogMobile {...view} /> : <CatalogDesktop {...view} />;
}
