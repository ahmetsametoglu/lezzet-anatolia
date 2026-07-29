import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, NoticeCard, EmailLayout, PlainListCard, StatusBlock, StatusPill, TotalsCard } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **Eksik karşılanma** (14.5) — `design/project/Email - Siparis Eksik Karsilanma.html`.
 *
 * Teslimattan ÖNCE gider: müşteri kapıda sürprizle karşılaşmasın. Zaman çizgisi yok; eksik kalem
 * amber bir blokta, para çözümü hemen altında.
 *
 * **Sebep yazılmaz** (tasarım kuralı). Stok mu bitti, tedarik mi gecikti — bu bizim sorunumuz;
 * müşterinin bilmesi gereken şey miktar ve paradır.
 */

interface Copy {
  pill: string;
  title: string;
  intro: (referenceNo: string) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (amount: string | null) => string;
  blockHeadline: string;
  totalsTitle: string;
  previousTotal: string;
  difference: string;
  currentTotal: string;
  refundNote: (amount: string) => string;
  collectNote: (amount: string) => string;
  fullItems: string;
  cta: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '⚠ Kalem eksik gönderildi',
    title: 'Siparişinizde bir değişiklik var.',
    intro: (ref) => (
      <>
        <strong style={{ color: '#3a4147' }}>{ref}</strong> siparişinizin bir kaleminden sipariş ettiğiniz miktarın tamamını
        gönderemedik. Siparişin kalanı planlandığı gibi yolda.
      </>
    ),
    subject: (ref) => `Siparişinizde bir değişiklik var — ${ref}`,
    preview: (amount) => (amount ? `Bir kalem eksik gönderildi, ${amount} iade edilecek.` : 'Bir kalem eksik gönderildi.'),
    blockHeadline: 'Eksik gönderilen kalem',
    totalsTitle: 'Güncellenen tutar',
    previousTotal: 'Önceki toplam',
    difference: 'Eksik kalem farkı',
    currentTotal: 'Güncel toplam',
    refundNote: (amount) => `Online ödediğiniz için fark (${amount}) ödeme yönteminize iade edilir — 3–5 iş günü.`,
    collectNote: (amount) => `Tahsilat doğrudan ${amount} üzerinden yapılır; eksik kalem için ödeme almayız.`,
    fullItems: 'Tam gönderilen kalemler',
    cta: 'Siparişimi görüntüle',
    helpTitle: 'Bu haliyle olmaz mı?',
    helpText: 'Eksik kalem sizin için önemliyse yazın: kalan adedi bir sonraki teslimatınıza ekleyelim ya da siparişi iptal edelim.',
    helpLink: 'Bize yazın →',
  },
  fr: {
    pill: '⚠ Article partiellement expédié',
    title: 'Un changement sur votre commande.',
    intro: (ref) => (
      <>
        Sur votre commande <strong style={{ color: '#3a4147' }}>{ref}</strong>, nous n’avons pas pu expédier la totalité d’un
        article. Le reste de la commande arrive comme prévu.
      </>
    ),
    subject: (ref) => `Un changement sur votre commande — ${ref}`,
    preview: (amount) => (amount ? `Un article partiellement expédié, ${amount} seront remboursés.` : 'Un article partiellement expédié.'),
    blockHeadline: 'Article partiellement expédié',
    totalsTitle: 'Montant actualisé',
    previousTotal: 'Total précédent',
    difference: 'Écart article manquant',
    currentTotal: 'Total actualisé',
    refundNote: (amount) => `Votre paiement étant en ligne, l’écart (${amount}) est remboursé sur votre moyen de paiement — 3 à 5 jours ouvrés.`,
    collectNote: (amount) => `L’encaissement se fait directement sur ${amount} ; l’article manquant n’est pas facturé.`,
    fullItems: 'Articles expédiés en totalité',
    cta: 'Voir ma commande',
    helpTitle: 'Cela ne vous convient pas ?',
    helpText: 'Si cet article compte pour vous, écrivez-nous : nous l’ajoutons à votre prochaine livraison ou annulons la commande.',
    helpLink: 'Nous écrire →',
  },
  de: {
    pill: '⚠ Artikel unvollständig versandt',
    title: 'Es gibt eine Änderung an Ihrer Bestellung.',
    intro: (ref) => (
      <>
        Bei Ihrer Bestellung <strong style={{ color: '#3a4147' }}>{ref}</strong> konnten wir von einem Artikel nicht die volle
        Menge versenden. Der Rest der Bestellung ist wie geplant unterwegs.
      </>
    ),
    subject: (ref) => `Änderung an Ihrer Bestellung — ${ref}`,
    preview: (amount) => (amount ? `Ein Artikel unvollständig versandt, ${amount} werden erstattet.` : 'Ein Artikel unvollständig versandt.'),
    blockHeadline: 'Unvollständig versandter Artikel',
    totalsTitle: 'Aktualisierter Betrag',
    previousTotal: 'Vorheriger Gesamtbetrag',
    difference: 'Differenz fehlender Artikel',
    currentTotal: 'Aktueller Gesamtbetrag',
    refundNote: (amount) => `Da Sie online bezahlt haben, wird die Differenz (${amount}) auf Ihr Zahlungsmittel erstattet — 3–5 Werktage.`,
    collectNote: (amount) => `Der Einzug erfolgt direkt auf ${amount}; der fehlende Artikel wird nicht berechnet.`,
    fullItems: 'Vollständig versandte Artikel',
    cta: 'Meine Bestellung ansehen',
    helpTitle: 'Passt Ihnen das nicht?',
    helpText: 'Wenn Ihnen der Artikel wichtig ist, schreiben Sie uns: Wir legen die Restmenge der nächsten Lieferung bei oder stornieren.',
    helpLink: 'Schreiben Sie uns →',
  },
};

export function orderShortfallSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderShortfallEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];
  const short = data.lines.filter((line) => line.shortfall);
  const full = data.lines.filter((line) => !line.shortfall);

  return (
    <EmailLayout
      preview={t.preview(data.refund?.amount ?? null)}
      locale={data.locale}
      brandName={brandName}
      region={shared.region}
      footer={{
        address: postalAddress,
        notice: shared.footerNotice(data.referenceNo),
        preferencesLabel: shared.preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <StatusPill label={t.pill} tone="amber" />
      <Headline title={t.title} intro={t.intro(data.referenceNo)} />
      {short.map((line) => (
        <StatusBlock
          key={line.name}
          tone="amber"
          headline={t.blockHeadline}
          detail={
            <>
              <strong style={{ color: '#3a4147' }}>{`${line.name} · ${line.qty}`}</strong>
              <br />
              {line.shortfall}
            </>
          }
        />
      ))}
      {data.refund && (
        <TotalsCard
          title={t.totalsTitle}
          totals={[
            { label: t.previousTotal, value: data.refund.previousTotal },
            { label: t.difference, value: `−${data.refund.amount}`, positive: true },
          ]}
          grandTotal={data.refund.currentTotal ? { label: t.currentTotal, value: data.refund.currentTotal } : null}
          paymentNote={null}
          // Kapıda ödemede iade satırı yerine tahsilat cümlesi kurulur (tasarım kuralı): para hiç
          // alınmadıysa "iade edilecek" demek yanlış olurdu.
          footnote={
            data.paidOnline
              ? t.refundNote(data.refund.amount)
              : t.collectNote(data.refund.currentTotal ?? data.refund.previousTotal)
          }
        />
      )}
      {full.length > 0 && <PlainListCard title={t.fullItems} lines={full} />}
      <CtaButton label={t.cta} url={data.orderUrl} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </EmailLayout>
  );
}
