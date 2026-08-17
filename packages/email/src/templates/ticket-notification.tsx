import * as React from 'react';
import type { PreferredLanguage, TicketHistoryEntry, TicketNotification } from '@lezzet/types';
import type { EmailQuote } from '../components/email-layout';
import { CtaButton, EmailLayout, Headline, MessageCard, MetaLine, NoticeCard, QuoteCard, StatusPill } from '../components/email-layout';
import { TICKET_COPY, ticketLabel } from './ticket-copy';

void React;

/**
 * Talep e-postaları (14.7 · 16.4) — **aldık**, **cevap geldi**, **durum değişti**.
 *
 * Tek dosya, çünkü tek tasarım: aynı iskelet, aynı künye kartı, aynı davet. Ayrı dosyalara
 * bölünselerdi künye kartı ve "sorun devam ediyor mu" kutusu iki yerde durur, biri değişince
 * öteki eskirdi.
 *
 * **Talep mailinin ayrı bir çizimi yok** (`design/project`'te `Email - Talep` bulunmuyor); marka
 * iskeleti aynen kullanılır. Improvise edilen tek şey yok: her blok sipariş maillerinden gelen
 * mevcut bloklardır — alıntı kartı dahil (`MessageCard`ın soluklaştırılmışı).
 *
 * **Mail yazışmanın kendisini taşır** (referans projeden alınan desen): `history[0]` mailin konusu
 * olan mesajdır ve tam kartta durur, kalanı alıntılanır. Müşteri "neye cevap verdiler" sorusu için
 * tıklamak zorunda kalmaz.
 */

export interface TicketEmailProps {
  data: TicketNotification;
  brandName: string;
  postalAddress: string;
}

/**
 * Gönderen → ekranda görünen ad. **`admin` ile `ai` müşteriye AYNI görünür**: ikisi de "biz"iz
 * (DOMAIN §15 — kimin yazdığı iç izlenebilirlik meselesi, müşterinin muhatabı marka).
 */
function quoteOf(entry: TicketHistoryEntry, locale: PreferredLanguage): EmailQuote {
  const t = TICKET_COPY[locale];
  return {
    author: entry.sender === 'customer' ? t.senderYou : t.senderUs,
    at: entry.at,
    body: entry.body,
    note: entry.truncated ? t.truncatedNote : null,
  };
}

/** Üç mailin paylaştığı kabuk — künye kartı, alıntılanan geçmiş, kapanış daveti ve buton hep aynı. */
function TicketShell({
  data,
  brandName,
  postalAddress,
  preview,
  pill,
  title,
  intro,
  quoted,
  children,
}: TicketEmailProps & {
  preview: string;
  pill: string;
  title: string;
  intro: string;
  /** Alıntılanacak mesajlar — mailin KONUSU olan (tam kartta duran) dışında kalanlar. */
  quoted: readonly TicketHistoryEntry[];
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
      {/* ── SIRA: HABER ÖNCE, KÜNYE SONRA (09.08, kullanıcı telefondan okudu) ──────────────────
          Eskiden künye kartı cevabın ÜSTÜNDEydi ve dar ekranda mail şöyle diziliyordu: hap →
          başlık → paragraf → künye kartı → cevap kartı → geçmiş kartı → düğme. İki satırlık
          içerik için altı dikey blok; müşteri "ne yazdılar"ı görmek için kaydırıyordu.

          Mailin tek işi cevabı göstermek — o yüzden `children` (cevabın kendisi) künyenin
          önüne alındı ve künye kutusuz bir SATIRA indi (`MetaLine`). "Hangi kayıt" sorusu
          önemsiz değil, ama HABER değil: cevabı okuduktan sonra bakılacak bir etiket. */}
      <StatusPill label={pill} tone="green" />
      <Headline title={title} intro={intro} />
      {children}
      <MetaLine text={`${label} · ${meta}`} />
      {/* Kapanmış talebe yazılabildiğini SÖYLEMEK gerekir: aksi hâlde müşteri yeni bir talep açar
          ve aynı konu iki yerde ilerler. */}
      {data.status === 'resolved' && <NoticeCard title={t.stillOpenTitle} text={t.stillOpenText} />}
      {/* Düğme ALINTILARDAN ÖNCE (referans proje deseni): eylem cevaba aittir, geçmişe değil.
          Alıntılar bir ek/dipnottur ve mailin sonunda durması onları okumayı isteğe bağlı kılar. */}
      <CtaButton label={t.cta} url={data.ticketUrl} />
      {quoted.length > 0 && <QuoteCard title={t.historyTitle} entries={quoted.map((entry) => quoteOf(entry, data.locale))} />}
    </EmailLayout>
  );
}

