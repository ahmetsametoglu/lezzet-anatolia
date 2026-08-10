'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { buttonClass } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { money, shortDate } from '@/components/operation/ui/format';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { paymentTone } from '../customers-labels';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@lezzet/types';
import type { OrderSummaryView } from '@/lib/order/summary';

/**
 * Sipariş özeti diyaloğu — müşteri ekranındaki sipariş kartına tıklanınca açılır.
 *
 * **Bu bir GÖZ ATMADIR, iş yeri değil.** Operatör bir müşterinin vadesine karar verirken "şu sipariş
 * neydi, ödendi mi" diye bakar; ekranını kaybetmeden bakabilmeli. Durum geçişi, tahsilat kaydı ve
 * iade burada YOK ve olmamalı: o eylemler durum makinesinin arayüzüdür ve iki yüzeye kopyalanırsa
 * bir gün ayrışırlar (CLAUDE.md §1). Diyalogun altındaki köprü tam o yüzden var.
 *
 * Ödeme durumu KOLONDAN değil motordan geliyor (bkz. `readOrderSummary`) — kolona güvenen bir özet,
 * tamamı ödenmiş siparişi "kısmi" gösterebilirdi.
 */
interface CustomerOrderDialogProps {
  /** `null` = okuma sürüyor (diyalog açık ama içerik gelmedi). */
  summary: OrderSummaryView | null;
  /** Okuma düştüyse sebebi. Sessiz kalsa diyalog sonsuza kadar "Yükleniyor…" gösterirdi. */
  error: string | null;
  /** Başlıkta gösterilecek referans — okuma bitmeden de bilinir (karttan gelir). */
  referenceNo: string | null;
  onClose: () => void;
}

export function CustomerOrderDialog({ summary, error, referenceNo, onClose }: CustomerOrderDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={referenceNo ?? 'Taslak sipariş'}
      subtitle={
        summary ? `${shortDate(summary.createdAt)} · ${ORDER_STATUS_LABELS[summary.status]}` : error ? 'okunamadı' : 'Yükleniyor…'
      }
      maxWidth={620}
      footer={
        summary ? (
          <div className="flex w-full items-center gap-3">
            <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
              Durum geçişi, tahsilat ve iade sipariş detayında yapılır.
            </span>
            {/* Bağa BUTON görünümü ortak yardımcıdan (`buttonClass`) — ham sınıf zinciri yazmak,
                düğme stilini ikinci bir yerde tanımlamaktı. */}
            <Link href={summary.href} className={buttonClass({ variant: 'dark', size: 'sm' })}>
              Sipariş detayını aç
            </Link>
          </div>
        ) : null
      }
    >
      {error ? (
        <span className="font-ops-body text-ops-base text-ops-red" role="alert">
          {error}
        </span>
      ) : !summary ? (
        // Diyalog GERÇEK özetin şeklinde bekliyor: rozet şeridi · üç kalem · üç toplam satırı.
        // "Yükleniyor…" yazan tek satır, diyaloğu bir anda üç katına çıkarıyordu — açılan kutu
        // büyürken kullanıcının imleci artık başka bir şeyin üzerinde kalıyor.
        <div className="flex flex-col gap-4" aria-hidden="true">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-[7px]" />
            <Skeleton className="h-5 w-24 rounded-[7px]" />
            <Skeleton className="ml-auto h-3 w-28" />
          </div>
          <div className="flex flex-col rounded-ops-card border border-ops-line">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <Skeleton className={`h-3.5 ${i === 1 ? 'w-2/5' : 'w-3/5'}`} />
                  <Skeleton className="h-2.5 w-1/4" />
                </span>
                <Skeleton className="h-3 w-16 justify-self-end" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ops-line pt-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Üst şerit: karar için gereken üç şey — ödendi mi, ne kadar kaldı, nasıl gidiyor. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={paymentTone(summary.paymentStatus)} dot>
              {PAYMENT_STATUS_LABELS[summary.paymentStatus]}
            </Badge>
            {summary.openCents > 0 ? (
              <Badge tone="amber">Kalan {money(summary.openCents)}</Badge>
            ) : null}
            {summary.onAccount ? <Badge tone="blue">Vadeli</Badge> : null}
            {summary.isGiftOrder ? <Badge tone="slate">Hediye</Badge> : null}
            <span className="ml-auto font-ops-body text-ops-xs text-ops-muted">
              {summary.deliveryType === 'route'
                ? `Rota · ${summary.deliveryDate ? shortDate(summary.deliveryDate) : 'gün yok'}`
                : 'Kargo'}
            </span>
          </div>

          {/* Kalemler */}
          <div className="flex flex-col rounded-ops-card border border-ops-line">
            {summary.lines.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate font-ops-body text-ops-base text-ops-ink">{line.title}</span>
                  <span className="font-ops-body text-ops-xs text-ops-muted">
                    {line.qty} × {money(line.unitPriceCents)}
                    {/* Karşılanan miktar sipariş edilenden AZSA söylenir: kısmi karşılama, ödeme
                        durumunun da sebebidir — sessiz geçilirse "neden borçlu" sorusu cevapsız kalır. */}
                    {line.fulfilledQty !== line.qty ? ` · karşılanan ${line.fulfilledQty}` : ''}
                    {line.lineDiscountCents > 0 ? ` · indirim ${money(line.lineDiscountCents)}` : ''}
                  </span>
                </span>
                <span className="justify-self-end font-ops-mono text-ops-sm font-medium text-ops-ink">
                  {money(line.lineTotalCents)}
                </span>
              </div>
            ))}
          </div>

          {/* Toplamlar */}
          <div className="flex flex-col gap-1">
            <TotalRow label="Ara toplam" cents={summary.subtotalCents} />
            {summary.discountCents > 0 ? <TotalRow label="İndirim" cents={-summary.discountCents} /> : null}
            {summary.shippingCents > 0 ? <TotalRow label="Kargo" cents={summary.shippingCents} /> : null}
            <TotalRow label="Toplam" cents={summary.totalCents} strong />
          </div>
        </div>
      )}
    </Dialog>
  );
}

interface TotalRowProps {
  label: string;
  cents: number;
  strong?: boolean;
}

function TotalRow({ label, cents, strong = false }: TotalRowProps) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'border-t border-ops-line pt-1.5' : ''}`}>
      <span className={`font-ops-body text-ops-sm ${strong ? 'font-semibold text-ops-ink' : 'text-ops-muted'}`}>{label}</span>
      <span className={`font-ops-mono ${strong ? 'text-ops-lead font-semibold text-ops-ink' : 'text-ops-sm text-ops-strong'}`}>
        {money(cents)}
      </span>
    </div>
  );
}
