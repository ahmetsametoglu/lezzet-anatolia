'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { loadMoreLevelsAction, loadMoreLossesAction } from './actions';
import { OfferDialog } from './offer-dialog';
import { RecallDialog } from './recall-dialog';
import { StockDesktop } from './stock.desktop';
import { StockMobile } from './stock.mobile';
import { stockUrl, type StockScope, type StockTab, type StockUrlState } from './stock-url';
import type { BatchView, StockData, StockLevelRow } from './stock-types';

// Stok ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
// Diyaloglar (teklif · geri çağırma) iki yüzeyin de üstünde — ikisinde de aynı iş yapılır.
//
// SEKME SIĞ yazılır (`replaceState`): üç sekme de AYNI okumadan besleniyor, sunucuya gitmenin
// getireceği veri yok. Süzgeçler ise RSC'yi yeniden okutur — süzme sunucuda yapılıyor (STACK §6).

/** Arama kutusunun URL'e yazılma gecikmesi (ms) — yazarken her tuşta sunucuya gidilmesin. */
const SEARCH_DEBOUNCE_MS = 350;

interface StockClientProps {
  data: StockData;
  device: Device;
  urlState: StockUrlState;
}

export function StockClient({ data, device, urlState }: StockClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();

  const [tab, setTab] = useState<StockTab>(urlState.tab);
  useEffect(() => setTab(urlState.tab), [urlState.tab]);

  const writeUrl = (patch: Partial<StockUrlState>) => {
    window.history.replaceState(null, '', stockUrl({ ...urlState, tab, ...patch }));
  };

  /** Süzgeç değişimi: URL'e yaz + RSC'yi yeniden okut (süzülmüş ilk sayfa gelir). */
  const applyFilters = (patch: Partial<StockUrlState>) => {
    router.replace(stockUrl({ ...urlState, ...patch, tab }), { scroll: false });
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli. Sunucu değeri değişince yerel giriş eşitlenir.
  const [search, setSearch] = useState(urlState.q);
  useEffect(() => setSearch(urlState.q), [urlState.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onTab = (next: StockTab) => {
    // Sekme değişince ARAMA düşer: terim sekmeye bağlıdır ("baklava" seviye listesinde anlamlı, imha
    // geçmişinde başka bir şey arar). Taşınsaydı yeni sekme, sebebi görünmeyen bir süzgeçle açılırdı.
    setTab(next);
    setSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    writeUrl({ tab: next, q: '' });
  };

  // ── Seviye listesi: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin
  // satırları yeni listede kalır.
  const [extraLevels, setExtraLevels] = useState<StockLevelRow[]>([]);
  const [levelCursor, setLevelCursor] = useState(data.nextCursor);
  const [loadingLevels, setLoadingLevels] = useState(false);
  useEffect(() => {
    setExtraLevels([]);
    setLevelCursor(data.nextCursor);
  }, [data.levels, data.nextCursor]);

  const onLoadMoreLevels = () => {
    if (!levelCursor || loadingLevels) return;
    setLoadingLevels(true);
    void loadMoreLevelsAction(window.location.search, levelCursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtraLevels((prev) => [...prev, ...page.levels]);
        setLevelCursor(page.nextCursor);
      })
      .finally(() => setLoadingLevels(false));
  };

  // ── İmha geçmişi: aynı desen, ayrı imleç ──
  const [extraLosses, setExtraLosses] = useState<StockData['losses']>([]);
  const [lossCursor, setLossCursor] = useState(data.lossCursor);
  const [loadingLosses, setLoadingLosses] = useState(false);
  useEffect(() => {
    setExtraLosses([]);
    setLossCursor(data.lossCursor);
  }, [data.losses, data.lossCursor]);

  const onLoadMoreLosses = () => {
    if (!lossCursor || loadingLosses) return;
    setLoadingLosses(true);
    void loadMoreLossesAction(lossCursor)
      .then(({ data: page }) => {
        if (!page) return;
        setExtraLosses((prev) => [...prev, ...page.losses]);
        setLossCursor(page.nextCursor);
      })
      .finally(() => setLoadingLosses(false));
  };

  const levels = [...data.levels, ...extraLevels];

  /**
   * Parti süzgeci CLIENT'ta uygulanır ve bu bilinçli: ölçüt bir raf ömrü KARARIDIR, sunucu satırla
   * birlikte kararı da gönderdi. Aynı ölçütü SQL'e kopyalamak eşiği iki yerde tutmak olurdu.
   * Süzgeç SATIR süzer, partiyi değil: bir boyun partilerinden biri ölçüte uyuyorsa satır kalır —
   * yanındaki sağlam partiyi gizlemek karar için gereken bağlamı yok ederdi.
   */
  const scoped = levels.filter((row) => matchesScope(row, urlState.scope));

  // Seçili satır KİMLİKLE tutulur, kayıt taze listeden türetilir (kopya tutulursa güncelleme yansımaz).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = scoped.find((r) => r.variantId === selectedId) ?? scoped[0] ?? null;

  // Teklif diyaloğu bir PARTİYE bağlı: hangi partinin teklifi düzenleniyorsa o. Kimlikle tutulur ki
  // sunucu tazelendiğinde diyalog eski satırın kopyasını göstermesin.
  const [offerStockId, setOfferStockId] = useState<string | null>(null);
  const allBatches = [...data.attention, ...levels.flatMap((r) => r.batches)];
  const offerBatch: BatchView | null = allBatches.find((b) => b.id === offerStockId) ?? null;
  useEffect(() => {
    // Parti listeden düştüyse (tükendi/silindi) diyalog kendiliğinden kapanır — boş forma bakılmaz.
    if (offerStockId && !offerBatch) setOfferStockId(null);
  }, [offerStockId, offerBatch]);

  const [recallOpen, setRecallOpen] = useState(false);

  const view = {
    data,
    levels: scoped,
    tab,
    onTab,
    search,
    onSearch,
    catFilter: urlState.cat,
    onCatFilter: (cat: string) => applyFilters({ cat }),
    scope: urlState.scope,
    onScope: (scope: StockScope) => applyFilters({ scope }),
    hasMoreLevels: levelCursor !== null,
    loadingLevels,
    onLoadMoreLevels,
    losses: [...data.losses, ...extraLosses],
    hasMoreLosses: lossCursor !== null,
    loadingLosses,
    onLoadMoreLosses,
    selectedId: selected?.variantId ?? null,
    onSelect: setSelectedId,
    onOpenOffer: setOfferStockId,
    onOpenRecall: () => setRecallOpen(true),
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <StockMobile {...view} /> : <StockDesktop {...view} />}
      {offerBatch ? (
        <OfferDialog key={offerBatch.id} batch={offerBatch} onClose={() => setOfferStockId(null)} />
      ) : null}
      {recallOpen ? <RecallDialog onClose={() => setRecallOpen(false)} /> : null}
    </>
  );
}

/** Satır süzgece uyuyor mu — kararlar sunucudan geldi, burada yalnız seçim var. */
function matchesScope(row: StockLevelRow, scope: StockScope): boolean {
  switch (scope) {
    case 'expiry':
      return row.attentionCount > 0;
    case 'offer':
      return row.batches.some((b) => b.offerPriceCents !== null);
    case 'low':
      return row.belowMin;
    default:
      return true;
  }
}
