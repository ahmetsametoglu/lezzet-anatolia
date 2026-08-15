'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { whatsAppChatLink } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { Metric } from '@/components/operation/ui/metric';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { contentText, deliveryText, paymentText, paymentToneClass, statusLabel, statusTone } from './orders-labels';
import { loadOrderPeekAction } from './actions';
import { ORDERS_PATH } from './orders-url';
import type { OrderPeek, OrderRow } from './orders-types';

// Siparişe HIZLI BAKIŞ — SAĞ PANEL (15.08, kullanıcı kararı; önceden diyalogdu).
//
// Tasarım bu bakışı bir pencere olarak çizmişti ("Bu bir bakıştır") ama pencere listeyi örtüyor:
// operatör bir satıra bakarken ötekileri göremiyor, karşılaştırmak için aç-kapa turluyordu.
// Ürünler ekranının deseni buraya taşındı — liste solda akar, seçili satırın açılımı sağda durur
// (bilinçli sapma, `design/KARARLAR.md`). İçerik diyalogdakiyle AYNI: pencerenin işi neyse panelin
// işi de o — tablo satırının kısaltmalarını açmak, hiçbir şeyi DEĞİŞTİRMEMEK.
//
// Burada hiçbir kayıt değişmez — durum ilerletme dahil; karar detay sayfasında verilir. Tek eylem
// istisnası MÜŞTERİYE ULAŞMAK: listeden çıkmayı gerektirmez ve hiçbir kaydı değiştirmez.

interface OrderPreviewProps {
  /** Seçili satır; `null` = seçim yok, panel davet çizer. */
  row: OrderRow | null;
}

export function OrderPreview({ row }: OrderPreviewProps) {
  if (row === null) {
    return (
      <aside className="flex min-h-0 flex-col items-center justify-center gap-1.5 bg-ops-subtle p-8 text-center">
        <span className="font-ops-body text-ops-base text-ops-muted">Bir satır seçin</span>
        <span className="font-ops-body text-ops-xs text-ops-faint">
          Kalemleri, teslimatı ve tahsilatı burada açılır — sipariş numarası doğrudan detaya gider.
        </span>
      </aside>
    );
  }
  return <SelectedOrder key={row.id} row={row} />;
}

