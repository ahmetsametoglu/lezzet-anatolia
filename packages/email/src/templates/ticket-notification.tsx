import * as React from 'react';
import type { TicketNotification } from '@lezzet/types';
import { CtaButton, EmailLayout, HeaderCard, Headline, MessageCard, NoticeCard, StatusPill } from '../components/email-layout';
import { TICKET_COPY, ticketLabel } from './ticket-copy';

void React;

/**
 * Talep e-postaları (14.7) — **cevap geldi** ve **durum değişti**.
 *
 * Tek dosya, çünkü tek tasarım: aynı iskelet, aynı künye kartı, aynı davet. Ayrı dosyalara
 * bölünselerdi künye kartı ve "sorun devam ediyor mu" kutusu iki yerde durur, biri değişince
 * öteki eskirdi.
 *
 * **Talep mailinin ayrı bir çizimi yok** (`design/project`'te `Email - Talep` bulunmuyor); marka
 * iskeleti aynen kullanılır. Improvise edilen tek şey yok: her blok sipariş maillerinden gelen
 * mevcut bloklardır.
 *
 * `NotifyPayloads` iki olayı da `TicketNotification` ile taşır; ikisini ayıran şey verinin hangi
 * alanının dolu olduğudur (`replyBody` ↔ `previousStatus`).
 */

export interface TicketEmailProps {
  data: TicketNotification;
  brandName: string;
  postalAddress: string;
}

/** İki mailin paylaştığı kabuk — künye kartı, kapanış daveti ve buton hep aynıdır. */
function TicketShell({
  data,
  brandName,
  postalAddress,
  preview,
  pill,
  title,
  intro,
  children,
}: TicketEmailProps & {
  preview: string;
  pill: string;
  title: string;
  intro: string;
  children?: React.ReactNode;
}) {
  const t = TICKET_COPY[data.locale];
  const label = ticketLabel(data, data.locale);
  // Sipariş bağı varsa künyenin ikincil satırı onu da taşır: müşterinin ilk sorusu "hangi sipariş".
  const meta = data.orderReferenceNo ? `${t.openedOn(data.openedOn)} · ${t.orderLine(data.orderReferenceNo)}` : t.openedOn(data.openedOn);

  return (
    <EmailLayout
      preview={preview}
      locale={data.locale}
      brandName={brandName}
      region={t.region}
      footer={{
        address: postalAddress,
        notice: t.footerNotice,
        preferencesLabel: t.preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <StatusPill label={pill} tone="green" />
      <Headline title={title} intro={intro} />
      <HeaderCard title={label} meta={meta} statusLabel={t.statuses[data.status]} />
      {children}
      {/* Kapanmış talebe yazılabildiğini SÖYLEMEK gerekir: aksi hâlde müşteri yeni bir talep açar
          ve aynı konu iki yerde ilerler. */}
      {data.status === 'resolved' && <NoticeCard title={t.stillOpenTitle} text={t.stillOpenText} />}
      <CtaButton label={t.cta} url={data.ticketUrl} />
    </EmailLayout>
  );
}

export function ticketRepliedSubject(data: TicketNotification): string {
  return TICKET_COPY[data.locale].repliedSubject(ticketLabel(data, data.locale));
}

/** Personel cevap yazdı. Cevabın TAM metni maildedir — müşteri okumak için tıklamak zorunda değil. */
export function TicketRepliedEmail({ data, brandName, postalAddress }: TicketEmailProps) {
  const t = TICKET_COPY[data.locale];
  return (
    <TicketShell
      data={data}
      brandName={brandName}
      postalAddress={postalAddress}
      preview={t.repliedIntro}
      pill={`✉ ${t.statuses[data.status]}`}
      title={t.repliedTitle}
      intro={t.repliedIntro}
    >
      {data.replyBody && <MessageCard title={t.replyCardTitle} meta={data.repliedAt} body={data.replyBody} />}
    </TicketShell>
  );
}

export function ticketStatusChangedSubject(data: TicketNotification): string {
  const t = TICKET_COPY[data.locale];
  const label = ticketLabel(data, data.locale);
  return data.status === 'resolved' ? t.resolvedSubject(label) : t.reopenedSubject(label);
}

/**
 * Durum değişti. İki hâl anlatılır: **çözüldü** ve **yeniden açıldı**.
 *
 * `in_progress` bildirim doğurmaz — "incelemeye aldık" müşteriye bir şey söylemez; söyleyecek şey
 * çıktığında cevap maili zaten gider (aynı gerekçe iade mailinde de verili).
 */
export function TicketStatusChangedEmail({ data, brandName, postalAddress }: TicketEmailProps) {
  const t = TICKET_COPY[data.locale];
  const resolved = data.status === 'resolved';
  return (
    <TicketShell
      data={data}
      brandName={brandName}
      postalAddress={postalAddress}
      preview={resolved ? t.resolvedIntro : t.reopenedIntro}
      pill={`${resolved ? '✓' : '↻'} ${t.statuses[data.status]}`}
      title={resolved ? t.resolvedTitle : t.reopenedTitle}
      intro={resolved ? t.resolvedIntro : t.reopenedIntro}
    />
  );
}
