import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { OrderService, ProductService, ProductVariantService, UserProfileService, serviceDb } from '@lezzet/database';
import { RATIO_SQUARE, resolveLocalizedText } from '@lezzet/types';
import { toCents } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import { imageOf } from '@/lib/storefront/map';
import { formatDeliveryDate, formatPrice, formatShortDate } from '@/lib/storefront/format';
import { routing } from '@/i18n/routing';
import { OrderWatch } from './components/order-watch';
import messages from './messages.json';

/**
 * Sipariş alındı sayfası (08.13) — ödeme dönüşünün ve kapıda ödemenin ortak varış noktası.
 *
 * **Yolda taşınan kimlik SİPARİŞ KİMLİĞİDİR, referans numarası değil.** Numara ancak sipariş
 * onaylanınca doğuyor (07.5); kapıda ödemede ve ödeme henüz onaylanmamışken ortada numara yok.
 * Sorgu dizesi de kullanılmadı — paylaşılan bir linkte sorgu kaybolur, yol kaybolmaz.
 *
 * **Sayfa YALAN SÖYLEMEZ.** Müşteri Stripe'tan döndüğünde ödeme onayı bize webhook'la gelir ve o
 * çağrı müşterinin tarayıcısından bağımsızdır — bazen ondan saniyeler sonra. Bu yüzden "Ödendi"
 * yazısı siparişin KENDİ durumundan okunur: taslaksa "onaylanıyor" denir, onaylandıysa "ödendi".
 * Dönüşü başarı saymak, iptal olmuş bir ödemede müşteriye ödendi demek olurdu. Beklerken ekran
 * asılı da kalmaz: `OrderWatch` zili duyunca sayfayı sunucudan yeniden ister.
 *
 * **Düzen tasarımın kendisi** (`Musteri - Checkout.dc.html` · "Sipariş Alındı"): kutlama bandı tam
 * genişlikte, altında 1.5/1 iki sütun — solda yan yana teslimat + ödeme kartı, altında YATAY zaman
 * çizgisi ve yardım şeridi; sağda görselli sipariş özeti. Önce hepsi tek sütuna dizilmişti ve sayfa
 * bir onay ekranından çok bir liste gibi okunuyordu (29.07 kullanıcı geri bildirimi).
 */
