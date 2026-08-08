'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { num } from '@/components/operation/ui/format';
import { PREP_NOTES, channelLabel, queueStatus } from './preparation-labels';
import type { PreparationData, PreparationLineView, PreparationOrderView } from './preparation-types';

/**
 * **Hazırlık masası** — kuyruk + seçili siparişin kalemleri (10.1–10.3).
 * `design/project/Operasyon - Depo Hazirlik.dc.html`.
 *
 * ── MASA, RAF DEĞİL ─────────────────────────────────────────────────────────
 * Tasarımın kendi cümlesi: *"Raf karşısı toplama akışı ayrı cihaz uygulamasında; bu ekran masadan
 * yönetim ve toplu tarama içindir."* Bu yüzden kalemler TEK TABLODA ve hepsi birden görünüyor —
 * telefonun tek-kalem akışı buraya taşınmadı; masadaki soru "bugün ne var, nerede kaldık".
 *
 * ── ROL DUVARI ──────────────────────────────────────────────────────────────
 * Fiyat, tutar, maliyet ve müşterinin adresi/telefonu bu yüzeyde YOKTUR; yalnız ad (koli
 * eşleştirme). Kural burada bir disiplin değil, verinin şekli: okuma bu alanları hiç getirmiyor.
 */
interface PreparationViewProps {
  data: PreparationData;
  selectedId: string | null;
  onSelect: (orderId: string) => void;
  busy: boolean;
  error: string | null;
  onConfirmLine: (order: PreparationOrderView, line: PreparationLineView) => void;
  onProblem: (order: PreparationOrderView, line: PreparationLineView) => void;
}

