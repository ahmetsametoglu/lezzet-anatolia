'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { loadMorePricesAction } from './actions';
import { OfferDialog } from '@/components/operation/stock/offer-dialog';
import { CustomerPriceDialog } from './customer-price-dialog';
import { PriceDialog } from './price-dialog';
import { PricesDesktop } from './prices.desktop';
import { PricesMobile } from './prices.mobile';
import { pricesUrl, type PriceScope, type PriceTab, type PricesUrlState } from './prices-url';
import type { CustomerPriceRow, PriceRow, PricesData } from './prices-types';

// Fiyat ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
// Fiyat diyaloğu iki yüzeyin de üstünde — ikisinde de aynı iş yapılır.
//
// SEKME GERÇEK gezinmedir (sığ değil): sekmelerin veri ihtiyacı ayrı, okuma sunucuda sekmeye bağlı.
// Sığ yazsaydık müşteriye özel sekmesi boş açılırdı.

/** Arama kutusunun URL'e yazılma gecikmesi (ms) — yazarken her tuşta sunucuya gidilmesin. */
const SEARCH_DEBOUNCE_MS = 350;

interface PricesClientProps {
  data: PricesData;
  device: Device;
  urlState: PricesUrlState;
}

export function PricesClient({ data, device, urlState }: PricesClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();

  const go = (patch: Partial<PricesUrlState>) => {
    router.replace(pricesUrl({ ...urlState, ...patch }), { scroll: false });
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli. Sunucu değeri değişince yerel giriş eşitlenir.
  const [search, setSearch] = useState(urlState.q);
  useEffect(() => setSearch(urlState.q), [urlState.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => go({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onTab = (tab: PriceTab) => {
    // Sekme değişince ARAMA ve SÜZGEÇ düşer: ölçüt sekmeye bağlıdır ("marj-altı" kanal listesinde
    // anlamlı, özel fiyat listesinde karşılığı yok). Taşınsaydı yeni sekme, sebebi görünmeyen bir
    // süzgeçle açılırdı.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch('');
    go({ tab, q: '', scope: 'all' });
  };

  // ── Liste: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin
  // satırları yeni listede kalır.
  const [extra, setExtra] = useState<PriceRow[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
  }, [data.rows, data.nextCursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMorePricesAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const all = [...data.rows, ...extra];
  const rows = all.filter((row) => matchesScope(row, urlState.scope));

  // Sayaçlar SÜZGEÇSİZ listeden çıkar: çip "3 marj-altı" derken kendi süzgecini saymamalı.
  const counts = {
    rows: all.length,
    priced: all.filter((r) => !r.missingPrice).length,
    below: all.filter((r) => r.belowTarget === true).length,
    missing: all.filter((r) => r.missingPrice).length,
  };

  // Düzenlenen satır KİMLİKLE tutulur, kayıt taze listeden türetilir (kopya tutulursa güncelleme
  // yansımaz). Satır listeden düşerse diyalog kendiliğinden kapanır.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = all.find((r) => r.variantId === editingId) ?? null;
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  // Özel fiyat diyaloğu üç hâlli: kapalı · yeni kayıt (`'new'`) · düzenleme (satır kimliği). Tek
  // durumda tutuluyor ki "hem yeni hem düzenleme açık" gibi imkânsız bir hâl doğmasın.
  const [customerPriceState, setCustomerPriceState] = useState<'closed' | 'new' | string>('closed');
  const editingCustomerPrice =
    customerPriceState === 'closed' || customerPriceState === 'new'
      ? null
      : (data.customerPrices.find((r) => r.priceId === customerPriceState) ?? null);
  useEffect(() => {
    // Satır listeden düştüyse (kaldırıldı) diyalog kendiliğinden kapanır — boş forma bakılmaz.
    if (customerPriceState !== 'closed' && customerPriceState !== 'new' && !editingCustomerPrice) {
      setCustomerPriceState('closed');
    }
  }, [customerPriceState, editingCustomerPrice]);

  // Teklif diyaloğu bir PARTİYE bağlı; kimlikle tutulur ki sunucu tazelendiğinde diyalog eski
  // satırın kopyasını göstermesin. Parti listeden düşerse (tükendi) diyalog kendiliğinden kapanır.
  const [offerStockId, setOfferStockId] = useState<string | null>(null);
  const offerBatch = data.offers.find((b) => b.id === offerStockId) ?? null;
  useEffect(() => {
    if (offerStockId && !offerBatch) setOfferStockId(null);
  }, [offerStockId, offerBatch]);

  const view = {
    data,
    rows,
    counts,
    tab: urlState.tab,
    onTab,
    search,
    onSearch,
    catFilter: urlState.cat,
    onCatFilter: (cat: string) => go({ cat }),
    scope: urlState.scope,
    onScope: (scope: PriceScope) => go({ scope }),
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onEdit: setEditingId,
    onEditCustomerPrice: (row: CustomerPriceRow | null) => setCustomerPriceState(row ? row.priceId : 'new'),
    onOpenOffer: setOfferStockId,
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <PricesMobile {...view} /> : <PricesDesktop {...view} />}
      {editing ? <PriceDialog key={editing.variantId} row={editing} onClose={() => setEditingId(null)} /> : null}
      {offerBatch ? (
        <OfferDialog key={offerBatch.id} batch={offerBatch} onClose={() => setOfferStockId(null)} />
      ) : null}
      {customerPriceState !== 'closed' ? (
        <CustomerPriceDialog
          key={customerPriceState}
          editing={editingCustomerPrice}
          onClose={() => setCustomerPriceState('closed')}
        />
      ) : null}
    </>
  );
}

/** Satır süzgece uyuyor mu — kararlar sunucudan geldi, burada yalnız seçim var. */
function matchesScope(row: PriceRow, scope: PriceScope): boolean {
  switch (scope) {
    case 'below':
      return row.belowTarget === true;
    case 'missing':
      return row.missingPrice;
    case 'auto':
      return row.autoPrice;
    default:
      return true;
  }
}