interface ConfirmationPageProps {
  params: Promise<{ locale: string; reference: string }>;
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);

  const db = serviceDb();
  const profile = user ? await new UserProfileService(db).findByAuthUserId(user.id) : null;
  const found = await new OrderService(db).getWithItems(reference);
  // Başkasının siparişi GÖRÜNMEZ: kimlik yoldan geliyor, sahiplik sunucuda doğrulanır.
  if (!found || !profile || found.order.customerId !== profile.id) notFound();

  const { order, items } = found;
  /**
   * Sipariş KESİNLEŞTİ mi (taslak değil, iptal değil). "Ödendi" ile aynı şey DEĞİL: ödeme ayrı bir
   * eksendir (DOMAIN §7) — kapıda ödenecek bir sipariş de kesinleşmiştir.
   */
  const placed = order.status !== 'draft' && order.status !== 'cancelled';
  const cancelled = order.status === 'cancelled';
  /**
   * "Ödemeniz onaylanıyor · bankanızdan onay bekliyoruz" YALNIZ kart ödemesinde doğru. Kapıda
   * ödemede beklenen bir banka yok; havalede de öyle — orada beklenen müşterinin transferi.
   */
  const awaitingCard = !placed && !cancelled && order.paymentMethod === 'online';

  /**
   * İndirim satırının adı. Kaynak SİPARİŞTEKİ KOPYADIR (`discount_label`), tanım değil: kampanya o
   * günden sonra yeniden adlandırılmış, süresi dolmuş ya da silinmiş olabilir — sipariş özeti geriye
   * dönük dil değiştirmemeli. Bu yüzden tanımı okumak için ayrıca DB'ye de gidilmez.
   *
   * **Oran YAZILMAZ** ve bu bir eksik değil: siparişte saklanan şey inen TUTARDIR, oran değil.
   * Sepette oran gösterilir çünkü orada karar ANLIK; siparişte karar geçmiştir.
   *
   * Ad verilmemişse satır genel adında kalır ("Remise"): kupon kodunu ya da türü burada tahmin etmek,
   * siparişte karşılığı olmayan bir bilgi uydurmak olurdu.
   */
  const discountName = order.discountLabel ? resolveLocalizedText(order.discountLabel, locale as Locale) : '';
  const discountLabel = discountName ? `${t.summary.discount} — ${discountName}` : t.summary.discount;

  // Kalem künyesi: sipariş varyant satırlarından oluşuyor, müşteri ürün adını ve görselini görmeli.
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((i) => i.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const lineByVariant = new Map(
    variants.map((variant) => {
      const product = products.find((p) => p.id === variant.productId);
      return [
        variant.id,
        {
          name: product ? resolveLocalizedText(product.name, locale as Locale) : '',
          unit: resolveLocalizedText(variant.label, locale as Locale),
          image: product ? imageOf(product) : null,
        },
      ];
    }),
  );

  // Adresin anlık görüntüsü jsonb; alanları isimle okunur (servis katmanı camelCase'e çevirir).
  const snapshot = order.addressSnapshot as { label?: string; line1?: string; line2?: string; postalCode?: string; city?: string } | null;

  const compact = device === 'mobile';
  const total = formatPrice(toCents(order.total), locale as Locale);
  const day = order.deliveryDate ? formatDeliveryDate(order.deliveryDate, locale as Locale) : null;
  const onRoute = order.deliveryType === 'route';
  const placedTime = new Date(order.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const steps = [
    { label: t.timeline.placed, when: t.timeline.placedAt.replace('{time}', placedTime), done: true },
    { label: t.timeline.preparing, when: day ? t.timeline.preparingAt : null, done: false },
    { label: t.timeline.onTheWay, when: day ? t.timeline.onTheWayAt.replace('{date}', day) : null, done: false },
    { label: t.timeline.delivered, when: day ? t.timeline.deliveredAt.replace('{date}', day) : null, done: false },
  ];

  const shell = ['mx-auto w-full max-w-[1360px]', compact ? 'px-4' : 'px-12'].join(' ');

  return (
    <SiteFrame device={device} locale={locale}>
      {/* Ödeme beklerken sayfa canlıdır: webhook düşünce kendini yeniler (çizmez, yalnız dinler). */}
      {awaitingCard && <OrderWatch orderId={order.id} />}

      {/**
       * KUTLAMA BANDI tam genişlikte ve ortalı — sayfanın ilk söylediği şey "oldu"dur. Zemin duruma
       * göre değişir; tasarımın notu da bunu diyor: onay ekranı yalnız üst bloğu ve ödeme kartını
       * değiştirir, iskeleti hiç değiştirmez.
       */}
      <section
        className={[
          'border-b',
          cancelled ? 'border-terracotta-line bg-terracotta-bg' : placed ? 'border-olive-line bg-olive-bg' : 'border-honey-line bg-honey-bg',
        ].join(' ')}
      >
        <div className={[shell, 'flex flex-col items-center gap-2.5 text-center', compact ? 'py-7' : 'py-11'].join(' ')}>
          <span
            className={[
              'grid flex-none place-items-center rounded-full text-card-title text-card',
              compact ? 'size-[46px]' : 'size-[58px]',
              cancelled ? 'bg-terracotta-bright' : placed ? 'bg-olive' : 'bg-honey',
            ].join(' ')}
            aria-hidden="true"
          >
            {cancelled ? '!' : placed ? '✓' : '⏳'}
          </span>

          {/* `leading-tight`: tip token'larımız yalnız punto taşıyor, satır yüksekliğini preflight'ın
              1.5'inden miras alıyor — 38px başlık 57px'lik bir satır kutusuna oturunca çember ile
              başlık arası tasarımın iki katı açılıyordu (aynı tuzak `controlClass`'ta da yaşandı). */}
          <h1 className={['font-serif leading-tight text-ink', compact ? 'text-page-title-sm' : 'text-page-title'].join(' ')}>
            {cancelled
              ? t.failed
              : placed
                ? profile.name
                  ? t.title.replace('{name}', profile.name.split(' ')[0] ?? '')
                  : t.titleAnon
                : awaitingCard
                  ? t.pending
                  : t.incomplete}
          </h1>

          <p className="max-w-[620px] font-sans text-body leading-relaxed text-body">
            {cancelled ? (
              t.failedBody
            ) : placed ? (
              // E-posta KALIN (tasarım): cümlenin içinde müşterinin gözünün aradığı tek şey kendi
              // adresidir — doğru yere gitti mi diye bakar. Düz metinde kayboluyordu.
              <Mailed template={t.mailed} email={profile.email ?? ''} />
            ) : awaitingCard ? (
              t.pendingBody
            ) : (
              t.incompleteBody
            )}
          </p>

          {/* Künye HAP olarak: numara ve saat okunacak iki ayrı bilgi, tek satıra dizilmiş gri bir
              künye değil. Numara yoksa (sipariş henüz kesinleşmedi) hap hiç çizilmez. */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
            {order.referenceNo && (
              <span className="rounded-pill border border-sand-400 bg-card px-4 py-2 font-sans text-body-sm font-bold text-ink">
                {t.orderNo.replace('{reference}', order.referenceNo)}
              </span>
            )}
            {/* Gün VE saat (tasarım: "22 Temmuz, 14:38"): siparişin ne zaman verildiği aynı gün
                içinde iki kez alışveriş yapan müşteri için yalnız günle ayırt edilemiyor. */}
            <span className="rounded-pill border border-sand-400 bg-card px-4 py-2 font-sans text-body-sm font-semibold text-body">
              {formatShortDate(order.createdAt, locale as Locale)}, {placedTime}
            </span>
          </div>
        </div>
      </section>

      <div className={[shell, compact ? 'flex flex-col gap-3 py-4' : 'grid grid-cols-[1.5fr_1fr] items-start gap-10 py-9'].join(' ')}>
        <div className={['flex flex-col', compact ? 'gap-3' : 'gap-5.5'].join(' ')}>
          {/* Teslimat ve ödeme YAN YANA: ikisi de "sipariş ne oldu" sorusunun yarısı, alt alta
              dizildiklerinde biri diğerinin altında kalıp gözden kaçıyordu. */}
          <div className={compact ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4.5'}>
            <Card compact={compact}>
              <Eyebrow>{t.delivery.title}</Eyebrow>
              <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
                {day ?? t.delivery.shipping}
              </span>
              <Chip>{onRoute ? t.delivery.route : `📦 ${t.delivery.shipping}`}</Chip>
              {/* Nereye gittiği ANLIK GÖRÜNTÜDEN okunur, adres tablosundan değil: müşteri adresini
                  sonradan düzenlerse bu sipariş nereye gittiğini unutmamalı (07). */}
              {snapshot && (
                <span className="font-sans text-body-sm leading-relaxed text-body">
                  {snapshot.label ? `${snapshot.label} · ` : ''}
                  {snapshot.line1}
                  {snapshot.line2 ? `, ${snapshot.line2}` : ''}
                  <br />
                  {snapshot.postalCode} {snapshot.city}
                </span>
              )}
              <Footnote>{onRoute ? t.delivery.coldChain : t.delivery.shippingNote}</Footnote>
            </Card>

            <Card compact={compact}>
              <Eyebrow>{t.payment.title}</Eyebrow>
              <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
                {order.onAccount
                  ? t.payment.onAccount.replace('{amount}', total)
                  : order.paymentMethod === 'online'
                    ? (placed ? t.payment.paid : t.pending).replace('{amount}', total)
                    : t.payment.due.replace('{amount}', total)}
              </span>
              <Chip>{order.onAccount ? t.payment.credit : order.paymentMethod === 'online' ? t.payment.online : t.payment.cod}</Chip>
              {/* Kart künyesi: son dört hane ödeme sağlayıcısından çekilecek (12) — bugün
                  saklamıyoruz, uydurma rakam yazmaktansa yalnız aracı söyleriz. */}
              {order.paymentMethod === 'online' && placed && <span className="font-sans text-body-sm text-body">{t.payment.card}</span>}
              <Footnote>{t.payment.invoiceSoon}</Footnote>
              {/* BEKLEYEN(12.1): fatura PDF üretimi — bağlantı tasarımda var, yerinde durur ve neden
                  basılamadığını söyler; silmek tasarımın bu satırını kaybetmek olurdu. */}
              <span className="font-sans text-note font-bold text-muted">
                {t.payment.invoice} · {t.soon}
              </span>
            </Card>
          </div>

          <Card compact={compact}>
            <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.timeline.title}</span>
            {/**
             * Zaman çizgisi masaüstünde YATAY: dört adım bir yolculuktur ve yolculuk soldan sağa
             * okunur; alt alta dizildiğinde bir yapılacaklar listesine benziyordu. Mobilde dikey —
             * dar ekranda yatay dizilim adım adlarını okunmaz hale getirir (Sapma 3).
             */}
            {compact ? (
              <ol className="flex flex-col gap-2.5">
                {steps.map((step) => (
                  <li key={step.label} className="flex items-center gap-2.5">
                    <Dot done={step.done} />
                    <span className={['flex-1 font-sans text-note', step.done ? 'font-bold text-ink' : 'text-muted'].join(' ')}>
                      {step.label}
                    </span>
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
                        sonraki noktaya ulaşamazdı. Tasarımın örnek künyeleri kısa ("Çarşamba
                        mutfakta"); gerçek metinler uzayınca komşu sütuna yapışıyordu. */}
                    <span className={['pr-5 font-sans text-body-sm', step.done ? 'font-bold text-ink' : 'font-bold text-muted'].join(' ')}>
                      {step.label}
                    </span>
                    {step.when && <span className="pr-5 font-sans text-micro leading-relaxed text-muted">{step.when}</span>}
                  </li>
                ))}
              </ol>
            )}
            <Footnote>{t.timeline.note}</Footnote>
          </Card>

          {/* Yardım şeridi: kart değil BANT — "bir sorunuz mu var" siparişin bir parçası değil,
              sayfanın altındaki açık kapı.
              BEKLEYEN(15.1): WhatsApp yazışma bağlantısı — düğme yerinde, kanal yok. */}
          <div
            className={[
              'flex items-center gap-4 rounded-card bg-cream-deep',
              compact ? 'px-4 py-3.5' : 'px-6.5 py-5',
            ].join(' ')}
          >
            <span className="text-icon" aria-hidden="true">
              💬
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="font-sans text-body-sm font-bold text-ink">{t.help.title}</span>
              <span className="font-sans text-note leading-relaxed text-body">{t.help.body}</span>
            </div>
            {!compact && (
              <Button variant="secondary" size="sm" disabled className="flex-none">
                {t.help.cta} · {t.soon}
              </Button>
            )}
          </div>
        </div>

        {/* Özet masaüstünde YAPIŞIK: uzun sayfada aşağı inerken ne sipariş ettiği ve ne ödediği
            gözden kaybolmamalı. */}
        <div className={compact ? '' : 'sticky top-5'}>
          <Card compact={compact}>
            <span className={['font-serif leading-tight text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{t.summary.title}</span>

            <ul className="flex flex-col gap-2.5">
              {items.map((item) => {
                const line = lineByVariant.get(item.variantId);
                return (
                  <li key={item.id} className="flex items-center gap-3">
                    {/* Görsel 44px kare: müşteri adı okumadan da ne aldığını tanır. */}
                    <div className="w-11 flex-none">
                      <FramedImage src={line?.image?.url ?? null} alt={line?.name ?? ''} ratio={RATIO_SQUARE} crop={line?.image?.crop} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-sans text-note font-bold text-ink">{line?.name}</span>
                      <span className="font-sans text-micro text-muted">
                        {line?.unit ? `${line.unit} × ${item.qty}` : `× ${item.qty}`}
                      </span>
                    </div>
                    <span className="flex-none font-sans text-body-sm font-bold text-ink">
                      {formatPrice(toCents(item.unitPrice) * item.qty, locale as Locale)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-1.5 border-t border-sand-200 pt-2.5">
              {order.discountAmount > 0 && (
                <SummaryRow
                  // Kod tasarımda birebir yazılı ("İndirim — HOSGELDIN10"); kodsuz indirimde sebep
                  // türden gelir (bkz. yukarıdaki `discountLabel`).
                  label={discountLabel}
                  value={`−${formatPrice(toCents(order.discountAmount), locale as Locale)}`}
                  tone="olive"
                />
              )}
              <SummaryRow
                label={t.summary.delivery}
                value={order.shippingFee > 0 ? formatPrice(toCents(order.shippingFee), locale as Locale) : t.summary.free}
                tone={order.shippingFee > 0 ? 'ink' : 'olive'}
              />
              <div className="flex items-baseline justify-between gap-3 border-t border-sand-200 pt-2.5">
                <span className="font-sans text-lead font-bold text-ink">{t.summary.total}</span>
                <span className="font-sans text-lead font-bold text-ink">{total}</span>
              </div>
              <span className="font-sans text-micro text-muted">{t.summary.vatIncluded}</span>
            </div>

            {cancelled ? (
              <Link href="/cart" className={buttonClass({ size: 'md', fullWidth: true })}>
                {t.retry}
              </Link>
            ) : (
              /**
               * Sipariş takip sayfası ARTIK VAR (08.5, 30.07) — burada bir dönem devre dışı bir
               * düğme duruyordu (`BEKLEYEN(08.5)`: "bağ verilseydi 404'e düşerdi") ve o gün doğruydu.
               * Detay sayfası inince işaret arandı ve bağ verildi.
               *
               * Aynı ders bu oturumda iki kez daha yaşandı (sepetin "Ödemeye geç"i, başlığın
               * "Hesabım"ı): **bir `BEKLEYEN`'i doğuran engeli kaldıran commit, işaretin kendisini de
               * aramak zorundadır** — `docs:check` işaretin bir kayda bağlı olduğunu doğrular, kaydın
               * hâlâ geçerli olduğunu doğrulayamaz.
               *
               * Yolda taşınan kimlik sipariş kimliğidir (sayfanın üst künyesi): numara ancak onayla
               * doğuyor, detay okuması da kimlikle çalışıyor.
               */
              <Link
                href={{ pathname: '/orders/[reference]', params: { reference: order.id } }}
                className={buttonClass({ size: 'md', fullWidth: true })}
              >
                {t.track}
              </Link>
            )}
            <Link href="/catalog" className={buttonClass({ variant: 'secondary', size: 'md', fullWidth: true })}>
              {t.continue}
            </Link>
          </Card>
        </div>
      </div>
    </SiteFrame>
  );
}

/**
 * "Onay e-postasını **X** adresine gönderdik" — adres KALIN.
 *
 * Metin çeviri dosyasından tek parça geliyor ve kalınlığı oraya HTML olarak gömmedik: çeviri
 * dosyasına işaretleme girdiği an üç dil birbirinden kayar ve metin artık düz metin olmaktan çıkar.
 * Bölme burada, tek yerde yapılır.
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

/** Onay ekranının tek kart kabuğu — üç yerde aynı çerçeve, üç kez yazılmasın diye. */
function Card({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return (
    <section className={['flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-6.5 py-5.5'].join(' ')}>
      {children}
    </section>
  );
}

/** Üstbaşlık: kartın NE olduğunu söyler, içeriğin kendisi başlığı tekrar etmez. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-sans text-eyebrow uppercase text-muted">{children}</span>;
}

/** Durum hapı — teslimat yolu / ödeme aracı. Renk hep zeytin: ikisi de olumlu bir olgu bildirir. */
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="w-max rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-note font-semibold text-olive">{children}</span>;
}

/** Kartın alt notu — üstünde ince ayraçla; ana bilgiyle karışmasın diye ayrı bir kademe. */
function Footnote({ children }: { children: React.ReactNode }) {
  return <span className="border-t border-sand-100 pt-2.5 font-sans text-note leading-relaxed text-muted">{children}</span>;
}

function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={['size-3.5 flex-none rounded-full', done ? 'bg-olive' : 'border-2 border-sand-500 bg-card'].join(' ')}
      aria-hidden="true"
    />
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'olive' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={['font-sans text-body-sm', tone === 'olive' ? 'text-olive' : 'text-body'].join(' ')}>{label}</span>
      <span className={['font-sans text-body-sm font-bold', tone === 'olive' ? 'text-olive' : 'text-ink'].join(' ')}>{value}</span>
    </div>
  );
}