export function ticketReceivedSubject(data: TicketNotification): string {
  return TICKET_COPY[data.locale].receivedSubject(ticketLabel(data, data.locale));
}

/**
 * Talep açıldı — **teyit**. Ekran iki mail vaat ediyordu ("aldığımızda ve yanıtladığımızda"), kodda
 * yalnız ikincisi vardı: müşteri onay ekranını görüp gelen kutusunda hiçbir şey bulmuyordu.
 *
 * Müşterinin KENDİ anlatımı mailde durur. Bu, "kimse kendi cümlesini mailde okumak istemez"
 * kuralının istisnası değil, başka bir iş: teyidin işi bize ne ulaştığını KANITLAMAK. Yarın
 * "size şunu yazmıştım" denildiğinde kaydı müşterinin kendi gelen kutusundadır.
 */
export function TicketReceivedEmail({ data, brandName, postalAddress }: TicketEmailProps) {
  const t = TICKET_COPY[data.locale];
  const [opening, ...rest] = data.history;
  return (
    <TicketShell
      data={data}
      brandName={brandName}
      postalAddress={postalAddress}
      preview={t.receivedIntro}
      pill={`✓ ${t.statuses[data.status]}`}
      title={t.receivedTitle}
      intro={t.receivedIntro}
      quoted={rest}
    >
      {opening && <MessageCard title={t.receivedCardTitle} meta={opening.at} body={opening.body} />}
    </TicketShell>
  );
}

export function ticketRepliedSubject(data: TicketNotification): string {
  return TICKET_COPY[data.locale].repliedSubject(ticketLabel(data, data.locale));
}

/** Personel cevap yazdı. Cevabın TAM metni maildedir — müşteri okumak için tıklamak zorunda değil. */
export function TicketRepliedEmail({ data, brandName, postalAddress }: TicketEmailProps) {
  const t = TICKET_COPY[data.locale];
  /*
    OKUNMAMIŞ CEVAPLARIN HEPSİ TAM KARTTA, ESKİDEN YENİYE (17.08).

    Eskiden `history[0]` tek başına "cevap" sayılır, kalanı alıntıya düşerdi. Cevap maili
    ertelendiğinden (21.70) tek mail birden çok yeni cevap taşıyor ve o varsayım yanlışa döndü:
    ölçülen bir karede son ÜÇ mesajın üçü de yeni ve bizdendi, ikisi soluk alıntıda duruyordu —
    aynı konuşma sebepsiz ikiye bölünmüştü.

    Sıra blok İÇİNDE eskiden yeniye, çünkü **mail yukarıdan aşağı okunur** (kullanıcı ayrımı
    17.08): sohbette göz en altta sabittir, mailde akar. Bloklar arası sıra ise değişmedi —
    haber üstte, bağlam altında; alıntı izi e-posta geleneğine uygun olarak yeniden eskiye.

    Başlık yalnız İLK kartta: art arda üç kez "Cevabımız" yazmak bilgi değil gürültü.
  */
  const unread = data.history.filter((entry) => entry.unread).reverse();
  const rest = data.history.filter((entry) => !entry.unread);
  return (
    <TicketShell
      data={data}
      brandName={brandName}
      postalAddress={postalAddress}
      preview={t.repliedIntro}
      pill={`✉ ${t.statuses[data.status]}`}
      title={t.repliedTitle}
      intro={t.repliedIntro}
      quoted={rest}
    >
      {unread.map((entry, index) => (
        <MessageCard key={`${entry.at}-${index}`} title={index === 0 ? t.replyCardTitle : null} meta={entry.at} body={entry.body} />
      ))}
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
 *
 * **Yazışma GÖSTERİLMEZ** (`quoted={[]}`), ne tam kart ne alıntı: bu mailin konusu bir mesaj değil
 * bir DURUM, ve neyin çözüldüğünü künye kartı zaten söylüyor (başlık + tarih + sipariş bağı).
 * Cevabın metni başka bir olayın konusudur ve o mail zaten gitmiştir; burada tekrarlamak aynı
 * cümleyi iki kez göndermek olurdu.
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
      quoted={[]}
    />
  );
}
