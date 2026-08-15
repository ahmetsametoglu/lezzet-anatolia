'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { loadMoreLevelsAction, loadMoreLossesAction } from './actions';
import { OfferDialog } from '@/components/operation/stock/offer-dialog';
import { IntakeDialog } from './dialogs/intake-dialog';
import { WriteOffDialog } from './dialogs/write-off-dialog';
import { RecallDialog } from './recall-dialog';
import { StockDesktop } from './stock.desktop';
import { stockUrl, type LossPeriod, type StockScope, type StockTab, type StockUrlState } from './stock-url';
import type { ReceiveOutcome } from '@/lib/warehouse/intake-types';
import type { OfferHandoff } from './stock-handoff';
import type { BatchView, StockData, StockLevelRow } from './stock-types';

// Stok ekranı client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.
//
// SEKME SIĞ yazılır (`replaceState`): üç sekme de AYNI okumadan besleniyor, sunucuya gitmenin
// getireceği veri yok. Süzgeçler ise RSC'yi yeniden okutur — süzme sunucuda yapılıyor (STACK §6).

interface StockClientProps {
  data: StockData;
  urlState: StockUrlState;
  /** Asistan önerisinden gelindiyse ön dolgu (22.5); `null` ise ekran hiç değişmez. */
  handoff?: OfferHandoff | null;
}

