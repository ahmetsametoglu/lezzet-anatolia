'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { StorefrontCatalog, StorefrontProduct } from '@lezzet/application';
import { loadMoreCatalogAction } from './actions';
import type { PlaceMode } from '@/lib/delivery/read-place';
import type { CatalogFilterPatch, CatalogFilters, CatalogHref, Messages } from './catalog-types';
import { CatalogDesktop } from './catalog.desktop';
import { CatalogMobile } from './catalog.mobile';

/**
 * Katalogun cihaz çatalı ve SAYFALAMA sahibi.
 *
 * Süzme sunucuda çözülür ve seçim URL'de yaşar — o yüzden süzgeç state'i burada YOK. Burada olan tek
 * durum, kaydırdıkça eklenen sayfalar: ürün listesi sınırsız büyüyen bir kümedir, tamamı tek turda
 * çekilemez (`CLAUDE.md`: tüm listeler sonsuz kaydırma → okumalar keyset imleçli).
 *
 * Süzgeç değişince eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin ürünleri yeni listede kalır.
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

  const [extraPages, setExtraPages] = useState<StorefrontProduct[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraPages([]);
    setCursor(data.nextCursor);
  }, [data.products, data.nextCursor]);

  const products = [...data.products, ...extraPages];

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    // Süzgeç TEK TEK sayılmaz, olduğu gibi geçer: alan alan yazmak `onlyShippable`'ı bir kez
    // düşürmüştü ve sonraki sayfa süzgeçsiz geliyordu. Yayarak geçmek yeni süzgeci de taşır.
    void loadMoreCatalogAction(locale, { ...active, search }, cursor)
      .then(({ data: page, errorKey }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (errorKey || !page) return;
        setExtraPages((prev) => [...prev, ...page.products]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  /**
   * Bir süzgeci değiştirir, diğerlerini KORUR — çipe basmak sıralamayı sıfırlamaz. `null` kategori
   * süzgeci kaldırır ("Tümü"). Sayfa imleci bilerek taşınmaz: süzgeç değişince liste baştan başlar.
   */
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
    // Arama da bir süzgeçtir: kategoriye basmak yazılmış aramayı silmemeli.
    if (search) query.q = search;
    return { pathname: '/catalog', query };
  };

  const view = { t, locale, placeMode, data, products, hasMore: cursor !== null, loadingMore, onLoadMore, active, hrefFor, search };
  return resolved === 'mobile' ? <CatalogMobile {...view} /> : <CatalogDesktop {...view} />;
}
