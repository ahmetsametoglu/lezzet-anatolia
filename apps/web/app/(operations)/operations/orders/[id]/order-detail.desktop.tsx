'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Timeline } from '@/components/operation/ui/timeline';
import { CustomerChannels } from '@/components/operation/ui/customer-channels';
import { orderChatContext } from '@/components/operation/ui/customer-channel-model';
import { money, percent, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { DOOR_CHECK_NOTE } from '@/components/operation/ui/labels';
import { statusLabel, statusTone } from '../orders-labels';
import { OrderLines } from './components/order-lines';
import {
  boxTrailOf,
  DECISION_COPY,
  ORDER_NOTES,
  PROOF_KIND_LABEL,
  SHIPMENT_STATUS_LABEL,
  creditFill,
  creditPercent,
  emptyMovementsText,
  initialsOf,
  moneyCells,
  paymentHeadline,
  sourceLabel,
  timelineNote,
  timelineSteps,
} from './order-detail-labels';
import type { OrderDetailView } from './order-detail-types';
import type { OrderDecision } from '@lezzet/domain-core';
import type { OrderSource, OrderStatus } from '@lezzet/types';
import { cardClass } from '@/components/operation/ui/card';

// Bölüm sırası yoğun ve sade siparişte aynıdır, verisi olmayan blok hiç çizilmez: operatör aynı ekranda hep aynı yere bakar.

interface OrderDetailDesktopProps {
  order: OrderDetailView;
  onAdvance: (to: OrderStatus) => void;
  onDecision: (decision: OrderDecision) => void;
  busy: boolean;
  error: string | null;
}

export function OrderDetailDesktop({ order, onAdvance, onDecision, busy, error }: OrderDetailDesktopProps) {
  // Geçiş şeridi kapalı başlar: birincil geçiş üst barda, gerisi istendiğinde açılır.
  const [nextOpen, setNextOpen] = useState(false);
  const primary = order.allowedNext[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Geri düğmesi yok: kabuğun yan çubuğu "Siparişler"i zaten taşır, ekrana ikinci bir geri oku kabuğun işini devralmak olurdu. */}
      <header className="flex flex-wrap items-center gap-3 border-b border-ops-line px-6 py-3.5">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="font-ops-display text-ops-title font-semibold text-ops-ink">
              Sipariş {order.referenceNo ?? '—'}
            </h1>
            <Badge tone={order.channel === 'b2b' ? 'amber' : 'olive'}>{order.channel.toUpperCase()}</Badge>
            <Badge tone={statusTone(order.status)} dot>
              {statusLabel(order.status)}
            </Badge>
            {order.isGift ? <Badge tone="slate">Hediye</Badge> : null}
          </div>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {order.customerName} · {sourceLabel(order.source)} · {shortDateTime(order.placedAt)}
          </span>
        </div>

        {/* Ulaşma metin yazmaz, yalnız sohbeti uygulamanın içinde açar: ne yazılacağı operatörün kararı. */}
        <CustomerChannels
          customerId={order.customer.id}
          size="md"
          context={orderChatContext('Sipariş detayından', {
            referenceNo: order.referenceNo,
            totalCents: order.payment.totalCents,
            deliveryDate: order.delivery.date,
          })}
        />

        {order.customer.phone ? (
          <a
            href={`tel:${order.customer.phone}`}
            className="flex-none cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive"
          >
            Ara
          </a>
        ) : null}

        {/* Terminal kayıtta birincil geçiş çizilmez: ilerleyecek yer yok. */}
        {primary ? (
          <button
            type="button"
            onClick={() => setNextOpen((v) => !v)}
            disabled={busy}
            className="flex-none cursor-pointer rounded-ops-btn bg-ops-olive px-[18px] py-2.5 font-ops-display text-ops-sm font-semibold text-ops-card outline-none transition-colors hover:bg-ops-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {statusLabel(primary)} ▾
          </button>
        ) : null}
      </header>

      {nextOpen && primary ? (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-6 py-3">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
            İzinli geçişler
          </span>
          {order.allowedNext.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => onAdvance(next)}
              disabled={busy}
              className={`cursor-pointer rounded-ops-btn border px-3.5 py-2 font-ops-display text-ops-sm font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                next === 'cancelled' || next === 'returned'
                  ? 'border-ops-red-line bg-ops-white text-ops-red hover:bg-ops-red-bg'
                  : 'border-ops-olive-line bg-ops-white text-ops-olive-dark hover:bg-ops-olive-bg'
              }`}
            >
              {statusLabel(next)}
            </button>
          ))}
          <span className="ml-auto font-ops-body text-ops-xs text-ops-muted">
            Hazırlık, yola çıkış ve kapıdaki sonuç sahadan yazılır.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_336px] overflow-y-auto">
        <div className="flex flex-col gap-4 border-r border-ops-line-soft px-6 py-5">
          <div className="grid grid-cols-4 overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
            <MetaCell label="Referans" value={order.referenceNo ?? '—'} mono strong />
            <MetaCell label="Kaynak" value={sourceLabel(order.source)} tone={SOURCE_TONE[order.source]} />
            <MetaCell label="Sipariş anı" value={shortDateTime(order.placedAt)} mono />
            <MetaCell label="Resmî fatura" value={order.invoiceNo ?? '— eşleşmedi'} mono tone={order.invoiceNo ? undefined : 'amber'} />
          </div>

          <OrderLines
            lines={order.lines}
            bundles={order.bundles}
            totals={order.totals}
            settled={order.fulfillmentSettled}
          />

          {/* Para ve zaman çizelgesi yan yana: ikisi de dar içerik, tam genişlikte satırda üç kelime ve bin piksel boşluk kalıyordu.
              Kartlar eşit boyda gerilir. */}
          <div className="grid grid-cols-2 gap-4">
          <section className={cardClass()}>
            <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-[11px]">
              <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Para</span>
              {/* Ton da durumdan okunur: "kalan 0" ile "ödendi" aynı şey değil. */}
              <Badge
                tone={
                  order.payment.overdue
                    ? 'red'
                    : order.payment.status === 'paid'
                      ? 'olive'
                      : order.payment.status === 'refunded'
                        ? 'neutral'
                        : 'amber'
                }
              >
                {paymentHeadline(order)}
              </Badge>
              <span className="font-ops-body text-ops-micro text-ops-muted">türetilmiş · elle değişmez</span>
            </div>

            <div className="grid grid-cols-3">
              {moneyCells(order).map((cell) => (
                <div
                  key={cell.label}
                  className="flex flex-col gap-0.5 border-r border-ops-line-soft px-3.5 py-[13px] last:border-r-0"
                >
                  <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.07em] text-ops-muted">
                    {cell.label}
                  </span>
                  <span
                    className={`font-ops-mono text-ops-section font-medium ${
                      cell.tone === 'red'
                        ? 'text-ops-red'
                        : cell.tone === 'olive'
                          ? 'text-ops-olive-dark'
                          : cell.tone === 'muted'
                            ? 'text-ops-muted'
                            : 'text-ops-ink'
                    }`}
                  >
                    {cell.value}
                  </span>
                  <span className="font-ops-body text-ops-micro text-ops-muted">{cell.sub}</span>
                </div>
              ))}
            </div>

            {order.payment.overdue ? (
              <div className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5">
                <span className="flex-none font-ops-display text-ops-xs font-semibold text-ops-red">Vadesi geçti</span>
                <span className="font-ops-body text-ops-xs text-ops-red">
                  {order.customer.credit?.overdueDays ?? 0} gün · vade {order.payment.dueDate ?? '—'}. Bu müşteride açık
                  gecikme varken yeni vadeli sipariş açılamaz.
                </span>
              </div>
            ) : null}

            <div className="border-t border-ops-line-soft">
              {order.movements.length === 0 ? (
                <p className="px-3.5 py-3 font-ops-body text-ops-xs text-ops-muted">{emptyMovementsText(order)}</p>
              ) : (
                order.movements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0"
                  >
                    <span className="flex-none font-ops-mono text-ops-micro text-ops-muted">{shortDate(m.when)}</span>
                    <span className="flex-none font-ops-body text-ops-xs font-medium text-ops-ink">{m.kind}</span>
                    <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-body">
                      {m.accountName}
                    </span>
                    <span className={`font-ops-mono text-ops-sm ${m.isRefund ? 'text-ops-red' : 'text-ops-olive-dark'}`}>
                      {m.isRefund ? '−' : ''}
                      {money(m.amountCents)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={cardClass()}>
            <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-[11px]">
              <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Zaman çizelgesi</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{timelineNote(order)}</span>
            </div>
            <div className="px-4 py-3.5">
              <Timeline steps={timelineSteps(order)} />
            </div>
          </section>
          </div>

          {/* Kararlar kaydın altında, çünkü karar okumanın sonucudur; hangi kararın açık olduğunu motor söyler (`allowedDecisions`). */}
          {order.decisions.length > 0 ? (
            <section className="overflow-hidden rounded-ops-card border border-ops-line-strong bg-ops-white">
              <div className="flex items-center gap-2.5 border-b border-ops-line-soft px-3.5 py-[11px]">
                <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Kararlar</span>
                <span className="font-ops-body text-ops-micro text-ops-muted">
                  yalnız bu siparişe ait · gün planı Rotalar'da
                </span>
              </div>
              {/* `auto-fill`, `auto-fit` değil: tek kararı bütün satıra yayıp devasa boş kutu çizmesin. 250 px kartın okunabilirlik
                  tabanı, altında alt metin üç satıra düşer. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2 px-3.5 py-[13px]">
                {order.decisions.map((decision) => {
                  const copy = DECISION_COPY[decision];
                  return (
                    <button
                      key={decision}
                      type="button"
                      disabled={busy}
                      onClick={() => onDecision(decision)}
                      className={`flex h-full cursor-pointer flex-col gap-1.5 rounded-ops-card border px-3.5 py-[11px] text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        copy.tone === 'amber'
                          ? 'border-ops-amber-line bg-ops-amber-bg hover:border-ops-amber'
                          : 'border-ops-red-line bg-ops-white hover:bg-ops-red-bg'
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className={`font-ops-display text-ops-sm font-semibold ${
                            copy.tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-red'
                          }`}
                        >
                          {copy.label}
                        </span>
                        <span
                          className={`font-ops-body text-ops-xs leading-[1.45] ${
                            copy.tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-body'
                          }`}
                        >
                          {copy.sub}
                        </span>
                      </span>
                      <span
                        className={`self-end font-ops-display text-ops-xs font-semibold ${
                          copy.tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-red'
                        }`}
                      >
                        {copy.cta}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-3.5 bg-ops-subtle px-5 py-5">
          <div className={cardClass('flex flex-col gap-2.5 px-3.5 py-[13px]')}>
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-ops-card font-ops-display text-ops-sm font-semibold ${
                  order.channel === 'b2b' ? 'bg-ops-amber-bg text-ops-amber' : 'bg-ops-olive-bg text-ops-olive-dark'
                }`}
              >
                {initialsOf(order.customer.name)}
              </span>
              <div className="flex min-w-0 flex-col gap-px">
                <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">
                  {order.customer.name}
                </span>
                <span className="truncate font-ops-body text-ops-micro text-ops-muted">{order.customer.meta || '—'}</span>
              </div>
            </div>

            {order.customer.credit ? (
              <div className="flex flex-col gap-1.5 border-t border-ops-line-soft pt-2.5">
                <CreditRow
                  label="Açık bakiye"
                  value={money(order.customer.credit.openBalanceCents)}
                  tone={order.payment.overdue ? 'red' : undefined}
                />
                <CreditRow label="Vade limiti" value={money(order.customer.credit.limitCents)} />
                {order.customer.credit.overdueDays !== null ? (
                  <CreditRow
                    label="Gecikme"
                    value={`${order.customer.credit.overdueDays} gün · ${order.customer.credit.dueDate ?? '—'}`}
                    tone="red"
                  />
                ) : null}
                {/* Limit yoksa doluluk çubuğu çizilmez: oranı yok. */}
                {order.customer.credit.limitCents !== null ? (
                  <span className="block h-[5px] overflow-hidden rounded-[3px] bg-ops-line-soft">
                    <span
                      className={`block h-[5px] ${creditFill(order)}`}
                      style={{ width: creditPercent(order) }}
                    />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Finansal kart rol kapılı: sayfa bugün `requireAdmin` ister; başka rollere açıldığı gün `finance` `null` gelir ve kart
              kendiliğinden susar. */}
          {order.finance ? (
            <div className={cardClass()}>
              <div className="flex items-center gap-2 border-b border-ops-line-soft px-3.5 py-2.5">
                <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Finansal</span>
                <Badge tone="slate">Yönetici</Badge>
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 py-[11px]">
                {order.finance.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-2.5">
                    {/* Tahmini maliyet sönük ve eksisiz: kâra girmez, çıkarmanın parçası gibi görünmemeli. */}
                    <span
                      className={`mr-auto font-ops-body text-ops-xs ${
                        row.kind === 'sale' ? 'font-medium text-ops-ink' : row.kind === 'estimate' ? 'text-ops-muted' : 'text-ops-body'
                      }`}
                    >
                      {row.label}
                    </span>
                    <span
                      className={`font-ops-mono text-ops-xs ${
                        row.kind === 'expense' ? 'text-ops-red' : row.kind === 'estimate' ? 'text-ops-muted' : 'text-ops-ink'
                      }`}
                    >
                      {row.kind === 'expense' ? '−' : ''}
                      {money(row.amountCents)}
                    </span>
                  </div>
                ))}

                {order.finance.profitCents !== null ? (
                  <>
                    <div className="flex items-baseline gap-2.5 border-t border-ops-line-soft pt-2">
                      <span className="mr-auto font-ops-display text-ops-xs font-semibold text-ops-ink">Kâr</span>
                      <span
                        className={`font-ops-mono text-ops-lead font-medium ${
                          order.finance.profitCents > 0 ? 'text-ops-olive-dark' : 'text-ops-red'
                        }`}
                      >
                        {money(order.finance.profitCents)}
                      </span>
                    </div>
                    {order.finance.marginPercent !== null ? (
                      <div className="flex items-baseline gap-2.5">
                        {/* Marj kârlılık raporunun tanımıyla aynı: aynı siparişin marjı iki ekranda iki sayı olamaz. */}
                        <span className="mr-auto font-ops-body text-ops-xs text-ops-body">Kâr marjı</span>
                        <span
                          className={`font-ops-mono text-ops-xs ${
                            order.finance.profitCents > 0 ? 'text-ops-olive-dark' : 'text-ops-red'
                          }`}
                        >
                          {percent(order.finance.marginPercent, 1)}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {order.finance.costNote ? (
                  <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
                    {order.finance.costNote}
                  </span>
                ) : (
                  <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
                    Tek sipariş okuması; maliyet fiilen çıkan partilerin alışından gelir. Dönem marjı Raporlar'da.
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className={cardClass()}>
            <div className="flex items-center gap-2 border-b border-ops-line-soft px-3.5 py-2.5">
              <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Teslimat</span>
              <Badge tone={order.delivery.type === 'shipping' ? 'slate' : 'olive'}>
                {order.delivery.type === 'shipping' ? 'Kargo' : 'Rota'}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 px-3.5 py-[11px]">
              <InfoRow label="Gün" value={order.delivery.date ? shortDate(order.delivery.date) : 'girilmemiş'} />
              {/* Kapı doğrulaması engel değil kopyanın niteliği, bu yüzden ipucu satırında; `confirmed`/`unknown` hiçbir şey yazmaz,
                  her siparişte beliren bir satır uyarıyı gürültüye çevirirdi. */}
              <InfoRow
                label="Adres"
                value={order.delivery.address || 'kopya yok'}
                hint={DOOR_CHECK_NOTE[order.delivery.doorCheck]}
              />
              {/* Alıcı kargo künyesine yazılacak addır ve hediye adresinde hesap sahibininki değil. Adreste yoksa hesap sahibine
                  düşülür ama görünür yazılır: tahmin edilmiş ad ölçülmüş sanılmasın. */}
              {order.delivery.recipient ? (
                <InfoRow
                  label="Alıcı"
                  value={order.delivery.recipient.name}
                  hint={order.delivery.recipient.fromAccount ? 'adreste alıcı yazılı değil — hesap sahibi' : undefined}
                />
              ) : null}
              {/* Adresin telefonu, hesabınki değil; yoksa satır çizilmez, boş alan "numara yok" derdi, oysa cevap bilinmiyor. */}
              {order.delivery.recipient?.phone ? (
                <InfoRow label="Adres tel." value={order.delivery.recipient.phone} />
              ) : null}
              {/* Depo künyedir, kontrol değil: posta kodundan türedi ve buradan değişseydi malın ayrıldığı depo ile siparişin deposu ayrışırdı. */}
              {order.delivery.warehouse ? (
                <InfoRow
                  label="Hangi depodan"
                  value={`${order.delivery.warehouse.name} (${order.delivery.warehouse.code})`}
                />
              ) : null}
              {/* Kurye ve sefer rota kulvarının satırları: kargoda ikisi hiç doğmaz ve "sefer bekliyor" sonsuza dek eksik bir şey
                  varmış gibi okunurdu. Kuryeyi sefer yazar, tek siparişin özelliği değil. */}
              {order.delivery.type !== 'shipping' ? (
                <>
                  <InfoRow label="Kurye" value={order.delivery.courierName ?? 'sefer bekliyor'} />
                  <InfoRow label="Sefer" value={order.delivery.runReference ?? 'açılmadı'} />
                </>
              ) : (
                <ShipmentRows shipment={order.delivery.shipment} showParcels={order.delivery.boxes.length === 0} />
              )}
              {/* Yerinde satışta (`pickup`) hazırlık yok, kutu satırı da yok: "kutu açılmadı" orada yanlış olurdu. */}
              {order.delivery.type !== 'pickup' ? <BoxRows boxes={order.delivery.boxes} type={order.delivery.type} /> : null}
              {/* Kanıt açılabilir olmalı: ihtilafta bakılan şey görselin kendisi. Kova yoksa görsel yerine sebep yazılır, boş çerçeve
                  "kanıt bozuk" derdi. */}
              {order.delivery.proof ? (
                <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3 py-2.5">
                  <span className="font-ops-display text-ops-xs font-semibold text-ops-olive-dark">Teslim kanıtı</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[6px] border border-ops-olive-line bg-ops-white px-2 py-1 font-ops-mono text-ops-micro font-medium text-ops-olive-dark">
                      {PROOF_KIND_LABEL[order.delivery.proof.kind]}
                    </span>
                    {order.delivery.proof.when ? (
                      <span className="ml-auto font-ops-mono text-ops-micro text-ops-olive-dark">
                        {shortDateTime(order.delivery.proof.when)}
                      </span>
                    ) : null}
                  </div>
                  {order.delivery.proof.imageUrl ? (
                    // Ham `<img>` bilerek: adres süreli imzalı, `next/image` onu önbelleğe alıp süresi dolunca kırık gösterirdi.
                    <img
                      src={order.delivery.proof.imageUrl}
                      alt={`Teslim kanıtı — ${PROOF_KIND_LABEL[order.delivery.proof.kind]}`}
                      className="max-h-56 w-full rounded-ops-btn border border-ops-olive-line bg-ops-white object-contain"
                    />
                  ) : (
                    <span className="rounded-ops-btn border border-ops-olive-line bg-ops-white px-2.5 py-2 font-ops-body text-ops-micro leading-[1.45] text-ops-olive-dark">
                      {/* `box_scan` görselsizdir ve arıza değil: "açılamıyor" cümlesi yanlış olurdu. */}
                      {order.delivery.proof.kind === 'box_scan' ? ORDER_NOTES.proofBoxScan : ORDER_NOTES.proofImageUnavailable}
                    </span>
                  )}
                  <span className="font-ops-body text-ops-micro leading-[1.45] text-ops-olive-dark">
                    {order.delivery.proof.receivedBy ? `Teslim alan: ${order.delivery.proof.receivedBy} · ` : ''}
                    "eksik geldi" ihtilafında dayanak budur.
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Hedef ekranı olan satır davet eder, olmayan yalnız kaydı gösterir; parti izi kalemdeki lot köprüsünde. */}
          {order.links.length > 0 ? (
            <div className={cardClass()}>
              <div className="border-b border-ops-line-soft px-3.5 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-ink">
                Bağlı talepler
              </div>
              {order.links.map((link) => (
                <div
                  key={link.key}
                  className="flex flex-col gap-1.5 border-b border-ops-line-soft px-3.5 py-[11px] last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-ops-mono text-ops-micro text-ops-body">{link.ref}</span>
                    <Badge tone={link.tone}>{link.state}</Badge>
                    {link.href ? (
                      <Link
                        href={link.href}
                        className="ml-auto cursor-pointer font-ops-display text-ops-micro font-semibold text-ops-olive-dark hover:underline"
                      >
                        {link.cta}
                      </Link>
                    ) : null}
                  </div>
                  <span className="font-ops-body text-ops-xs font-medium text-ops-ink">{link.title}</span>
                  <span className="font-ops-body text-ops-micro leading-[1.45] text-ops-muted">{link.note}</span>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Kaynak renkle de okunur: WhatsApp yeşil, kapı önü amber. */
const SOURCE_TONE: Record<OrderSource, MetaTone> = {
  web: 'blue',
  // Üç sohbet kanalı aynı tonda: renk sınıfı ("sohbetten geldi"), etiket platformu söyler; kanal başına renk yeni ton icat etmek olurdu.
  whatsapp: 'olive',
  messenger: 'olive',
  instagram: 'olive',
  door: 'amber',
  manual: 'slate',
};

type MetaTone = 'blue' | 'olive' | 'amber' | 'slate';

const META_TONE_CLASS: Record<MetaTone, string> = {
  blue: 'text-ops-blue-dark',
  olive: 'text-ops-olive-dark',
  amber: 'text-ops-amber-dark',
  slate: 'text-ops-strong',
};

interface MetaCellProps {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  /** Durum taşıyan hücrede (kaynak, eşleşmemiş fatura); yoksa mürekkep. */
  tone?: MetaTone;
}

function MetaCell({ label, value, mono, strong, tone }: MetaCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] border-r border-ops-line-soft px-[13px] py-[13px] last:border-r-0">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.07em] text-ops-muted">
        {label}
      </span>
      {/* Değer başlık kademesinde: kimlik şeridi sayfanın en üst bilgisi, gövde metni gibi fısıldamaz. */}
      <span
        className={`truncate ${mono ? 'font-ops-mono' : 'font-ops-body'} text-ops-base ${
          tone ? `font-medium ${META_TONE_CLASS[tone]}` : strong ? 'font-semibold text-ops-ink' : 'text-ops-strong'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Kutu mobilde açılır, kapanır, yüklenir; burası yalnız görünürlük. Kargoda takip numarası aynı satırda, koli listesi ikinci kez yazılmaz. */
function BoxRows({ boxes, type }: { boxes: OrderDetailView['delivery']['boxes']; type: OrderDetailView['delivery']['type'] }) {
  if (boxes.length === 0) return <InfoRow label="Kutular" value={ORDER_NOTES.noBoxes} />;
  return (
    <>
      {boxes.map((box) => (
        <div key={box.boxId} className="flex items-baseline gap-2">
          <span className="w-[78px] flex-none font-ops-body text-ops-xs text-ops-muted">{`Kutu ${box.boxNo}/${box.totalBoxes}`}</span>
          <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-ink">
            <span className="font-ops-mono">{box.code}</span>
            <span className="text-ops-micro text-ops-muted"> · {boxTrailOf(box, type).join(' · ')}</span>
            {box.trackingNumber ? (
              <span className="font-ops-mono text-ops-micro">
                {' · '}
                {box.trackingUrl ? (
                  <a href={box.trackingUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer underline hover:text-ops-olive-dark">
                    {box.trackingNumber}
                  </a>
                ) : (
                  box.trackingNumber
                )}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </>
  );
}

/**
 * `hint` değerin nereden geldiğini söyler ve ayrı satır değil değerin devamıdır: ayrı satır kartın ritmini bozar, not kendi başına
 * bir bilgi gibi okunurdu.
 */
function InfoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[78px] flex-none font-ops-body text-ops-xs text-ops-muted">{label}</span>
      <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-ink">
        {value}
        {hint ? <span className="text-ops-micro text-ops-muted"> · {hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * Üç hâl, hiçbiri boş satır bırakmaz: gönderi yok, numarasız, numaralı. Koli başına satır, çünkü çok kolili gönderide her kolinin
 * ayrı numarası var ve "hangi kutu nerede" ancak böyle cevaplanır.
 */
function ShipmentRows({
  shipment,
  showParcels,
}: {
  shipment: OrderDetailView['delivery']['shipment'];
  /** Koli satırları kutu izinde zaten yazılıyorsa ikinci kez çizilmez. */
  showParcels: boolean;
}) {
  if (!shipment) return <InfoRow label="Gönderi" value="duyurulmadı" />;

  return (
    <>
      <InfoRow
        label="Taşıyıcı"
        value={shipment.carrierName ?? 'bilinmiyor'}
        hint={shipment.status ? SHIPMENT_STATUS_LABEL[shipment.status] : 'elle girildi'}
      />
      {shipment.parcels.length === 0 ? (
        <InfoRow label="Takip" value="taşıyıcı numarayı henüz atamadı" />
      ) : showParcels ? (
        shipment.parcels.map((parcel) => (
          <div key={parcel.trackingNumber} className="flex items-baseline gap-2">
            <span className="w-[78px] flex-none font-ops-body text-ops-xs text-ops-muted">
              {parcel.totalBoxes > 1 ? `Kutu ${parcel.boxNo}/${parcel.totalBoxes}` : 'Takip'}
            </span>
            <span className="min-w-0 flex-1 font-ops-mono text-ops-xs text-ops-ink">
              {parcel.trackingUrl ? (
                <a
                  href={parcel.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer underline hover:text-ops-olive-dark"
                >
                  {parcel.trackingNumber}
                </a>
              ) : (
                parcel.trackingNumber
              )}
            </span>
          </div>
        ))
      ) : null}
    </>
  );
}

function CreditRow({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="mr-auto font-ops-body text-ops-xs text-ops-body">{label}</span>
      <span className={`font-ops-mono text-ops-xs ${tone === 'red' ? 'font-semibold text-ops-red' : 'text-ops-ink'}`}>
        {value}
      </span>
    </div>
  );
}
