'use client';

import { useState } from 'react';
import Link from 'next/link';
import { whatsAppChatLink } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { Timeline } from '@/components/operation/ui/timeline';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { statusLabel, statusTone } from '../orders-labels';
import { OrderLines } from './components/order-lines';
import {
  DECISION_COPY,
  creditFill,
  creditPercent,
  initialsOf,
  moneyCells,
  paymentHeadline,
  sourceLabel,
  timelineNote,
  timelineSteps,
} from './order-detail-labels';
import type { OrderDetailView } from './order-detail-types';
import type { OrderDecision } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';

// Sipariş DETAYI — MASAÜSTÜ. Tasarım "Operasyon - Siparis Detay" birebir.
//
// İskelet: üst bar (künye + ulaşma + birincil geçiş) → açılır izinli geçiş şeridi → gövde:
// sol kolon KAYIT (künye → kalemler → para → zaman), sağ 336px ray BAĞLAM (müşteri/vade,
// teslimat/kanıt, bağlar, sınır notu).
//
// Bölüm sırası yoğun ve sade siparişte AYNIDIR; verisi olmayan blok hiç çizilmez (tasarım
// sözleşmesi) — operatör aynı ekranda hep aynı yere bakar.

interface OrderDetailDesktopProps {
  order: OrderDetailView;
  onAdvance: (to: OrderStatus) => void;
  onDecision: (decision: OrderDecision) => void;
  busy: boolean;
  error: string | null;
}

