'use client';

import type { ReactNode } from 'react';
import { whatsappHref } from '@lezzet/brand';
import { RATIO_SQUARE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { SummaryRow, summaryCopy } from '@/components/customer/ui/summary-row';
import { Link } from '@/i18n/navigation';
import { formatDeliveryDate, formatPrice, formatShortDate, formatTime } from '@/lib/storefront/format';
import { isRefundedCancellation, type ConfirmationView, type ConfirmationViewProps, type Messages } from '../confirmation-types';
import { useShareLink } from '@/lib/use-share-link.hook';

/**
 * Sipariş alındı ekranının blokları: masaüstü ve mobil aynı parçaları farklı düzende dizer; `compact` bloğa prop olarak iner,
 * mobil hâl bloğun kendi kararıdır.
 */

/**
 * Ödemesi beklenen kart taslağının cümlesi, sağlayıcının söylediğine göre; sorulamadıysa (`null`) "onaylanıyor" kalır.
 */
export function awaitingCopy(t: Messages, state: ConfirmationView['paymentState']): { title: string; body: string } {
  switch (state) {
    case 'paid':
      return { title: t.paid, body: t.paidBody };
    case 'processing':
      return { title: t.pending, body: t.processingBody };
    case 'incomplete':
      return { title: t.failed, body: t.failedBody };
    default:
      return { title: t.pending, body: t.pendingBody };
  }
}

/* ————————————————————————————— Kutlama bandı ————————————————————————————— */

/**
 * Sayfanın ilk söylediği şey "oldu"dur: tam genişlikte, ortalı bant. Zemin duruma göre değişir —
 * tasarımın notu da bunu diyor: onay ekranı yalnız üst bloğu ve ödeme kartını değiştirir,
 * iskeletini hiç değiştirmez.
 */
export function CelebrationBand({ t, locale, view, compact }: ConfirmationViewProps) {
  const placedTime = formatTime(view.createdAt, locale);
  // Taslakta da sağlayıcının söylediği tonu belirler: tamamlanmamış ödeme ret, alınmış ödeme onay gibi okunur.
  const failed = view.cancelled || view.paymentState === 'incomplete';
  const settledOk = view.placed || view.paymentState === 'paid';
  const awaiting = awaitingCopy(t, view.paymentState);
  return (
    <section
      className={[
        'border-b',
        failed ? 'border-terracotta-line bg-terracotta-bg' : settledOk ? 'border-olive-line bg-olive-bg' : 'border-honey-line bg-honey-bg',
      ].join(' ')}
    >
      <div className={[shellClass(compact), 'flex flex-col items-center gap-2.5 text-center', compact ? 'py-7' : 'py-11'].join(' ')}>
        <span
          className={[
            'grid flex-none place-items-center rounded-full text-card-title text-card',
            compact ? 'size-[46px]' : 'size-[58px]',
            failed ? 'bg-terracotta-bright' : settledOk ? 'bg-olive' : 'bg-honey',
          ].join(' ')}
          aria-hidden="true"
        >
          <Icon name={failed ? 'close' : settledOk ? 'check' : 'timer'} size={compact ? 22 : 28} strokeWidth={2.2} />
        </span>

        {/* `leading-tight`: tip token'ları satır yüksekliği taşımaz, miras kalan 1.5 çember ile başlık arasını açardı. */}
        <h1 className={['font-serif leading-tight text-ink', compact ? 'text-page-title-sm' : 'text-page-title'].join(' ')}>
          {view.cancelled
            ? isRefundedCancellation(view)
              ? t.refunded
              : t.failed
            : view.placed
              ? view.customerFirstName
                ? t.title.replace('{name}', view.customerFirstName)
                : t.titleAnon
              : view.awaitingCard
                ? awaiting.title
                : t.incomplete}
        </h1>

        <p className="max-w-[620px] font-sans text-body leading-relaxed text-body">
          {view.cancelled ? (
            // İptalde iki cümle: parası iade edilmişe "tahsilat yapılmadı" demek yalan olurdu.
            isRefundedCancellation(view) ? t.refundedBody : t.failedBody
          ) : view.placed ? (
            // E-posta KALIN (tasarım): cümlenin içinde müşterinin gözünün aradığı tek şey kendi
            // adresidir — doğru yere gitti mi diye bakar. Düz metinde kayboluyordu.
            <Mailed template={t.mailed} email={view.customerEmail} />
          ) : view.awaitingCard ? (
            awaiting.body
          ) : (
            t.incompleteBody
          )}
        </p>

        {/* Künye HAP olarak: numara ve saat okunacak iki ayrı bilgi, tek satıra dizilmiş gri bir
            künye değil. Numara yoksa (sipariş henüz kesinleşmedi) hap hiç çizilmez. */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
          {view.referenceNo && (
            <span className="rounded-pill border border-sand-400 bg-card px-4 py-2 font-sans text-body-sm font-bold text-ink">
              {t.orderNo.replace('{reference}', view.referenceNo)}
            </span>
          )}
          {/* Gün VE saat (tasarım: "22 Temmuz, 14:38"): siparişin ne zaman verildiği aynı gün
              içinde iki kez alışveriş yapan müşteri için yalnız günle ayırt edilemiyor. */}
          <span className="rounded-pill border border-sand-400 bg-card px-4 py-2 font-sans text-body-sm font-semibold text-body">
            {formatShortDate(view.createdAt, locale)}, {placedTime}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ————————————————————————————— Teslimat · Ödeme ————————————————————————————— */

/** Nereye, ne zaman. Adres ANLIK GÖRÜNTÜDEN okunur, adres tablosundan değil (07). */
export function DeliveryCard({ t, shared, locale, view, compact }: ConfirmationViewProps) {
  const day = view.deliveryDate ? formatDeliveryDate(view.deliveryDate, locale) : null;
  return (
    <Card compact={compact} gap="sm">
      <Eyebrow>{t.delivery.title}</Eyebrow>
      <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {day ?? shared.delivery.shipping}
      </span>
      <Chip>
        <Icon name={view.onRoute ? 'truck' : 'box'} size={13} />
        {view.onRoute ? shared.delivery.route : shared.delivery.shipping}
      </Chip>
      {view.address && (
        <span className="font-sans text-body-sm leading-relaxed text-body">
          {view.address.label ? `${view.address.label} · ` : ''}
          {view.address.line1}
          {view.address.line2 ? `, ${view.address.line2}` : ''}
          <br />
          {view.address.postalCode} {view.address.city}
        </span>
      )}
      <Footnote>
        <span className="flex items-start gap-2">
          <Icon name={view.onRoute ? 'snowflake' : 'box'} size={14} className="mt-0.75 flex-none" />
          {view.onRoute ? t.delivery.coldChain : t.delivery.shippingNote}
        </span>
      </Footnote>
    </Card>
  );
}

/** Ne ödendi, neyle. "Ödendi" siparişin KENDİ durumundan okunur — dönüşü başarı saymaz. */
export function PaymentCard({ t, shared, locale, view, compact }: ConfirmationViewProps) {
  const total = formatPrice(view.totalCents, locale);
  return (
    <Card compact={compact} gap="sm">
      <Eyebrow>{shared.payment.title}</Eyebrow>
      <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {view.onAccount
          ? t.payment.onAccount.replace('{amount}', total)
          : view.paymentMethod === 'online'
            ? (view.placed ? t.payment.paid : t.pending).replace('{amount}', total)
            : t.payment.due.replace('{amount}', total)}
      </span>
      <Chip>{view.onAccount ? t.payment.credit : view.paymentMethod === 'online' ? t.payment.online : t.payment.cod}</Chip>
      {/* Kart künyesi: son dört hane ödeme sağlayıcısından çekilecek (12) — bugün saklamıyoruz,
          uydurma rakam yazmaktansa yalnız aracı söyleriz. */}
      {view.paymentMethod === 'online' && view.placed && <span className="font-sans text-body-sm text-body">{t.payment.card}</span>}
      {/* Fatura değil teslimat özeti: fatura dışarıdaki muhasebede doğar; belge kutu hazırlandıktan sonra oluşur. */}
      <Footnote>{t.payment.deliveryNoteBody}</Footnote>
      {/* BEKLEYEN(14.6): teslimat özeti PDF üretimi — bağlantı tasarımda var, yerinde durur ve ne
          zaman geleceğini söyler; silmek tasarımın bu satırını kaybetmek olurdu. */}
      <span className="font-sans text-note font-bold text-muted">
        {t.payment.deliveryNote} · {t.payment.deliveryNoteWhen}
      </span>
    </Card>
  );
}

/* ————————————————————————————— Zaman çizgisi ————————————————————————————— */

/**
 * Dört adımlı yolculuk. Masaüstünde YATAY (yolculuk soldan sağa okunur), mobilde dikey — dar
 * ekranda yatay dizilim adım adlarını okunmaz hâle getirir (Sapma 3).
 */
export function TimelineCard({ t, locale, view, compact }: ConfirmationViewProps) {
  const day = view.deliveryDate ? formatDeliveryDate(view.deliveryDate, locale) : null;
  const steps = [
    { label: t.timeline.placed, when: t.timeline.placedAt.replace('{time}', formatTime(view.createdAt, locale)), done: true },
    { label: t.timeline.preparing, when: day ? t.timeline.preparingAt : null, done: false },
    { label: t.timeline.onTheWay, when: day ? t.timeline.onTheWayAt.replace('{date}', day) : null, done: false },
    { label: t.timeline.delivered, when: day ? t.timeline.deliveredAt.replace('{date}', day) : null, done: false },
  ];

  return (
    <Card compact={compact} gap="sm">
      <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.timeline.title}</span>
      {compact ? (
        <ol className="flex flex-col gap-2.5">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2.5">
              <Dot done={step.done} />
              <span className={['flex-1 font-sans text-note', step.done ? 'font-bold text-ink' : 'text-muted'].join(' ')}>{step.label}</span>
              {step.when && <span className="font-sans text-micro text-muted">{step.when}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="flex items-start">
          {steps.map((step, i) => (
            <li key={step.label} className={['flex flex-col gap-2', i === steps.length - 1 ? 'flex-none min-w-[120px]' : 'flex-1'].join(' ')}>
              <div className="flex items-center gap-2">
                <Dot done={step.done} />
                {/* Bağlayıcı çizgi SON adımda yok: yolculuk orada biter, boşluğa uzanmaz. */}
                {i < steps.length - 1 && <div className={['h-0.5 flex-1', step.done ? 'bg-olive' : 'bg-sand-200'].join(' ')} />}
              </div>
              {/* Sağ pay METİNDE, sütunda değil: sütuna verilseydi bağlayıcı çizgi de kısalır,
                  sonraki noktaya ulaşamazdı. */}
              <span className={['pr-5 font-sans text-body-sm', step.done ? 'font-bold text-ink' : 'font-bold text-muted'].join(' ')}>{step.label}</span>
              {step.when && <span className="pr-5 font-sans text-micro leading-relaxed text-muted">{step.when}</span>}
            </li>
          ))}
        </ol>
      )}
      <Footnote>{t.timeline.note}</Footnote>
    </Card>
  );
}

/* ————————————————————————————— Yardım · Özet ————————————————————————————— */

/**
 * Yardım bandı: sayfanın altındaki açık kapı, düğme mobilde çizilmez. `wa.me` metni siparişe özgüdür; taslakta numara yoksa
 * numarasız metin gider, yuvası boş bir cümle gönderilmez.
 */
export function HelpBand({
  t,
  compact,
  referenceNo,
}: Pick<ConfirmationViewProps, 't' | 'compact'> & { referenceNo: string | null }) {
  const href = whatsappHref(referenceNo ? t.help.prefill.replace('{reference}', referenceNo) : t.help.prefillPlain);
  const box = ['flex items-center gap-4 rounded-card bg-cream-deep', compact ? 'px-4 py-3.5' : 'px-6.5 py-5'].join(' ');

  /* `target="_blank"` + `rel`: WhatsApp Web yeni sekmede açılır, mobil cihazda uygulamaya devredilir.
     Sipariş sayfası ARKADA KALIR — müşteri yazışmadan dönünce siparişini kaybetmemeli. */
  const link = { href, target: '_blank', rel: 'noopener noreferrer' } as const;

  const content = (
    <>
      <Icon name="chat" size={24} className="flex-none text-olive" />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-sans text-body-sm font-bold text-ink">{t.help.title}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.help.body}</span>
        {/* Dar ekranda düğme yerine bu satır: dokunma hedefi ŞERİDİN TAMAMI ama görünmez değil —
            eylemin adı yazılı durur. Görünmez bir dokunma hedefi, olmayan bir düğmeden kötüdür. */}
        {compact && <span className="font-sans text-note font-bold text-olive underline">{t.help.cta}</span>}
      </div>
    </>
  );

  /*
    DAR EKRANDA ŞERİDİN TAMAMI TIKLANABİLİR (23.08 · kullanıcı kararı) — düğme ikinci satıra
    alınmadı.

    ~~Karar Claude Design'a bırakılmıştı~~: `!compact` çizimin kararıydı ama o karar düğme ÖLÜYKEN
    (`disabled` + "· yakında") verilmişti. 15.3 düğmeyi canlandırınca gerilim tersine döndü —
    **WhatsApp'ın doğal cihazı telefondur**, yani düğmenin en değerli olduğu yer mobil ve tam orada
    yoktu. Kullanıcı 23.08'de "gerekli gördüğünü yap" dedi.

    İki seçenekten bu seçildi çünkü YENİ BİR DÜZEN İCAT ETMİYOR (`CLAUDE §3`): kutu, boşluklar ve
    tipografi aynen kalıyor; değişen tek şey sarmalayıcı öğe. Düğmeyi ikinci satıra almak, dar
    ekranda çizimde olmayan bir yerleşim kurmak olurdu.
  */
  return compact ? (
    <a {...link} className={`${box} cursor-pointer`}>
      {content}
    </a>
  ) : (
    <div className={box}>
      {content}
      <a {...link} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-none' })}>
        {t.help.cta}
      </a>
    </div>
  );
}

/**
 * Komşunu bu sefere çağır: yardım bandının gramerinde; davet yoksa hiç çizilmez. Kontenjan sözleşmeden gelir ve yazılır,
 * dolduysa bant kalır, yalnız paylaşım düğmesi gider.
 */
export function NeighborBand({ t, compact, view }: Pick<ConfirmationViewProps, 't' | 'compact' | 'view'>) {
  // Paylaşım kapısı telefonun bandıyla ortak; kanca erken dönüşten önce çağrılır.
  const { share, copied } = useShareLink();
  const invite = view.neighborInvite;
  if (!invite) return null;
  const { url } = invite;
  const full = invite.remainingUses === 0;
  // Yer tutucular metnin İÇİNDE: cümle dile göre farklı sırada kuruluyor (FR'de sayı başta, DE'de
  // ortada) ve parçalara bölünmüş bir çeviri o sırayı dayatırdı.
  const limitText = (full ? t.neighbor.full : t.neighbor.remaining)
    .replace('{n}', String(invite.remainingUses))
    .replace('{max}', String(invite.maxUses));

  return (
    <div className={['flex items-center gap-4 rounded-card bg-cream-deep', compact ? 'px-4 py-3.5' : 'px-6.5 py-5'].join(' ')}>
      <Icon name="truck" size={24} className="flex-none text-olive" />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-sans text-body-sm font-bold text-ink">{t.neighbor.title}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.neighbor.body}</span>
        {/* Kontenjan cümlesi gövdenin ALTINDA ve daha soluk: davetin kendisi değil, koşulu.
            Dolduğunda vurgusu artar (`text-ink`) — o hâlde tek bilgi taşıyan satır bu. */}
        <span className={['font-sans text-micro leading-relaxed', full ? 'font-medium text-ink' : 'text-muted'].join(' ')}>
          {limitText}
        </span>
      </div>
      {/* Mobilde de çizilir, çünkü bloğun tek işlevi paylaşmak; dolduysa çizilmez. */}
      {full ? null : (
        <Button variant="secondary" size="sm" className="flex-none" onClick={() => void share(url)}>
          {copied ? t.neighbor.copied : t.neighbor.cta}
        </Button>
      )}
    </div>
  );
}

/** Ne alındı, ne ödendi + iki çıkış (takip / katalog). */
export function SummaryCard({ t, locale, view, compact }: ConfirmationViewProps) {
  const total = formatPrice(view.totalCents, locale);
  // Özetin ortak sözcükleri bloğun yanındaki nötr sözlükten: aynı blok sipariş detayında da çizilir.
  const summary = summaryCopy(locale);
  // Kod tasarımda birebir yazılı ("İndirim — HOSGELDIN10"); kodsuz indirimde satır genel adında kalır.
  const discountLabel = view.discountName ? `${summary.discount} — ${view.discountName}` : summary.discount;

  return (
    <Card compact={compact} gap="sm">
      <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{summary.title}</span>

      <ul className="flex flex-col gap-2.5">
        {view.lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3">
            {/* Görsel 44px kare: müşteri adı okumadan da ne aldığını tanır. */}
            <div className="w-11 flex-none">
              <FramedImage src={line.image?.url ?? null} alt={line.name} ratio={RATIO_SQUARE} crop={line.image?.crop} frames={line.image?.frames} sizes="44px" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-sans text-note font-bold text-ink">{line.name}</span>
              <span className="font-sans text-micro text-muted">{line.unit ? `${line.unit} × ${line.qty}` : `× ${line.qty}`}</span>
            </div>
            <span className="flex-none font-sans text-body-sm font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5 border-t border-sand-200 pt-2.5">
        {view.discountCents > 0 && (
          <SummaryRow label={discountLabel} value={`−${formatPrice(view.discountCents, locale)}`} tone="olive" />
        )}
        <SummaryRow
          label={summary.delivery}
          value={view.shippingFeeCents > 0 ? formatPrice(view.shippingFeeCents, locale) : summary.free}
          // Ücretsizde YALNIZ tutar yeşil (tasarım): ücret maliyet, ücretsizlik kazanç.
          tone={view.shippingFeeCents > 0 ? 'default' : 'oliveValue'}
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-sand-200 pt-2.5">
          <span className="font-sans text-lead font-bold text-ink">{summary.total}</span>
          <span className="font-sans text-lead font-bold text-ink">{total}</span>
        </div>
        <span className="font-sans text-micro text-muted">{summary.vatIncluded}</span>
      </div>

      {/* Tamamlanmamış ödemede de müşteri sepetine döner: yeni deneme eski taslağı ve ödemeyi kapatır. */}
      {view.cancelled || view.paymentState === 'incomplete' ? (
        <Link href="/cart" className={buttonClass({ size: 'md', compact, fullWidth: true })}>
          {t.retry}
        </Link>
      ) : (
        /** Sipariş detayı kimlikle açılır, çünkü numara ancak onayla doğar. */
        <Link href={{ pathname: '/orders/[reference]', params: { reference: view.orderId } }} className={buttonClass({ size: 'md', compact, fullWidth: true })}>
          {t.track}
        </Link>
      )}
      <Link href="/catalog" className={buttonClass({ variant: 'secondary', size: 'md', compact, fullWidth: true })}>
        {t.continue}
      </Link>
    </Card>
  );
}

/* ————————————————————————————— Küçük parçalar ————————————————————————————— */

/**
 * Sayfa kabuğu — bant ile gövde AYNI eksende durmak zorunda; iki dosyada iki kez yazılsaydı biri
 * pedini değiştirdiğinde bandın içeriği gövdeyle hizasını kaybederdi.
 */
export function shellClass(compact: boolean): string {
  return ['mx-auto w-full max-w-[1360px]', compact ? 'px-4' : 'px-12'].join(' ');
}

/**
 * "Onay e-postasını **X** adresine gönderdik" — adres KALIN.
 *
 * Metin çeviri dosyasından tek parça geliyor ve kalınlığı oraya HTML olarak gömmedik: çeviri
 * dosyasına işaretleme girdiği an üç dil birbirinden kayar ve metin artık düz metin olmaktan çıkar.
 */
function Mailed({ template, email }: { template: string; email: string }) {
  const [before, after] = template.split('{email}');
  return (
    <>
      {before}
      <strong className="font-bold text-ink">{email}</strong>
      {after}
    </>
  );
}

/** Üstbaşlık: kartın NE olduğunu söyler, içeriğin kendisi başlığı tekrar etmez. */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="font-sans text-eyebrow uppercase text-muted">{children}</span>;
}

/** Durum hapı — teslimat yolu / ödeme aracı. Renk hep zeytin: ikisi de olumlu bir olgu bildirir. */
function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex w-max items-center gap-1.5 rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-note font-semibold text-olive">{children}</span>;
}

/** Kartın alt notu — üstünde ince ayraçla; ana bilgiyle karışmasın diye ayrı bir kademe. */
function Footnote({ children }: { children: ReactNode }) {
  return <span className="border-t border-sand-100 pt-2.5 font-sans text-note leading-relaxed text-muted">{children}</span>;
}

function Dot({ done }: { done: boolean }) {
  return <span className={['size-3.5 flex-none rounded-full', done ? 'bg-olive' : 'border-2 border-sand-500 bg-card'].join(' ')} aria-hidden="true" />;
}