export function PreparationDesktop({ data, selectedId, onSelect, busy, error, onConfirmLine, onProblem }: PreparationViewProps) {
  const selected = data.orders.find((order) => order.orderId === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Hazırlık"
        // Depo adı DAİMA yazılı (10.7): kuyruk tek bir deponun kuyruğu, ve hangisi olduğu
        // başlıkta durmazsa çok depolu operatör yanlış rafın önünde doğru listeye bakar.
        subtitle={`${data.warehouseName} · Bugün hazırlanacak ${num(data.orders.length)} · hazır ${num(data.readyCount)}`}
      />

      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      {data.orders.length === 0 ? (
        <EmptyState title="Bugün hazırlanacak sipariş yok" description={PREP_NOTES.empty} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,1fr)_2.1fr] overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-ops-line">
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {data.orders.map((order) => (
                <li key={order.orderId}>
                  <QueueRow order={order} selected={order.orderId === selectedId} onSelect={() => onSelect(order.orderId)} />
                </li>
              ))}
            </ul>
            <p className="border-t border-ops-line-soft bg-ops-subtle px-5 py-2.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
              {PREP_NOTES.queueHint}
            </p>
          </div>

          <div className="flex min-h-0 flex-col overflow-y-auto bg-ops-panel">
            {selected ? (
              <OrderPanel order={selected} busy={busy} onConfirmLine={onConfirmLine} onProblem={onProblem} />
            ) : (
              <EmptyState title="Sipariş seçin" description={PREP_NOTES.pick} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QueueRow({ order, selected, onSelect }: { order: PreparationOrderView; selected: boolean; onSelect: () => void }) {
  const status = queueStatus(order);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer flex-col gap-1 border-b border-ops-line-soft px-5 py-3 text-left transition-colors hover:bg-ops-subtle ${
        selected ? 'bg-ops-olive-bg' : ''
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">
          {order.referenceNo ?? '—'} · {order.customerName}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {channelLabel(order)} · {num(order.lineCount)} kalem · {num(order.totalQty)} paket
      </span>
    </button>
  );
}

/** Seçili siparişin kalem tablosu — tasarımın orta karesi. */
function OrderPanel({
  order,
  busy,
  onConfirmLine,
  onProblem,
}: {
  order: PreparationOrderView;
  busy: boolean;
  onConfirmLine: (order: PreparationOrderView, line: PreparationLineView) => void;
  onProblem: (order: PreparationOrderView, line: PreparationLineView) => void;
}) {
  const kalan = order.lineCount - order.pickedLineCount;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-ops-line px-5 py-3.5">
        <span className="font-ops-display text-ops-lg font-semibold text-ops-ink">
          {order.referenceNo ?? '—'} · {order.customerName}
        </span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {channelLabel(order)} · {num(order.lineCount)} kalem · {num(order.totalQty)} paket
        </span>
        <span className="mt-1 font-ops-body text-ops-xs font-semibold text-ops-body">
          {num(order.pickedLineCount)} / {num(order.lineCount)} kalem toplandı
        </span>
      </div>

      <div className="grid grid-cols-[1.5fr_72px_2.2fr_112px] gap-x-3 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        <span>Kalem</span>
        <span className="text-center">İstenen</span>
        <span>Şu partilerden alın</span>
        <span className="text-right">Durum</span>
      </div>

      <ul>
        {order.lines.map((line) => (
          <li key={line.itemId}>
            <LineRow line={line} busy={busy} onConfirm={() => onConfirmLine(order, line)} onProblem={() => onProblem(order, line)} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-ops-line px-5 py-3.5">
        <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{PREP_NOTES.confirmHint}</p>
        {/* Sipariş bütünü için ayrı bir "hazır" düğmesi YOK: son kalem onaylanınca kapı siparişi
            kendisi `ready`'ye alıyor. İkinci bir düğme, aynı kararı iki yerden verilebilir kılardı
            ve biri unutulduğunda sipariş toplandığı hâlde kuyrukta kalırdı. Yazılan şey bir düğme
            değil, kalan işin sayısı. */}
        <p
          className={`rounded-ops-card border px-3 py-2.5 font-ops-body text-ops-xs leading-[1.5] ${
            order.isComplete
              ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
              : 'border-ops-line bg-ops-surface-sunken text-ops-body'
          }`}
        >
          {order.isComplete ? 'Sipariş hazır — rota/kargoya düştü.' : `${PREP_NOTES.completeHint} ${num(kalan)} kalem kaldı.`}
        </p>
        <p className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{PREP_NOTES.fieldHint}</p>
      </div>
    </div>
  );
}

function LineRow({
  line,
  busy,
  onConfirm,
  onProblem,
}: {
  line: PreparationLineView;
  busy: boolean;
  onConfirm: () => void;
  onProblem: () => void;
}) {
  return (
    <div className="grid grid-cols-[1.5fr_72px_2.2fr_112px] items-start gap-x-3 border-b border-ops-line-soft px-5 py-3">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{line.title}</span>
        {/* Teklif kalemi rozetle işaretli: satırın neden farklı davrandığı okunabilmeli. */}
        {line.isPinned ? <Badge tone="violet">TEKLİF</Badge> : null}
      </span>

      <span className="text-center font-ops-mono text-ops-sm text-ops-strong">{num(line.orderedQty)}</span>

      <span className="flex min-w-0 flex-col gap-1">
        {line.suggestion.length === 0 ? (
          /* Öneri KALAN adet için kuruluyor (kapının kuralı: "toplanan tekrar toplanmaz"), yani
             toplanmış kalemde boş olması normaldir — kırmızı "parti bulunamadı" demek, bitmiş bir
             işi arıza gibi göstermek olurdu (ölçüldü 08.08, ilk çekimde öyle görünüyordu).
             Boşluğun iki ayrı anlamı var ve ekran ikisini ayırmak zorunda. */
          <span className={`font-ops-body text-ops-xs ${line.isPicked ? 'text-ops-faint' : 'text-ops-red'}`}>
            {line.isPicked ? 'tamamlandı — kalan yok' : 'Uygun parti bulunamadı; stok girişi gerekiyor.'}
          </span>
        ) : (
          line.suggestion.map((batch, index) => (
            <span key={batch.stockId} className="flex flex-wrap items-baseline gap-x-1.5 font-ops-body text-ops-xs text-ops-body">
              <strong className="font-ops-mono text-ops-strong">{num(batch.qty)} paket</strong>
              <span className="text-ops-muted">
                · son tarih {formatDate(batch.expiryDate)}
                {/* "önce bu" — kuralın ADI geçmez, sonucu yazılır (iç terim yasağı). Yalnız
                    bölünmüş öneride anlamlı: tek partide "önce bu" diyecek bir ikincisi yok. */}
                {index === 0 && line.suggestion.length > 1 ? ` (${PREP_NOTES.firstBatch})` : ''}
              </span>
              {batch.location ? <Badge tone="slate">{batch.location}</Badge> : null}
            </span>
          ))
        )}
        {line.isPinned ? <span className="font-ops-body text-ops-micro text-ops-violet">{PREP_NOTES.pinned}</span> : null}
        {line.hasShortfall ? (
          <span className="font-ops-body text-ops-micro text-ops-amber-dark">
            {num(line.shortfallQty)} paket karşılanamıyor — "Sorun" ile işaretleyin.
          </span>
        ) : null}
      </span>

      <span className="flex flex-col items-end gap-1.5">
        {line.isPicked ? (
          <Badge tone="olive">toplandı ✓</Badge>
        ) : (
          <>
            <Button variant="primary" size="sm" disabled={busy || line.suggestion.length === 0} onClick={onConfirm}>
              ✓ Hazırlandı
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={onProblem}>
              Sorun ▾
            </Button>
          </>
        )}
      </span>
    </div>
  );
}

/** Son tarih kısa biçimde — "18 Eyl". Yıl yazılmıyor: raf karşısındaki karar bu yılın kararı. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
