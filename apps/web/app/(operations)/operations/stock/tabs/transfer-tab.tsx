'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { KeysetCursor } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { num } from '@/components/operation/ui/format';
import { Table, withCells } from '@/components/operation/ui/table';
import type { ColumnTrack } from '@/components/operation/ui/table-columns';
import { DispatchTransferDialog } from '../dialogs/dispatch-transfer-dialog';
import { TransferDetailDialog } from '../dialogs/transfer-detail-dialog';
import { loadMoreTransferHistoryAction, openTransferDetailAction } from '../transfer-actions';
import { historyOutcome, TRANSFER_NOTES, transitAge } from '../transfer-labels';
import type { HistoryRowView, TransferDetailView, TransfersPageView, TransitRowView } from '../transfer-types';

/**
 * TRANSFER SEKMESİ (19.6 → Stok'a taşındı, kullanıcı kararı 19.08). Gerekçe 22.26'nın kendisi:
 * "mal girer, durur, çıkar — üçü tek stoğun üç anı"; transfer o yolculuğun depolar arası adımı,
 * rampadaki iş de mal kabulle aynı iş (say, yaz). Ayrı nav girişi bu deseni geri şişiriyordu.
 *
 * İç sekme YOK, iki BÖLÜM var: YOLDAKİLER (fiziksel küme — sayfalanmaz, TAM liste: "yoldaki mal
 * hiçbir deponun stoğunda değildir, sanal transit depo yoktur") ve GEÇMİŞ (olay kaydı — keyset,
 * imleç URL'e yazılmaz; kayıt düzeltilmez, yanlışın düzeltmesi ters yönde yeni sevktir).
 */

const TRANSIT_TRACKS: ColumnTrack[] = [
  { key: 'ref', header: 'Belge', width: '130px' },
  { key: 'route', header: 'Kaynak → hedef', width: 'minmax(150px,1fr)' },
  { key: 'dispatched', header: 'Sevk', width: 'minmax(120px,160px)' },
  { key: 'items', header: 'Kalem / adet', width: '110px' },
  { key: 'age', header: 'Yolda', width: '84px', align: 'center' },
  { key: 'cta', header: '', width: '104px', align: 'right' },
];

const HISTORY_TRACKS: ColumnTrack[] = [
  { key: 'ref', header: 'Belge', width: '130px' },
  { key: 'route', header: 'Kaynak → hedef', width: 'minmax(150px,1fr)' },
  { key: 'dispatched', header: 'Sevk', width: '110px' },
  { key: 'items', header: 'Kalem / adet', width: '150px' },
  { key: 'outcome', header: 'Sonuç', width: 'minmax(120px,150px)', align: 'right' },
];

/** "STR → KEHL" — kodlar mono hap; yön oku iki tesisin arasını söyler. */
function RouteCell({ from, to }: { from: string; to: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded-[6px] border border-ops-blue-line bg-ops-blue-bg px-1.5 py-0.5 font-ops-mono text-ops-micro font-semibold text-ops-blue">
        {from}
      </span>
      <span className="font-ops-body text-ops-xs text-ops-faint">→</span>
      <span className="rounded-[6px] border border-ops-blue-line bg-ops-blue-bg px-1.5 py-0.5 font-ops-mono text-ops-micro font-semibold text-ops-blue">
        {to}
      </span>
    </span>
  );
}

function dateTimeOf(iso: string): string {
  return (
    new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) +
    ' ' +
    new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
}