export function StockClient({ data, urlState, handoff = null }: StockClientProps) {
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

  const [tab, setTab] = useState<StockTab>(urlState.tab);
  useEffect(() => setTab(urlState.tab), [urlState.tab]);

  const writeUrl = (patch: Partial<StockUrlState>) => {
    window.history.replaceState(null, '', stockUrl({ ...urlState, tab, ...patch }));
  };

  /** Süzgeç değişimi: URL'e yaz + RSC'yi yeniden okut (süzülmüş ilk sayfa gelir). */
  const applyFilters = (patch: Partial<StockUrlState>) => {
    startNav(() => router.replace(stockUrl({ ...urlState, ...patch, tab }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), adrese gecikmeli — mekanizma ortak (`useSearchDraft`).
  // Gecikme her iki yolda da gerekli: sığ yazım da bir `replaceState`, her tuşta tarayıcı geçmişine
  // dokunmanın (ya da sunucuya gitmenin) karşılığı yok.
  /**
   * **Terim SEKMEYE göre farklı yere gidiyor** (22.31).
   *
   * Seviyelerde arama SUNUCUDA yapılır: liste keyset sayfalı ve yalnız ilk sayfa yüklü — istemcide
   * süzmek, sayfa 2'deki ürünü "yok" göstermek olurdu. Çıkışlarda ise terim yüklenmiş satırlarda
   * çalışıyor (dönemle sınırlı bir liste) ve adrese SIĞ yazılır: her tuşta sunucuya gitmenin karşılığı
   * yok, yenilemede terimin kaybolmaması yeter.
   */
  const { draft: search, onDraft: onSearch, reset: resetSearch } = useSearchDraft(urlState.q, (q) =>
    tab === 'levels' ? applyFilters({ q }) : writeUrl({ q }),
  );

  /**
   * **Sekme artık SUNUCUYA gidiyor** (22.26).
   *
   * Eskiden sığdı (`replaceState`) ve doğruydu: üç sekme de aynı okumadan besleniyordu. Dört sekmenin
   * verisi ayrı — mal kabul bekleyen siparişleri, çıkışlar dönem kayıtlarını okuyor — ve sığ geçiş
   * açılan sekmeyi boş bırakırdı. Karşılığında her sekme yalnız kendi sorgularını atıyor.
   *
   * Sekme değişince ARAMA düşer: terim sekmeye bağlıdır ("baklava" seviye listesinde anlamlı,
   * çıkışlarda başka bir şey arar). Taşınsaydı yeni sekme, sebebi görünmeyen bir süzgeçle açılırdı.
   */
  const onTab = (next: StockTab) => {
    setTab(next);
    resetSearch();
    startNav(() => router.replace(stockUrl({ ...urlState, tab: next, q: '' }), { scroll: false }));
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
    void loadMoreLossesAction(window.location.search, lossCursor)
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
  //
  // **Öneriden gelindiyse diyalog DOĞRUDAN açılır** (22.5): operatör kuyruktan bu ekrana zaten "bu
  // teklife bak" diye geldi, ayrıca satırı listede aratmak fazladan bir adım olurdu.
  const [offerStockId, setOfferStockId] = useState<string | null>(handoff?.batchId ?? null);
  const allBatches = [...data.attention, ...levels.flatMap((r) => r.batches)];
  const offerBatch: BatchView | null = allBatches.find((b) => b.id === offerStockId) ?? null;
  useEffect(() => {
    // Parti listeden düştüyse (tükendi/silindi) diyalog kendiliğinden kapanır — boş forma bakılmaz.
    if (offerStockId && !offerBatch) setOfferStockId(null);
  }, [offerStockId, offerBatch]);

  /**
   * **Devredilen parti listede YOK** — ve bu sessiz geçilemez. Üç sebebi olabilir ve üçü de
   * operatörün bilmesi gereken şeyler: parti satılıp tükendi · imha edildi · personelin depo
   * kapsamı dışında. Diyalog açılmadığı için künye sayfada durur (bulunan hâlde künye diyaloğun
   * İÇİNDE, kararın verildiği yerde).
   *
   * `data.attention` sayfalanmıyor (`page.tsx`: parti listesi tek turda, eksiksiz) — yani "listede
   * yok" gerçekten yok demek, "bu sayfada yok" değil.
   */
  const handoffMissing = handoff !== null && !allBatches.some((b) => b.id === handoff.batchId);

  // `null` = kapalı, '' = boş kutuyla açık, dolu = satırdan gelen lot ile açık.
  const [recallLot, setRecallLot] = useState<string | null>(null);

  /**
   * Mal kabul formu — `null` kapalı; açıkken `{ purchaseOrderId }` (sipariş kimliği ya da `null` =
   * irsaliyesiz). Sarmalayıcı nesne ŞART: düz `string | null` durumunda "irsaliyesiz kabul açık" ile
   * "form kapalı" ayırt edilemezdi.
   */
  const [intakeOpen, setIntakeOpen] = useState<{ purchaseOrderId: string | null } | null>(null);
  const [intakeOutcome, setIntakeOutcome] = useState<ReceiveOutcome | null>(null);

  // Stoktan düş tutanağı — `null` kapalı, '' boş formla açık, dolu = satırdan gelen parti seçili.
  const [writeOffStockId, setWriteOffStockId] = useState<string | null>(null);
  const [writeOffDone, setWriteOffDone] = useState<string | null>(null);

  // Depo kırılımı açık olan boy — aynı anda tek satır (19.5). Kimlikle tutulur: liste tazelenince
  // satır nesnesi değişir ama kimlik durur, açık kırılım kapanmaz.
  const [openVariantId, setOpenVariantId] = useState<string | null>(null);

  const view = {
    navPending: pending,
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
    warehouseFilter: urlState.depo,
    // Depo SUNUCUDA süzülür (kategori gibi): parti kuyruğu ve kullanılabilirlik sorgusu ona göre
    // atılıyor — client'ta süzmek yalnız görünen sayfayı daraltır, sayılarla çelişirdi.
    onWarehouseFilter: (depo: string) => applyFilters({ depo }),
    hasMoreLevels: levelCursor !== null,
    loadingLevels,
    onLoadMoreLevels,
    losses: [...data.losses, ...extraLosses],
    period: urlState.period,
    // Dönem SUNUCUDA süzülür: toplam ve sebep dağılımı dönemin tamamı üzerinden hesaplanıyor,
    // client'ta süzmek yalnız görünen sayfayı daraltır ve toplamla çelişirdi.
    onPeriod: (period: LossPeriod) => applyFilters({ period }),
    hasMoreLosses: lossCursor !== null,
    loadingLosses,
    onLoadMoreLosses,
    selectedId: selected?.variantId ?? null,
    onSelect: setSelectedId,
    openVariantId,
    onToggleSplit: (variantId: string) => setOpenVariantId((cur) => (cur === variantId ? null : variantId)),
    onOpenOffer: setOfferStockId,
    onOpenIntake: (purchaseOrderId: string | null) => setIntakeOpen({ purchaseOrderId }),
    onOpenWriteOff: (stockId?: string) => setWriteOffStockId(stockId ?? ''),
    onOpenRecall: (lot?: string) => setRecallLot(lot ?? ''),
    // Yalnız BULUNAMAYAN devir sayfaya iner; bulunan hâlin künyesi diyaloğun içinde.
    handoffMissing: handoffMissing ? handoff : null,
  };

  return (
    <>
      <StockDesktop {...view} />
      {offerBatch ? (
        <OfferDialog
          key={offerBatch.id}
          batch={offerBatch}
          // Künye yalnız DEVREDİLEN parti açıkken: operatör listeden başka bir partiye geçerse
          // pencere sıradan bir teklif penceresidir, asistanın cümlesi orada yanlış olurdu.
          handoff={handoff && handoff.batchId === offerBatch.id ? handoff : null}
          onClose={() => setOfferStockId(null)}
        />
      ) : null}
      {recallLot !== null ? <RecallDialog initialLot={recallLot} onClose={() => setRecallLot(null)} /> : null}

      {/* Mal kabul formu — sekmenin verisi yoksa açılmaz (sekme kapalıyken zaten tetiklenemez). */}
      {intakeOpen && data.intake ? (
        <IntakeDialog
          key={intakeOpen.purchaseOrderId ?? 'free'}
          purchaseOrderId={intakeOpen.purchaseOrderId}
          intake={data.intake}
          showCost={data.canSeeCost}
          onClose={() => setIntakeOpen(null)}
          onDone={(outcome) => {
            setIntakeOpen(null);
            setIntakeOutcome(outcome);
          }}
        />
      ) : null}

      {intakeOutcome ? <IntakeOutcomeNotice outcome={intakeOutcome} onClose={() => setIntakeOutcome(null)} /> : null}

      {writeOffStockId !== null ? (
        <WriteOffDialog
          batches={data.writeOffBatches}
          initialStockId={writeOffStockId}
          onClose={() => setWriteOffStockId(null)}
          onDone={(message) => {
            setWriteOffStockId(null);
            setWriteOffDone(message);
          }}
        />
      ) : null}

      {/* Belge numarası kaydın hemen ardından okunabilmeli — denetmenin elindeki kâğıt onunla eşleşir. */}
      {writeOffDone ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-[420px] items-center gap-3 rounded-ops-card border border-ops-olive-line bg-ops-white px-4 py-3 shadow-lg">
          <span className="font-ops-body text-ops-sm text-ops-ink">{writeOffDone}</span>
          <button
            type="button"
            onClick={() => setWriteOffDone(null)}
            className="cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-muted hover:text-ops-ink"
          >
            Kapat
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Kabul sonrası özet — uyarılar ve farklar.
 *
 * Kabul TAMAMLANDI; bu pencere bir onay istemiyor, olan biteni söylüyor. Kısa raf ömrü uyarısı
 * burada görünüyor çünkü kabul anında engellemedi (`DOMAIN §4`) ama kayda geçti — operatörün bunu
 * bilmesi, aynı tedarikçiden gelen sonraki paleti daha dikkatli açmasını sağlar.
 */
function IntakeOutcomeNotice({ outcome, onClose }: { outcome: ReceiveOutcome; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[420px] flex-col gap-2 rounded-ops-card border border-ops-olive-line bg-ops-white px-4 py-3 shadow-lg">
      <span className="font-ops-display text-ops-sm font-semibold text-ops-olive-dark">
        Kabul tamamlandı — {outcome.batches} parti yazıldı
      </span>
      {outcome.warnings.length > 0 ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
          {outcome.warnings.length} partide kısa raf ömrü uyarısı var; kabul engellenmedi.
        </span>
      ) : null}
      {outcome.differences.length > 0 ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
          {outcome.differences.length} kalemde fark kayda geçti.
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer self-end font-ops-body text-ops-xs font-semibold text-ops-muted hover:text-ops-ink"
      >
        Kapat
      </button>
    </div>
  );
}

/** Satır süzgece uyuyor mu — kararlar sunucudan geldi, burada yalnız seçim var. */
function matchesScope(row: StockLevelRow, scope: StockScope): boolean {
  switch (scope) {
    case 'expiry':
      return row.attentionCount > 0;
    case 'offer':
      return row.batches.some((b) => b.offerPriceCents !== null);
    default:
      return true;
  }
}
