'use client';

import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { SummaryPanel } from '@/components/customer/phone-kit/summary-panel';
import { Icon } from '@/components/customer/ui/icons';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import type { CheckoutCopy } from '../checkout-types';
import { awaitingCopy } from './components/confirmation-sections';
import { useInviteShare } from './components/use-invite-share.hook';
import { isRefundedCancellation, type ConfirmationView, type ConfirmationViewProps, type Messages } from './confirmation-types';

/**
 * Sipariş alındı — TELEFON görünümü: native onay ekranının (`apps/mobile/src/screens/checkout/order-confirmed-screen.tsx`)
 * web ikizi (kullanıcı kararı 14.09 — müşterinin telefon tasarımı iki yüzeyde aynı, referans native). Ortalı tek sütun:
 * büyük işaret · başlık · sipariş numarası · teslimat/ödeme/toplam özeti · bildirim notu · komşu daveti · iki çıkış
 * (siparişlerim · alışverişe dön). Metin ortak ödeme sözlüğünün `confirmed` bölümünden (`@lezzet/i18n/customer/checkout`).
 *
 * ── WEB'E ÖZGÜ ─────────────────────────────────────────────────────────────
 * · Bu sayfa kart ödemesinin DÖNÜŞ yeri: sipariş henüz taslakken (onayı webhook yazar) "ödemeniz onaylanıyor" der ve
 *   kendini yeniler (`OrderWatch`, sayfada); tamamlanmayan ödeme ve iptal (iadeli/iadesiz) kendi cümlesiyle ve "tekrar
 *   dene" çıkışıyla çizilir. İşaretin rengi hâli söyler — zeytin oldu · bal bekleniyor · terracotta olmadı (masaüstü
 *   bandının üç tonu, aynı kural). Native'de bu hâller yok: native ödeme kartının sonucunu ekrana gelmeden karşılıyor.
 * · Komşu davetinin metni web'in sözlüğünden: native başlığı emojiyle yazıyor, web'in müşteri ekranlarında emoji yok
 *   (08.59, ikon seti). Paylaşım masaüstüyle aynı kapıdan (`useInviteShare`).
 *
 * ── BİLİNÇLİ FARKLAR ───────────────────────────────────────────────────────
 * Masaüstünün zaman çizgisi, kalem listesi, adres kartı ve yardım şeridi telefonda yok — native'de karşılığı yok;
 * siparişin ayrıntısı "Siparişlerim"de.
 */

/** Hâlin tonu — işaretin zemini. */
type Tone = 'olive' | 'honey' | 'terracotta';

const MARK: Record<Tone, string> = {
  olive: 'bg-olive',
  honey: 'bg-honey',
  terracotta: 'bg-terracotta-bright',
};