export function TransferTab({ view }: { view: TransfersPageView }) {
  const router = useRouter();
  const [historyRows, setHistoryRows] = useState<HistoryRowView[]>(view.history.rows);
  const [cursor, setCursor] = useState<KeysetCursor | null>(view.history.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [detail, setDetail] = useState<TransferDetailView | null>(null);
  const [busy, startTransition] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      const { data, error: msg } = await loadMoreTransferHistoryAction(cursor);
      if (!data) {
        setError(msg ?? 'Liste yüklenemedi.');
        return;
      }
      setError(null);
      setHistoryRows((rows) => [...rows, ...data.rows]);
      setCursor(data.nextCursor);
    });
  };

  /**
   * İçerik penceresi — kabul düğmesi de kalem hücresi de buradan geçer (19.08): pencere gerçeği
   * gösterir; kabul formu mu salt-okunur mu, dönen `canReceive` söyler.
   */
  const openDetail = (transferId: string, origin: 'transit' | 'history') => {
    startTransition(async () => {
      const { data, error: msg } = await openTransferDetailAction(transferId);
      if (!data) {
        setError(msg ?? 'Kayıt açılamadı.');
        return;
      }
      setError(null);
      setDetail(data);
      // Yoldakiler satırından açıldı ama kayıt artık yolda değil: araya biri girmiş — pencere
      // güncel hâli gösterir (ör. "Tam kabul"), bayat liste arkada tazelenir.
      if (origin === 'transit' && data.status !== 'in_transit') router.refresh();
    });
  };

  /** Yazma başarıyla bitti: pencereler kapanır, sunucu verisi tazelenir (rozet dahil). */
  const done = () => {
    setDispatchOpen(false);
    setDetail(null);
    setError(null);
    router.refresh();
  };

  const transitColumns = withCells<TransitRowView>(TRANSIT_TRACKS, {
    ref: (t) => <span className="font-ops-mono text-ops-xs text-ops-ink">{t.referenceNo}</span>,
    route: (t) => <RouteCell from={t.fromCode} to={t.toCode} />,
    dispatched: (t) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-ops-body text-ops-xs text-ops-ink">{dateTimeOf(t.dispatchedAt)}</span>
        {/* Sevk edeni satır taşır: "kim yükledi" sorusu gecikmiş sevkiyatta ilk sorulan şeydir. */}
        <span className="truncate font-ops-body text-ops-micro text-ops-muted">{t.dispatchedByName ?? '—'}</span>
      </span>
    ),
    // "2 kalem · 8 ad." satırın arkasını SÖYLEMEZ — hücre içerik penceresinin kapısıdır (19.08:
    // "hangi ürün, kaç adet belli değil"). Kapsam dışı da tıklar: görüş alanı içeriği de kapsar.
    items: (t) => (
      <ItemsCell
        label={`${num(t.lineCount)} kalem · ${num(t.totalQty)} ad.`}
        onOpen={() => openDetail(t.id, 'transit')}
      />
    ),
    age: (t) => {
      const age = transitAge(t);
      return <Badge tone={age.tone}>{age.label}</Badge>;
    },
    cta: (t) =>
      t.canReceive ? (
        <Button size="sm" variant={t.ageTone === 'late' ? 'primary' : 'secondary'} onClick={() => openDetail(t.id, 'transit')}>
          Kabul et
        </Button>
      ) : (
        // Kapsam dışı hedef: düğme yerine gerçek — kabulü malı sayan yapar, o da hedefin personeli.
        <span className="font-ops-body text-ops-micro text-ops-faint">hedef kabul eder</span>
      ),
  });

  const historyColumns = withCells<HistoryRowView>(HISTORY_TRACKS, {
    ref: (t) => <span className="font-ops-mono text-ops-xs text-ops-ink">{t.referenceNo}</span>,
    route: (t) => <RouteCell from={t.fromCode} to={t.toCode} />,
    dispatched: (t) => (
      <span className="font-ops-mono text-ops-xs text-ops-muted">
        {new Date(t.dispatchedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
      </span>
    ),
    // Kısmi/sıfır kabulde iki sayı birden okunur: "30 → 28" farkın kendisidir. Hücre tıklanır:
    // "HANGİ kalem eksik geldi" sorusunun cevabı içerik penceresinde satır satır (19.08).
    items: (t) => (
      <ItemsCell
        label={`${num(t.lineCount)} kalem · ${num(t.sentQty)}${
          t.receivedQty !== null && t.receivedQty !== t.sentQty ? ` → ${num(t.receivedQty)}` : ''
        } ad.`}
        onOpen={() => openDetail(t.id, 'history')}
      />
    ),
    outcome: (t) => {
      const o = historyOutcome(t);
      return <Badge tone={o.tone}>{o.label}</Badge>;
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2.5 px-6 pb-1 pt-4">
        <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">
          Yoldakiler · {num(view.transit.length)}
        </span>
        {view.lateCount > 0 ? <Badge tone="amber">{TRANSFER_NOTES.lateBanner(view.lateCount)}</Badge> : null}
        <Button size="sm" onClick={() => setDispatchOpen(true)}>
          + Sevk
        </Button>
      </div>
      <p className="px-6 pb-2 font-ops-body text-ops-xs text-ops-muted">{TRANSFER_NOTES.transitIntro}</p>
      {view.transit.length === 0 ? (
        <div className="mx-6 mb-4 flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-bg px-4 py-3">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-olive-dark">{TRANSFER_NOTES.transitEmptyTitle}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">{TRANSFER_NOTES.transitEmptyBody}</span>
        </div>
      ) : (
        <>
          {/* Table kökü `flex-1` taşır (tam-sayfa listeler için doğru); BÖLÜM içinde büyüyüp
              alttaki bandı sayfa dibine iterdi — sarmalayıcı büyümeyi keser, satır kadar yer tutar. */}
          <div className="flex-none">
            <Table columns={transitColumns} rows={view.transit} rowKey={(t) => t.id} />
          </div>
          {view.transit.some((t) => t.ageTone === 'late') ? (
            // Geciken sevkiyatın sebebi satır altında DEĞİL burada tek sefer anlatılır: aynı
            // cümleyi üç satırda üç kez basmak uyarıyı gürültüye çevirirdi.
            <p className="mx-6 my-3 rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-xs text-ops-amber-dark">
              {TRANSFER_NOTES.lateRow}
            </p>
          ) : null}
        </>
      )}

      <div className="px-6 pb-1 pt-5">
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Geçmiş</span>
      </div>
      <p className="px-6 pb-2 font-ops-body text-ops-xs text-ops-muted">{TRANSFER_NOTES.historyIntro}</p>
      {historyRows.length === 0 ? (
        <p className="mx-6 mb-4 font-ops-body text-ops-sm text-ops-muted">{TRANSFER_NOTES.historyEmpty}</p>
      ) : (
        <>
          <div className="flex-none">
            <Table columns={historyColumns} rows={historyRows} rowKey={(t) => t.id} />
          </div>
          {cursor ? (
            <div className="flex justify-center px-6 py-4">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={busy}>
                {busy ? 'Yükleniyor…' : 'Daha eski transferler'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <DispatchTransferDialog
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        onDone={done}
        warehouses={view.warehouses}
        // `none` (boş kapsam) kaynak-kilitli dala düşer: aktif depo yok, pencere "üst bardan
        // depo seçin" der — fail-closed; zaten o kullanıcı listede hiçbir şey göremiyor.
        scopeKind={view.context.scope.kind === 'all' ? 'all' : 'limited'}
        activeWarehouseId={view.context.activeWarehouseId}
        transitDays={view.transitDays}
      />
      <TransferDetailDialog detail={detail} onClose={() => setDetail(null)} onDone={done} />
    </div>
  );
}

/** "N kalem · M ad." hücresi — içerik penceresinin kapısı; noktalı alt çizgi "arkasında detay var" der. */
function ItemsCell({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="İçeriği gör"
      className="cursor-pointer text-left font-ops-body text-ops-xs text-ops-body underline decoration-dotted underline-offset-[3px] hover:text-ops-ink"
    >
      {label}
    </button>
  );
}
