'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { loadMorePricesAction } from './actions';
import { OfferDialog } from '@/components/operation/stock/offer-dialog';
import { CustomerPriceDialog } from './customer-price-dialog';
import { DiscountDialog } from './discount-dialog';
import { PriceDialog } from './price-dialog';
import { PricesDesktop } from './prices.desktop';
import { pricesUrl, type PriceScope, type PriceTab, type PricesUrlState } from './prices-url';
import type { CustomerPriceRow, DiscountRow, PriceRow, PricesData } from './prices-types';

// Fiyat ekranı client kökü: tek durum ağacı burada, diyaloglar görünümün üstünde. Operasyon web'i
// masaüstü-yalnız; mobil deneyim native uygulamada (`docs/uygulama`).
//
// SEKME GERÇEK gezinmedir (sığ değil): sekmelerin veri ihtiyacı ayrı, okuma sunucuda sekmeye bağlı.
// Sığ yazsaydık müşteriye özel sekmesi boş açılırdı.

interface PricesClientProps {
  data: PricesData;
  urlState: PricesUrlState;
}

export function PricesClient({ data, urlState }: PricesClientProps) {
  const router = useRouter();
  /**
   * Süzgeç/sekme turu SÜRÜYOR MU — `router.replace` bir RSC okumasıdır ve dönene kadar ekranda hiçbir
   * karşılık yoktu: liste eski satırlarla duruyor, tıklanan çip bile aktifleşmiyordu (aktiflik
   * `urlState`'ten, yani sunucudan geliyor). Operatör basıp basmadığını anlamıyordu.
   *
   * `isPending` iki yere bağlanıyor: çip şeridi (iyimser vurgu) ve tablo gövdesi (`busy` — satır
   * varsa soluklaşır, yoksa iskelet). Bağımsız ajan denetimi, 30.07.
   */
  const [pending, startNav] = useTransition();

  const go = (patch: Partial<PricesUrlState>) => {
    startNav(() => router.replace(pricesUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli — mekanizma ortak (`useSearchDraft`).
  const { draft: search, onDraft: onSearch, reset: resetSearch } = useSearchDraft(urlState.q, (q) => go({ q }));

  const onTab = (tab: PriceTab) => {
    // Sekme değişince ARAMA ve SÜZGEÇ düşer: ölçüt sekmeye bağlıdır ("marj-altı" kanal listesinde
    // anlamlı, özel fiyat listesinde karşılığı yok). Taşınsaydı yeni sekme, sebebi görünmeyen bir
    // süzgeçle açılırdı.
    resetSearch();
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

  // İndirim formu: kapalı · yeni (`'new'`) · düzenleme (kural kimliği) — özel fiyat diyaloğuyla
  // aynı desen, aynı gerekçe.
  const [discountState, setDiscountState] = useState<'closed' | 'new' | string>('closed');
  const editingDiscount =
    discountState === 'closed' || discountState === 'new'
      ? null
      : (data.discounts.find((d) => d.id === discountState) ?? null);
  useEffect(() => {
    if (discountState !== 'closed' && discountState !== 'new' && !editingDiscount) setDiscountState('closed');
  }, [discountState, editingDiscount]);

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
    navPending: pending,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onEdit: setEditingId,
    onEditCustomerPrice: (row: CustomerPriceRow | null) => setCustomerPriceState(row ? row.priceId : 'new'),
    onOpenOffer: setOfferStockId,
    onEditDiscount: (row: DiscountRow | null) => setDiscountState(row ? row.id : 'new'),
  };

  return (
    <>
      <PricesDesktop {...view} />
      {editing ? <PriceDialog key={editing.variantId} row={editing} onClose={() => setEditingId(null)} /> : null}
      {offerBatch ? (
        <OfferDialog key={offerBatch.id} batch={offerBatch} onClose={() => setOfferStockId(null)} />
      ) : null}
      {discountState !== 'closed' ? (
        <DiscountDialog
          key={discountState}
          editing={editingDiscount}
          categories={data.categories}
          collections={data.collections}
          onClose={() => setDiscountState('closed')}
        />
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
