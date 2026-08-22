'use client';

import { useState, type ReactNode } from 'react';
import { whatsappHref } from '@lezzet/brand';
import { RATIO_SQUARE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { SummaryRow, summaryCopy } from '@/components/customer/ui/summary-row';
import { Link } from '@/i18n/navigation';
import { formatDeliveryDate, formatPrice, formatShortDate, formatTime } from '@/lib/storefront/format';
import { isRefundedCancellation, type ConfirmationViewProps } from '../confirmation-types';

/**
 * Sipariş alındı ekranının blokları (tasarım: `Musteri - Checkout.dc.html` · "Sipariş Alındı").
 *
 * Masaüstü ve mobil AYNI parçaları kullanır ama **aynı düzeni kullanmaz** — masaüstünde 1.5/1 iki
 * sütun, mobilde tek sütun; zaman çizgisi orada yatay, burada dikey. Bu yüzden parça bazında ortak,
 * diziliş bazında ayrı (`orders/[reference]` ile birebir aynı desen).
 *
 * `compact` bloklara PROP olarak iner, dalların içinde ikinci kez türetilmez: bir bloğun mobil hâli
 * onu çağıran dosyanın değil, bloğun kendi kararıdır.
 */

/* ————————————————————————————— Kutlama bandı ————————————————————————————— */

/**
 * Sayfanın ilk söylediği şey "oldu"dur: tam genişlikte, ortalı bant. Zemin duruma göre değişir —
 * tasarımın notu da bunu diyor: onay ekranı yalnız üst bloğu ve ödeme kartını değiştirir,
 * iskeletini hiç değiştirmez.
 */
export function CelebrationBand({ t, locale, view, compact }: ConfirmationViewProps) {
  const placedTime = formatTime(view.createdAt, locale);
  return (
    <section
      className={[
        'border-b',
        view.cancelled ? 'border-terracotta-line bg-terracotta-bg' : view.placed ? 'border-olive-line bg-olive-bg' : 'border-honey-line bg-honey-bg',
      ].join(' ')}
    >
      <div className={[shellClass(compact), 'flex flex-col items-center gap-2.5 text-center', compact ? 'py-7' : 'py-11'].join(' ')}>
        <span
          className={[
            'grid flex-none place-items-center rounded-full text-card-title text-card',
            compact ? 'size-[46px]' : 'size-[58px]',
            view.cancelled ? 'bg-terracotta-bright' : view.placed ? 'bg-olive' : 'bg-honey',
          ].join(' ')}
          aria-hidden="true"
        >
          {view.cancelled ? '!' : view.placed ? '✓' : '⏳'}
        </span>

        {/* `leading-tight`: tip token'larımız yalnız punto taşıyor, satır yüksekliğini preflight'ın
            1.5'inden miras alıyor — 38px başlık 57px'lik bir satır kutusuna oturunca çember ile
            başlık arası tasarımın iki katı açılıyordu (aynı tuzak `controlClass`'ta da yaşandı). */}
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
                ? t.pending
                : t.incomplete}
        </h1>

        <p className="max-w-[620px] font-sans text-body leading-relaxed text-body">
          {view.cancelled ? (
            // İptalde İKİ ayrı cümle (07.14): parası iade edilmişe "tahsilat yapılmadı" demek,
            // ekstresinde eksik para gören müşteriye söylenebilecek en pahalı yalandı.
            isRefundedCancellation(view) ? t.refundedBody : t.failedBody
          ) : view.placed ? (
            // E-posta KALIN (tasarım): cümlenin içinde müşterinin gözünün aradığı tek şey kendi
            // adresidir — doğru yere gitti mi diye bakar. Düz metinde kayboluyordu.
            <Mailed template={t.mailed} email={view.customerEmail} />
          ) : view.awaitingCard ? (
            t.pendingBody
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
      <Chip>{view.onRoute ? shared.delivery.route : `📦 ${shared.delivery.shipping}`}</Chip>
      {view.address && (
        <span className="font-sans text-body-sm leading-relaxed text-body">
          {view.address.label ? `${view.address.label} · ` : ''}
          {view.address.line1}
          {view.address.line2 ? `, ${view.address.line2}` : ''}
          <br />
          {view.address.postalCode} {view.address.city}
        </span>
      )}
      <Footnote>{view.onRoute ? t.delivery.coldChain : t.delivery.shippingNote}</Footnote>
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
      {/**
       * **FATURA DEĞİL, TESLİMAT ÖZETİ (02.08 · kullanıcı kararı).** Burada "Faturayı indir"
       * yazıyordu ve altında "fatura hazır olduğunda e-postanıza eklenecek" deniyordu — ikisi de
       * tutulmayacak sözdü: sistem fatura KESMİYOR ve kesmeyecek (fatura dışarıdaki muhasebede
       * doğuyor, biz yalnız numarasını kendi referansımızla eşleştiriyoruz). Müşteriye verdiğimiz
       * tek belge teslimat özeti.
       *
       * Zamanı da "yakında" değil: belge kutu HAZIRLANDIKTAN sonra doğuyor, çünkü işi eksik konan
       * bir şey varsa onu göstermek.
       */}
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
 * Yardım şeridi: kart değil BANT — "bir sorunuz mu var" siparişin bir parçası değil, sayfanın
 * altındaki açık kapı. Düğme mobilde çizilmiyor (tasarım): dar ekranda bant zaten tek satır.
 *
 * **Kanal bağlandı (15.3):** düğme artık gerçek bir `wa.me` bağı ve metin SİPARİŞE ÖZGÜ — müşteri
 * WhatsApp'ı referans numarası yazılı hâlde açıyor. Bu, bandın kendi cümlesinin ("sipariş
 * numaranızla yazın") gereğini müşteriye yaptırmak yerine BİZİM yapmamız: numarayı hatırlamak,
 * kopyalamak ve doğru yazmak operatörün değil müşterinin sırtındaydı ve orada sık sık düşerdi.
 *
 * Referans TASLAKTA `null` olabilir (`ConfirmationView` künyesi: numara ilk kalıcı durumda doğar) —
 * o hâlde numarasız metin gider. Yuvası boş bir cümle ("siparişim {reference} hakkında") göndermek,
 * operatöre anlamsız bir mesaj düşürürdü.
 */
export function HelpBand({
  t,
  compact,
  referenceNo,
}: Pick<ConfirmationViewProps, 't' | 'compact'> & { referenceNo: string | null }) {
  const href = whatsappHref(referenceNo ? t.help.prefill.replace('{reference}', referenceNo) : t.help.prefillPlain);
  return (
    <div className={['flex items-center gap-4 rounded-card bg-cream-deep', compact ? 'px-4 py-3.5' : 'px-6.5 py-5'].join(' ')}>
      <span className="text-icon" aria-hidden="true">
        💬
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-sans text-body-sm font-bold text-ink">{t.help.title}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.help.body}</span>
      </div>
      {/* `target="_blank"` + `rel`: WhatsApp Web yeni sekmede açılır, mobil cihazda uygulamaya
          devredilir. Sipariş sayfası ARKADA KALIR — müşteri yazışmadan dönünce siparişini
          kaybetmemeli. */}
      {!compact && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-none' })}
        >
          {t.help.cta}
        </a>
      )}
    </div>
  );
}

/**
 * **Komşunu bu sefere çağır** (17.10) — yardım şeridinin KARDEŞİ, aynı görsel gramer.
 *
 * Kendi düzenini kurmuyor ve bu bilinçli (CLAUDE §3 — improvise etme): şerit `HelpBand`in kutusunu,
 * boşluklarını ve tipografisini birebir kullanıyor. Yeni bir blok dili icat etmek, tasarımı
 * görmeden verilmiş görsel bir karar olurdu; var olan gramerde kalmak ise yalnız içerik ekliyor.
 * Nihai görsel karar Claude Design'da verilecek (`design/pages/musteri-checkout.md`'ye brief yazıldı).
 *
 * **Bağlantı yoksa blok HİÇ çizilmez** (`neighborInviteUrl === null`): kargo siparişi, taslak ya da
 * kesim saati dolmuş sefer. Boş bir şerit "burada bir şey vardı ama çalışmıyor" der.
 *
 * Kopyalama `coupons-card`taki desenin aynısı: başarısızlık sessiz ama SONUÇSUZ değil — adres zaten
 * ekranda seçilebilir hâlde duruyor, hata cümlesi açmak müşterinin hâlâ yapabildiği bir işi arıza
 * gibi gösterirdi. Sistem paylaşım menüsü (`navigator.share`) varsa o açılır: davet WhatsApp'a
 * gidiyor ve uygulama sırasını işletim sistemi bizden iyi biliyor (`ShareButton` künyesi).
 */
export function NeighborBand({ t, compact, view }: Pick<ConfirmationViewProps, 't' | 'compact' | 'view'>) {
  const [copied, setCopied] = useState(false);
  const url = view.neighborInviteUrl;
  if (!url) return null;

  const share = async () => {
    if (navigator.share) {
      // İptal hata değildir: vazgeçen müşteriye uyarı çıkmamalı.
      await navigator.share({ url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={['flex items-center gap-4 rounded-card bg-cream-deep', compact ? 'px-4 py-3.5' : 'px-6.5 py-5'].join(' ')}>
      <span className="text-icon" aria-hidden="true">
        🚚
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-sans text-body-sm font-bold text-ink">{t.neighbor.title}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.neighbor.body}</span>
      </div>
      {/* Mobilde de çizilir — yardım şeridinden farkı bu: orada düğme bir "yakında"dır (tasarım),
          burada bloğun TEK işlevi paylaşmak; düğmesiz bir davet şeridi hiçbir şey yapmaz. */}
      <Button variant="secondary" size="sm" className="flex-none" onClick={() => void share()}>
        {copied ? t.neighbor.copied : t.neighbor.cta}
      </Button>
    </div>
  );
}

/** Ne alındı, ne ödendi + iki çıkış (takip / katalog). */
export function SummaryCard({ t, locale, view, compact }: ConfirmationViewProps) {
  const total = formatPrice(view.totalCents, locale);
  // Özetin ORTAK sözcükleri (08.20): artık checkout'un sözlüğünden değil, bloğu ÇİZEN komponentin
  // yanındaki nötr sözlükten. Aile bağı doğruydu ama aynı blok sipariş detayında da var ve o
  // checkout ailesinin dışında — kelimeler bir aileye değil, bloğa ait.
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
              <FramedImage src={line.image?.url ?? null} alt={line.name} ratio={RATIO_SQUARE} crop={line.image?.crop} />
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

      {view.cancelled ? (
        <Link href="/cart" className={buttonClass({ size: 'md', compact, fullWidth: true })}>
          {t.retry}
        </Link>
      ) : (
        /**
         * Sipariş takip sayfası ARTIK VAR (08.5, 30.07) — burada bir dönem devre dışı bir düğme
         * duruyordu (`BEKLEYEN(08.5)`: "bağ verilseydi 404'e düşerdi") ve o gün doğruydu. Detay
         * sayfası inince işaret arandı ve bağ verildi.
         *
         * Yolda taşınan kimlik sipariş kimliğidir: numara ancak onayla doğuyor, detay okuması da
         * kimlikle çalışıyor.
         */
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
  return <span className="w-max rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-note font-semibold text-olive">{children}</span>;
}

/** Kartın alt notu — üstünde ince ayraçla; ana bilgiyle karışmasın diye ayrı bir kademe. */
function Footnote({ children }: { children: ReactNode }) {
  return <span className="border-t border-sand-100 pt-2.5 font-sans text-note leading-relaxed text-muted">{children}</span>;
}

function Dot({ done }: { done: boolean }) {
  return <span className={['size-3.5 flex-none rounded-full', done ? 'bg-olive' : 'border-2 border-sand-500 bg-card'].join(' ')} aria-hidden="true" />;
}