export function ConfirmationMobile({ t, locale, view }: ConfirmationViewProps) {
  const copy = checkoutMessages[locale];
  const c = copy.confirmed;
  // Masaüstünün bandıyla AYNI kural: tamamlanmayan ödeme bir ret gibi, alınmış ödeme bir onay gibi okunur.
  const failed = view.cancelled || view.paymentState === 'incomplete';
  const tone: Tone = failed ? 'terracotta' : view.placed || view.paymentState === 'paid' ? 'olive' : 'honey';
  const awaiting = awaitingCopy(t, view.paymentState);
  const refunded = isRefundedCancellation(view);
  const title = view.cancelled ? (refunded ? t.refunded : t.failed) : view.placed ? c.title : view.awaitingCard ? awaiting.title : t.incomplete;
  // Kesinleşmemiş hâlde cümle başlığın hemen altında — ekranın asıl söylediği o. Kesinleşmişte native'in notu özetin altında.
  const statusBody = view.cancelled ? (refunded ? t.refundedBody : t.failedBody) : view.placed ? null : view.awaitingCard ? awaiting.body : t.incompleteBody;

  return (
    <div className="flex flex-col items-center gap-3.5 px-7.5 pt-17.5 pb-[calc(30px+env(safe-area-inset-bottom))] text-center">
      <span aria-hidden className={['grid size-23 flex-none place-items-center rounded-full text-card', MARK[tone]].join(' ')}>
        <Icon name={failed ? 'close' : tone === 'olive' ? 'check' : 'timer'} size={40} strokeWidth={2.2} />
      </span>
      <h1 className="font-serif text-page-title-sm leading-[1.15] text-ink">{title}</h1>
      {statusBody !== null && <p className="font-sans text-body-sm leading-[1.6] text-body">{statusBody}</p>}
      {/* Numara ilk kalıcı durumda doğar: taslakta satır HİÇ çizilmez — "bilinmiyor" yazan numara, olmayandan kötüdür. */}
      {view.referenceNo && <p className="font-sans text-body-sm font-semibold text-muted">{c.reference.replace('{reference}', view.referenceNo)}</p>}

      <div className="w-full text-left">
        <SummaryPanel
          rows={[
            { key: 'delivery', label: c.delivery, value: deliveryLabel(copy, view, locale) },
            { key: 'payment', label: c.payment, value: paymentLabel(copy, view) },
          ]}
          totalLabel={c.total}
          totalValue={formatPrice(view.totalCents, locale)}
        />
      </div>

      {view.placed && <p className="font-sans text-body-sm leading-[1.6] text-muted">{c.note}</p>}
      {view.placed && view.neighborInvite && <NeighborInvite t={t} invite={view.neighborInvite} />}

      <div className="mt-2 flex w-full flex-col gap-2.5">
        {/* Olmadıysa çıkış sepete: yeni deneme eski taslağı ve eski ödemeyi kapatır (masaüstünün aynı yolu). */}
        {failed ? <PrimaryButton shape="block" label={t.retry} href="/cart" /> : <PrimaryButton shape="block" label={c.orders} href="/orders" />}
        <SecondaryButton label={c.home} href="/" />
      </div>
    </div>
  );
}

/** Teslimat satırı: rota-içinde gün, kargoda kargonun adı; gün yoksa yolun adı — uydurulmuş gün yazılmaz (native kuralı). */
function deliveryLabel(copy: CheckoutCopy, view: ConfirmationView, locale: Locale): string {
  if (!view.onRoute) return copy.confirmed.shipping;
  return view.deliveryDate ? formatDeliveryDate(view.deliveryDate, locale) : copy.delivery.door;
}

/**
 * Ödeme satırı: vadeli bir yöntem değil siparişin bayrağı; kart ve çek KAPIDA kullanılan araçlardır (kurye kapanışta
 * yazar), müşterinin seçtiği yol kapıda ödemedir. Yöntem henüz seçilmemişse "bilinmiyor" — "kapıda" DEĞİL.
 */
function paymentLabel(copy: CheckoutCopy, view: ConfirmationView): string {
  if (view.onAccount) return copy.payment.credit;
  switch (view.paymentMethod) {
    case 'online':
      return copy.payment.online;
    case 'cash':
    case 'card':
    case 'cheque':
      return copy.payment.onDelivery;
    case 'bank_transfer':
      return copy.payment.transfer;
    case null:
      return copy.confirmed.unknown;
  }
}

interface NeighborInviteProps {
  t: Messages;
  invite: NonNullable<ConfirmationView['neighborInvite']>;
}

/**
 * Komşunu bu güne çağır (17.10) — native şeridin yerleşimi (zeytin kutu, ortalı, hap düğme), metin web'in (künye).
 * Kontenjan söylenir; dolduysa paylaşım sunulmaz — ölü bir bağlantı iki tarafı da boşa uğraştırır (08.55).
 */
function NeighborInvite({ t, invite }: NeighborInviteProps) {
  const { share, copied } = useInviteShare();
  const full = invite.remainingUses === 0;
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-card bg-olive-bg px-4.5 py-3.5">
      <span className="flex items-center gap-1.5 font-sans text-body-sm font-semibold text-ink">
        <Icon name="truck" size={16} className="flex-none text-olive" />
        {t.neighbor.title}
      </span>
      <span className="font-sans text-note leading-[1.6] text-muted">{t.neighbor.body}</span>
      <span className="font-sans text-note font-semibold leading-[1.6] text-muted">
        {(full ? t.neighbor.full : t.neighbor.remaining).replace('{n}', String(invite.remainingUses)).replace('{max}', String(invite.maxUses))}
      </span>
      {!full && <SecondaryButton shape="pill" tone="olive" label={copied ? t.neighbor.copied : t.neighbor.cta} onClick={() => void share(invite.url)} />}
    </div>
  );
}
