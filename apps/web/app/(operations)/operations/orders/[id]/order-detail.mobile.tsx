'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { whatsAppChatLink } from '@lezzet/domain-core';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { statusLabel, statusTone } from '../orders-labels';
import { ORDERS_PATH } from '../orders-url';
import { paymentHeadline } from './order-detail-labels';
import type { OrderDetailView } from './order-detail-types';

// Sipariş DETAYI — TELEFON. Tasarımın alt kümesi: künye · kalan tahsilat (büyük rakam) · salt
// okunur kalem listesi · teslim kanıtı · tek birincil geçiş.
//
// Düzenleme, kısmi karşılama ve iade telefonda YOK ve bu bir eksiklik değil, karardır: o üç iş
// kalem kalem adet ve akıbet seçmeyi gerektiriyor — küçük ekranda yanlış dokunuşun bedeli para.
// Ekran bunu cümleyle söyler, düğmeyi gizleyip sessiz kalmaz.

interface OrderDetailMobileProps {
  order: OrderDetailView;
  onAdvance: (to: OrderDetailView['status']) => void;
  busy: boolean;
  error: string | null;
}

export function OrderDetailMobile({ order, onAdvance, busy, error }: OrderDetailMobileProps) {
  const next = order.allowedNext[0] ?? null;
  const chatUrl = whatsAppChatLink(order.customer.phone);
  const openCents = order.payment.refundDueCents > 0 ? order.payment.refundDueCents : order.payment.openCents;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <header className="flex items-center gap-3 border-b border-ops-line px-4 py-3">
        <Link href={ORDERS_PATH} className="font-ops-display text-ops-lead text-ops-muted">
          ←
        </Link>
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-display text-ops-section font-semibold text-ops-ink">
            Sipariş {order.referenceNo ?? '—'}
          </span>
          <span className="truncate font-ops-body text-ops-micro text-ops-muted">
            {order.customerName} · {order.channel.toUpperCase()}
          </span>
        </div>
        <Badge tone={statusTone(order.status)} dot>
          {statusLabel(order.status)}
        </Badge>
      </header>

      {error ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-4 py-2 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Telefondaki ilk soru para: ne kadar alınacak (ya da geri verilecek). */}
        <div
          className={`flex flex-col gap-1 rounded-ops-card border px-4 py-3.5 ${
            order.payment.overdue
              ? 'border-ops-red-line bg-ops-red-bg'
              : openCents > 0
                ? 'border-ops-amber-line bg-ops-amber-bg'
                : 'border-ops-olive-line bg-ops-olive-bg'
          }`}
        >
          <span
            className={`font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] ${
              order.payment.overdue ? 'text-ops-red' : openCents > 0 ? 'text-ops-amber' : 'text-ops-olive-dark'
            }`}
          >
            {paymentHeadline(order)}
          </span>
          <span
            className={`font-ops-mono text-[26px] font-medium ${
              order.payment.overdue ? 'text-ops-red' : openCents > 0 ? 'text-ops-amber' : 'text-ops-olive-dark'
            }`}
          >
            {money(openCents > 0 ? openCents : order.payment.totalCents)}
          </span>
          <span
            className={`font-ops-body text-ops-xs ${
              order.payment.overdue ? 'text-ops-red' : openCents > 0 ? 'text-ops-amber-dark' : 'text-ops-olive-dark'
            }`}
          >
            {order.payment.onAccount ? `Vade ${order.payment.dueDate ?? '—'}` : (order.payment.method ?? 'yöntem yok')} ·
            toplam {money(order.payment.totalCents)}
          </span>
        </div>

        {/* Telefonda ulaşma düğmeleri PARADAN hemen sonra: kapıdaki ilk iş müşteriyi bulmak. */}
        {chatUrl || order.customer.phone ? (
          <div className="flex gap-2.5">
            {chatUrl ? (
              <a
                href={chatUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[46px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-ops-card border border-ops-line-strong font-ops-display text-ops-sm font-semibold text-ops-strong"
              >
                <WhatsAppIcon />
                WhatsApp
              </a>
            ) : null}
            {order.customer.phone ? (
              <a
                href={`tel:${order.customer.phone}`}
                className="flex min-h-[46px] flex-1 cursor-pointer items-center justify-center rounded-ops-card border border-ops-line-strong font-ops-display text-ops-sm font-semibold text-ops-strong"
              >
                Ara
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
          <div className="border-b border-ops-line bg-ops-subtle px-3.5 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-ink">
            Kalemler <span className="font-ops-body text-ops-xs font-normal text-ops-muted">{order.lines.length}</span>
          </div>
          {order.lines.map((line) => (
            <div key={line.id} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3.5 py-2.5">
              <span className="w-9 flex-none font-ops-mono text-ops-xs text-ops-muted">
                {line.fulfilledQty < line.qty ? `${line.fulfilledQty}/${line.qty}` : `${line.qty}×`}
              </span>
              <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-ink">{line.title}</span>
              <span className="font-ops-mono text-ops-xs text-ops-ink">{money(line.lineTotalCents)}</span>
            </div>
          ))}
          <p className="px-3.5 py-2.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            Kalem düzenleme, kısmi karşılama ve iade hesabı masaüstünde yapılır.
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
          <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">Teslimat</span>
          <span className="font-ops-body text-ops-xs text-ops-body">
            {order.delivery.type === 'shipping' ? 'Kargo' : `Rota · ${shortDate(order.delivery.date)}`}
            {order.delivery.courierName ? ` · ${order.delivery.courierName}` : ''}
          </span>
          {order.delivery.address ? (
            <span className="font-ops-body text-ops-micro text-ops-muted">{order.delivery.address}</span>
          ) : null}
          {/* Hangi depodan — künye (bkz. masaüstü notu). */}
          {order.delivery.warehouse ? (
            <span className="font-ops-body text-ops-micro text-ops-muted">
              {order.delivery.warehouse.name} ({order.delivery.warehouse.code})
            </span>
          ) : null}
        </div>

        {order.delivery.proof ? (
          <div className="flex flex-col gap-1 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3.5 py-3">
            <span className="font-ops-display text-ops-xs font-semibold text-ops-olive-dark">
              Teslim kanıtı{order.delivery.proof.when ? ` · ${shortDateTime(order.delivery.proof.when)}` : ''}
            </span>
            <span className="font-ops-body text-ops-xs text-ops-olive-dark">
              {order.delivery.proof.parts.join(' · ') || 'kayıt var'}
              {order.delivery.proof.by ? ` · onaylayan ${order.delivery.proof.by}` : ''}
            </span>
          </div>
        ) : null}
      </div>

      {next ? (
        <div className="border-t border-ops-line bg-ops-subtle px-4 py-3">
          <Button variant="primary" className="w-full justify-center py-3" disabled={busy} onClick={() => onAdvance(next)}>
            {statusLabel(next)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
