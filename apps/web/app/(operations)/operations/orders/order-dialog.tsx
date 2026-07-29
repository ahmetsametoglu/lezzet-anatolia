'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { whatsAppChatLink } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Badge } from '@/components/operation/ui/badge';
import { Metric } from '@/components/operation/ui/metric';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { contentText, deliveryText, paymentText, paymentToneClass, statusLabel, statusTone } from './orders-labels';
import { loadOrderPeekAction } from './actions';
import { ORDERS_PATH } from './orders-url';
import type { OrderPeek, OrderRow } from './orders-types';

// Siparişe HIZLI BAKIŞ — tasarımın kendi sözü: **"Bu bir bakıştır."**
//
// PENCERENİN İŞİ: tablo satırı kısaltır — semt yazar (adres değil), "3 kalem" yazar (ne olduğunu
// değil), müşteri adı yazar (numarasını değil). Bu pencere o kısaltmaları AÇAR. Operatörün satıra
// tıklarken sorduğu şey budur: "doğru sipariş mi, içinde ne var, nereye gidiyor, kime ulaşırım?"
//
// Burada hiçbir şey DEĞİŞMEZ — durum ilerletme de dahil. Bir siparişi kalemlerini, tahsilatını ve
// geçmişini görmeden ilerletmek kararı bağlamından koparır; üstelik "hazırlandı" deponun,
// "teslim edildi" kuryenin gerçeğine bağlıdır. Karar detay sayfasında verilir.
//
// TEK EYLEM istisnası MÜŞTERİYE ULAŞMAK: onu yapmak için listeden çıkmak gerekmez, hiçbir kaydı da
// değiştirmez. Kapıda ulaşılamayan siparişte operatörün ilk hamlesi zaten budur.
//
// (Tasarımın alt barında "Durumu ilerlet →" ve "Rota ata" da duruyor; ikisi de bilinçli sapma —
// aynı tasarımın gövde metni kararları detaya yolluyor, kurye ise gün planının kararıdır.)

interface OrderDialogProps {
  row: OrderRow;
  onClose: () => void;
}

export function OrderDialog({ row, onClose }: OrderDialogProps) {
  const delivery = deliveryText(row, shortDate);
  const [peek, setPeek] = useState<OrderPeek | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derinlik açılışta çekilir: liste sorgusu elli satırın kalemini taşımaz.
  useEffect(() => {
    let alive = true;
    setPeek(null);
    setError(null);
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
    <Dialog
      open
      onClose={onClose}
      maxWidth={640}
      title={`Sipariş ${row.referenceNo ?? '—'}`}
      /* Künye (şirket adı ya da telefon) BURADA yazılır, listede değil: aynı adı iki kez gören
         operatör zaten satırı açar. */
      subtitle={[row.customerName, row.customerHint, row.channel.toUpperCase(), row.isGift ? 'ikram' : null]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Link
            href={`${ORDERS_PATH}/${row.id}`}
            className="cursor-pointer rounded-ops-btn bg-ops-olive px-5 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-card transition-colors hover:bg-ops-olive-dark"
          >
            Detayı aç →
          </Link>
        </>
      }
    >
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
          checkout'ta "hesaba" seçeneği kapalıdır.
        </span>
      ) : null}
    </Dialog>
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