export function OrderDetailDesktop({ order, onAdvance, onDecision, busy, error }: OrderDetailDesktopProps) {
  // Geçiş şeridi KAPALI başlar (tasarım): birincil geçiş üst barda, gerisi istendiğinde açılır.
  const [nextOpen, setNextOpen] = useState(false);
  const primary = order.allowedNext[0] ?? null;
  const chatUrl = whatsAppChatLink(order.customer.phone);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Geri düğmesi YOK (tasarımdan bilinçli sapma): operasyon kabuğunun kalıcı yan çubuğu zaten
          "Siparişler"i taşıyor. Her ekranın başına bir de kendi geri oku koymak, kabuğun işini
          ekrana devretmek ve sayfaya sayfa-dışı bir öğe sokmak olurdu. */}
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

        {/* Ulaşma — metin YOK, yalnız sohbeti açar: ne yazılacağı operatörün kararı (tasarım). */}
        {chatUrl ? (
          <a
            href={chatUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-none cursor-pointer items-center gap-1.5 rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive"
          >
            <WhatsAppIcon size={13} />
            WhatsApp
          </a>
        ) : null}
        {order.customer.phone ? (
          <a
            href={`tel:${order.customer.phone}`}
            className="flex-none cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive"
          >
            Ara
          </a>
        ) : null}

        {/* Birincil geçiş + şerit anahtarı. Terminal kayıtta hiç çizilmez — ilerleyecek yer yok. */}
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
            İzinsiz geçiş listelenmez — geri alma zaman çizelgesinden yapılır.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_336px] overflow-y-auto">
        {/* ── SOL: KAYIT ── */}
        <div className="flex flex-col gap-4 border-r border-ops-line-soft px-6 py-5">
          <div className="grid grid-cols-4 overflow-hidden rounded-ops-card border border-ops-line bg-ops-white">
            <MetaCell label="Referans" value={order.referenceNo ?? '—'} mono strong />
            <MetaCell label="Kaynak" value={sourceLabel(order.source)} />
            <MetaCell label="Sipariş anı" value={shortDateTime(order.placedAt)} mono />
            <MetaCell label="Resmî fatura" value={order.invoiceNo ?? '— eşleşmedi'} mono muted={!order.invoiceNo} />
          </div>

          <OrderLines
            lines={order.lines}
            bundles={order.bundles}
            totals={order.totals}
            settled={order.fulfillmentSettled}
          />

          <section className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-card">
            <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-[11px]">
              <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Para</span>
              {/* Ton da DURUMDAN okunur: "kalan 0" ile "ödendi" aynı şey değil. */}
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

            {/* Vade uyarısı — tasarımda kırmızı kutu. "Tahsilat →" köprüsü Para ekranı açılınca gelir. */}
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
                <p className="px-3.5 py-3 font-ops-body text-ops-xs text-ops-muted">
                  Henüz hareket yok — tahsilat kapıda yapılacak, hareket kurye kapanışında düşer.
                </p>
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

          <section className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-card">
            <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-[11px]">
              <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Zaman çizelgesi</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{timelineNote(order)}</span>
            </div>
            <div className="px-4 py-3.5">
              <Timeline steps={timelineSteps(order)} />
            </div>
          </section>

          {/* KARARLAR — kaydın altında, çünkü karar okumanın SONUCUDUR: kalemleri, parayı ve
              geçmişi gördükten sonra verilir. Hangi kararın açık olduğunu motor söyler
              (`allowedDecisions`); ekran listeyi uydurmaz. Terminal kayıtta blok hiç çizilmez. */}
          {order.decisions.length > 0 ? (
            <section className="overflow-hidden rounded-ops-card border border-ops-line-strong bg-ops-white">
              <div className="flex items-center gap-2.5 border-b border-ops-line-soft px-3.5 py-[11px]">
                <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">Kararlar</span>
                <span className="font-ops-body text-ops-micro text-ops-muted">
                  yalnız bu siparişe ait · gün planı Rotalar'da
                </span>
              </div>
              {/* Kartlar genişlik yettikçe YAN YANA — `auto-fit`, `md:` kırılımı değil (CLAUDE.md
                  §2: akışkan responsive yok). Kırılım noktası cihaza aittir; buradaki ölçü kartın
                  KENDİ okunabilirlik tabanıdır (250px altında alt metin üç satıra düşüyor). Kolon
                  daraldığında dizilim kendiliğinden tek sütuna iner, ayrı bir kural yazılmaz. */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-2 px-3.5 py-[13px]">
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

        {/* ── SAĞ RAY: BAĞLAM ── */}
        <aside className="flex flex-col gap-3.5 bg-ops-subtle px-5 py-5">
          <div className="flex flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-card px-3.5 py-[13px]">
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
                {/* Doluluk çubuğu: limitin ne kadarı kullanıldı. Limit yoksa çizilmez — oranı yok. */}
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

          {/* Finansal — ROL KAPILI (tasarım: "Operatör rolünde bu kart hiç render edilmez"). Bugün
              kapı sayfanın kendisinde: `/orders/[id]` `requireAdmin` ister, dolayısıyla kart
              yöneticinin dışına çıkmıyor. Sayfa depo/kurye rollerine açıldığı gün `finance` alanı
              `null` gelir ve burası kendiliğinden susar. */}
          {order.finance ? (
            <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-card">
              <div className="flex items-center gap-2 border-b border-ops-line-soft px-3.5 py-2.5">
                <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Finansal</span>
                <Badge tone="slate">Yönetici</Badge>
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 py-[11px]">
                {order.finance.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-2.5">
                    {/* Tahmini maliyet SÖNÜK yazılır ve eksi işareti almaz: kâra girmiyor, bir
                        çıkarma işleminin parçasıymış gibi görünmemeli. */}
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
                        {/* Marj = katkı payı ÷ ciro — kârlılık raporunun (12.6) tanımının AYNISI.
                            Aynı siparişin marjı iki ekranda iki sayı olamaz. */}
                        <span className="mr-auto font-ops-body text-ops-xs text-ops-body">Kâr marjı</span>
                        <span
                          className={`font-ops-mono text-ops-xs ${
                            order.finance.profitCents > 0 ? 'text-ops-olive-dark' : 'text-ops-red'
                          }`}
                        >
                          %{order.finance.marginPercent.toFixed(1)}
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

          <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-card">
            <div className="flex items-center gap-2 border-b border-ops-line-soft px-3.5 py-2.5">
              <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Teslimat</span>
              <Badge tone={order.delivery.type === 'shipping' ? 'slate' : 'olive'}>
                {order.delivery.type === 'shipping' ? 'Kargo' : 'Rota'}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 px-3.5 py-[11px]">
              <InfoRow label="Gün" value={order.delivery.date ? shortDate(order.delivery.date) : 'girilmemiş'} />
              <InfoRow label="Adres" value={order.delivery.address || 'kopya yok'} />
              {/* HANGİ DEPODAN — künye, kontrol değil: depo adresin posta kodundan türedi ve sipariş
                  tek depodan çıkar (DOMAIN §17). Buradan değiştirilemez; değiştirilebilseydi malın
                  ayrıldığı depo ile siparişin deposu ayrışırdı. */}
              {order.delivery.warehouse ? (
                <InfoRow
                  label="Hangi depodan"
                  value={`${order.delivery.warehouse.name} (${order.delivery.warehouse.code})`}
                />
              ) : null}
              {/* Kurye YALNIZ GÖRÜNÜR: atama günün planıdır (Rotalar), tek siparişin özelliği değil. */}
              <InfoRow label="Kurye" value={order.delivery.courierName ?? 'atanmadı · Rotalar'} />
              {/* Kanıt PARÇA PARÇA gösterilir (tasarım): "imza" ile "foto ×2" ayrı çipler, çünkü
                  ihtilafta hangisinin bulunduğu tek tek sorulur — bir cümleye eritilince aranan
                  parça göz taramasıyla bulunamıyordu. */}
              {order.delivery.proof ? (
                <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3 py-2.5">
                  <span className="font-ops-display text-ops-xs font-semibold text-ops-olive-dark">Teslim kanıtı</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.delivery.proof.parts.length > 0 ? (
                      order.delivery.proof.parts.map((part) => (
                        <span
                          key={part}
                          className="rounded-[6px] border border-ops-olive-line bg-ops-white px-2 py-1 font-ops-mono text-ops-micro font-medium text-ops-olive-dark"
                        >
                          {part}
                        </span>
                      ))
                    ) : (
                      <span className="font-ops-body text-ops-micro text-ops-olive-dark">kayıt var</span>
                    )}
                    {order.delivery.proof.when ? (
                      <span className="ml-auto font-ops-mono text-ops-micro text-ops-olive-dark">
                        {shortDateTime(order.delivery.proof.when)}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-ops-body text-ops-micro leading-[1.45] text-ops-olive-dark">
                    {order.delivery.proof.by ? `Onaylayan: ${order.delivery.proof.by} · ` : ''}"eksik geldi" ihtilafında
                    dayanak budur.
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Bağlar — talepler ve parti izi TEK kartta: sorusu tek ("bu sipariş başka nereye
              dokunuyor?"). Hedef ekranı olan satır davet eder, olmayan yalnız kaydı gösterir. */}
          {order.links.length > 0 ? (
            <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-card">
              <div className="border-b border-ops-line-soft px-3.5 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-ink">
                Bağlar
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

          {/* Sınır notu (tasarım) — kartların BOŞ olmasıyla karışmasın diye burada: "bu sipariş için
              kurye atanmadı" ile "kurye buradan atanmaz" farklı şeylerdir. Aramayı kesen not budur;
              yolu olan hedef bağlanır, henüz yazılmamış ekran düz metin kalır.

              BEKLEYEN(09.15): Rotalar ekranı — "gün rotası ve kurye ataması" oraya bağlanacak.
              BEKLEYEN(11.1): kuryenin kendi gün listesi. Metindeki adlar bugün bilerek DÜZ; ölü link
              404'e düşerdi ve okuyan "ekran var ama bozuk" diye anlardı. */}
          <div className="flex flex-col gap-1.5 rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-[11px]">
            <span className="font-ops-display text-ops-xs font-semibold text-ops-body">Buraya girmeyenler</span>
            <span className="font-ops-body text-ops-micro leading-[1.55] text-ops-muted">
              Gün rotası ve kurye ataması → Rotalar · hazırlık kuyruğu ve parti seçimi →{' '}
              <Link href="/operations/stock" className="cursor-pointer font-medium text-ops-olive-dark hover:underline">
                Depo
              </Link>{' '}
              · kuryenin kendi listesi → Kurye · müşteriye giden metin → bildirim şablonları.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface MetaCellProps {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  muted?: boolean;
}

function MetaCell({ label, value, mono, strong, muted }: MetaCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] border-r border-ops-line-soft px-[13px] py-[11px] last:border-r-0">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.07em] text-ops-muted">
        {label}
      </span>
      <span
        className={`truncate ${mono ? 'font-ops-mono' : 'font-ops-body'} text-ops-xs ${
          muted ? 'text-ops-muted' : strong ? 'font-medium text-ops-ink' : 'text-ops-strong'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[78px] flex-none font-ops-body text-ops-xs text-ops-muted">{label}</span>
      <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-ink">{value}</span>
    </div>
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