/** Seçili satırın açılımı — `key={row.id}` ile taze kurulur, bayat peek bir sonraki satıra sızmaz. */
function SelectedOrder({ row }: { row: OrderRow }) {
  const delivery = deliveryText(row, shortDate);
  const [peek, setPeek] = useState<OrderPeek | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derinlik seçimde çekilir: liste sorgusu elli satırın kalemini taşımaz.
  useEffect(() => {
    let alive = true;
    void loadOrderPeekAction(row.id).then(({ data, error: actionError }) => {
      if (!alive) return;
      if (actionError) setError(actionError);
      else setPeek(data);
    });
    return () => {
      alive = false;
    };
  }, [row.id]);

  const phone = peek?.customer.phone ?? null;
  const chatUrl = whatsAppChatLink(phone);

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto bg-ops-card">
      {/* Başlık — pencerenin başlık barının panel hâli; künye (şirket adı ya da telefon) BURADA
          yazılır, listede değil: aynı adı iki kez gören operatör zaten satırı seçer. */}
      <div className="flex items-start justify-between gap-3 border-b border-ops-line px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Sipariş {row.referenceNo ?? '—'}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {[row.customerName, row.customerHint, row.channel.toUpperCase(), row.isGift ? 'ikram' : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <Link
          href={`${ORDERS_PATH}/${row.id}`}
          className="flex-none cursor-pointer rounded-ops-btn bg-ops-olive px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-card transition-colors hover:bg-ops-olive-dark"
        >
          Detayı aç →
        </Link>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(row.status)} dot>
            {statusLabel(row.status)}
          </Badge>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {shortDateTime(row.createdAt)} · {row.source}
          </span>

          {/* Ulaşma — metin YOK, yalnız sohbeti açar: ne yazılacağı operatörün kararı. */}
          <div className="ml-auto flex items-center gap-2">
            {chatUrl ? (
              <a
                href={chatUrl}
                target="_blank"
                rel="noreferrer"
                className="flex cursor-pointer items-center gap-1.5 rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive"
              >
                <WhatsAppIcon size={13} />
                WhatsApp
              </a>
            ) : null}
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive"
              >
                Ara
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Metric label="Tutar" value={money(row.totalCents)} hint="KDV dahil, müşterinin ödediği" />
          <Metric label="İçerik" value={contentText(row)} />
          <Metric label="Teslim" value={delivery.main} hint={delivery.meta || undefined} />
        </div>

        {/* Kalemler — satırın "3 kalem"i burada adlanır. Eksik giden adet satırın kendi başında. */}
        <section className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-subtle">
          <div className="border-b border-ops-line px-3.5 py-2 font-ops-display text-ops-xs font-semibold text-ops-ink">
            Kalemler
          </div>
          {error ? (
            <p className="px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-red">{error}</p>
          ) : peek === null ? (
            <p className="px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-muted">yükleniyor…</p>
          ) : (
            peek.lines.map((line) => {
              // Eksiklik ancak hazırlık kesinleştiyse vardır; öncesinde `fulfilledQty` yalnız
              // "henüz yazılmadı" demektir (`isFulfillmentSettled`).
              const short = peek.fulfillmentSettled && line.fulfilledQty < line.qty;
              return (
                <div key={line.id} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3.5 py-2 last:border-b-0">
                  <span
                    className={`w-10 flex-none font-ops-mono text-ops-xs ${
                      short ? 'font-semibold text-ops-amber-dark' : 'text-ops-muted'
                    }`}
                  >
                    {short ? `${line.fulfilledQty}/${line.qty}` : `${line.qty}×`}
                  </span>
                  {/* Görsel adetle ad arasında (15.08, kullanıcı isteği): hızlı bakışın işi tanımaktır. */}
                  <Thumbnail src={line.imageUrl} alt={line.title} size={24} />
                  <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-ink">{line.title}</span>
                  <span className="font-ops-mono text-ops-xs text-ops-ink">{money(line.lineTotalCents)}</span>
                </div>
              );
            })
          )}
        </section>

        <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-2.5">
          <span className="font-ops-body text-ops-xs text-ops-muted">Tahsilat</span>
          <span className={`font-ops-mono text-ops-sm ${paymentToneClass(row)}`}>{paymentText(row, money)}</span>
        </div>

        {/* Teslimat — tabloda semt vardı, burada adresin tamamı ve kim götürüyor. */}
        {peek ? (
          <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-2.5">
            <PeekRow label="Adres" value={peek.delivery.address || 'adres kopyası yok'} />
            <PeekRow
              label="Gün"
              value={peek.delivery.date ? shortDate(peek.delivery.date) : peek.delivery.type === 'shipping' ? 'kargo' : 'girilmemiş'}
            />
            <PeekRow label="Kurye" value={peek.delivery.courierName ?? 'atanmadı · Rotalar'} />
          </div>
        ) : null}

        {/* Bağlar — açık bir talep varsa operatör bunu ilerletmeden ÖNCE bilmeli. */}
        {peek && peek.links.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
            <span className="font-ops-display text-ops-xs font-semibold text-ops-amber">Bu siparişin bağları var</span>
            {peek.links.map((link) => (
              <span key={link.key} className="font-ops-body text-ops-xs text-ops-amber-dark">
                {link.ref} · {link.state} — {link.title}
              </span>
            ))}
          </div>
        ) : null}

        {row.payment.overdue ? (
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-red">
            Vadesi geçti. Bu müşteride açık gecikme varken yeni vadeli sipariş açılamaz — tahsilat yapılana kadar
            checkout&apos;ta &quot;hesaba&quot; seçeneği kapalıdır.
          </span>
        ) : null}
      </div>
    </aside>
  );
}

function PeekRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-14 flex-none font-ops-body text-ops-xs text-ops-muted">{label}</span>
      <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-ink">{value}</span>
    </div>
  );
}
