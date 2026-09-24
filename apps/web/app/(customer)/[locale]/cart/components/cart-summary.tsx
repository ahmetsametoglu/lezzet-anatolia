'use client';

import type { Locale } from '@lezzet/i18n';
import { resolveLocalizedText } from '@lezzet/types';
import { buttonClass } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
import { summaryCopy } from '@/components/customer/ui/summary-row';
import { useAccount } from '@/components/customer/account/account-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { cartBlockReason, cartPayableCents, shippingGroupFee, type CartView } from '@/lib/cart/cart-types';
import { discountLabel } from '@/lib/cart/discount-label';
import type { Messages } from '../cart-types';

/**
 * Sepet özeti: tutar satırları ve masaüstünde checkout düğmesi; mobilde düğme ekranın altındaki çubuktadır. İndirim tutarı yeniden
 * hesaplanmaz, `ara toplam − toplam` olarak okunur, çünkü kararı motor verir ve ekranın ikinci hesabı bir gün ayrışırdı.
 */

/**
 * Engelin cümlesi; hangi engelin önce geldiğini `cartBlockReason` söyler. `switch`te `default` bilerek yok: yeni bir sebep eklenince
 * derleme durur ve cümlesi yazılmadan geçilemez.
 */
export function checkoutBlockReason(view: CartView, t: Messages, locale: Locale): string | null {
  switch (cartBlockReason(view)) {
    case 'undeliverable_line':
      return t.checkoutBlocked;
    case 'min_basket':
      return t.minBasket
        .replace('{min}', formatPrice(view.minBasketCents, locale))
        .replace('{missing}', formatPrice(view.missingForMinBasketCents, locale));
    case null:
      return null;
  }
}

/**
 * Ödemeye geçmenin kapısı: giriş yapılmış ve teslimat adresi seçilmiş olmalı. Özet kartı, mobil çubuk ve grup eylemleri aynı kancayı
 * okur ki biri kapıyı unutup müşteriyi ödeme sayfasından geri yollamasın.
 */
export function useCheckoutGate(t: Messages): string | null {
  const account = useAccount();
  const { address, unresolved } = useDeliveryPlace();
  if (!account) return t.gate.login;
  if (!address) return t.gate.address;
  // Karşılanamayan adres siparişin onayında reddedilir; müşteri bütün adımları geçmeden sebebi burada görür.
  if (unresolved) return t.gate.unreachable;
  return null;
}

/**
 * Ücretsiz kargo ilerlemesi yalnız yol bilinmiyorken çizilir: yol bilinince eşik yalnız kargo grubuna bakar ve aynı cümle grubun
 * kendi bloğunda yazılıdır. Eşik tanımsızsa (0) blok çizilmez.
 */
function FreeShippingProgress({ view, t, locale }: { view: CartView; t: Messages; locale: Locale }) {
  const { unresolved } = useDeliveryPlace();
  if (view.freeShippingCents <= 0) return null;
  if (view.lines.some((l) => l.route !== null)) return null;
  // Karşılanamayan adrese kargo da çıkmaz; "X € ekleyin" boş bir söz olurdu.
  if (unresolved) return null;

  const reached = view.subtotalCents >= view.freeShippingCents;
  const percent = reached ? 100 : Math.round((view.subtotalCents / view.freeShippingCents) * 100);
  const remaining = Math.max(0, view.freeShippingCents - view.subtotalCents);

  return (
    <div className="flex flex-col gap-1.5 rounded-soft bg-olive-bg px-3.5 py-2.5">
      <span className="font-sans text-note font-semibold text-olive">
        {reached ? t.freeShipping.reached : t.freeShipping.remaining.replace('{amount}', formatPrice(remaining, locale))}
      </span>
      <div className="h-1.5 overflow-hidden rounded-pill bg-olive-line">
        <div className="h-full rounded-pill bg-olive transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

interface CartSummaryProps {
  view: CartView;
  t: Messages;
  locale: Locale;
  /** Mobil: başlık ve aksiyon düşer, yalnız tutar satırları kalır. */
  compact?: boolean;
  /**
   * Sepet iki gruba bölündüyse düğme buradan düşer: her grup kendi eylemiyle durur ve buradaki düğme sepetin tamamını ödetecekmiş gibi
   * okunurdu. Kart yine kalır, çünkü sepetin toplamı ve indirimi bir yerde toplu görünmeli.
   */
  grouped?: boolean;
}

export function CartSummary({ view, t, locale, compact = false, grouped = false }: CartSummaryProps) {
  // Sepetin engeli önce, kimlik/adres kapısı sonra: tükenen kalem varken "giriş yapın" demek müşteriyi giriş yaptıktan sonra ikinci
  // bir duvara çarptırırdı.
  const gate = useCheckoutGate(t);
  const reason = checkoutBlockReason(view, t, locale) ?? gate;
  const blocked = reason !== null;
  // Özetin ortak sözcükleri (toplam, KDV notu, indirim) ödeme sayfasıyla aynı kaynaktan gelir.
  const summary = summaryCopy(locale);
  // İndirim tutarı türetilir, yeniden hesaplanmaz — kararın sahibi motor, yazan sunucu.
  const discountCents = view.subtotalCents - view.totalCents;
  // Sepetin tamamı kargodaysa tek sipariş doğar ve kargo ücreti bellidir; saklamak müşteriyi kasada sürprizle karşılardı.
  const fee = view.shippingOnly ? shippingGroupFee(view) : null;
  /* Sepetin tamamı kapıya gidiyorsa teslimat ücretsizdir; karışık sepette her grup kendi bloğunda konuşur, yol bilinmiyorken söz
     yok. */
  const routeOnly = !grouped && view.lines.length > 0 && view.lines.every((l) => l.route === 'local');
  // Toplam ortak fonksiyondan, çünkü aynı sayıyı mobil çubuk ve başlıktaki hap da yazar.
  const totalCents = cartPayableCents(view);
  /* Cümle SUNUCUNUN kararından kurulur, ekran eşik aritmetiği yapmaz: hangi kampanyanın
     kazanılabilir olduğu ve eşiğe varıldığında ne ineceği motorda hesaplanıyor
     (`findReachableDiscount`). Burada yalnız üç sayı yerine konuyor — iki yüzey de aynı kapıdan
     okuduğu için native'le ayrışamaz. */
  const reach = view.reachableDiscount;
  const reachableNote =
    reach === null
      ? null
      : (reach.label === null ? t.reachableAnon : t.reachable.replace('{label}', resolveLocalizedText(reach.label, locale)))
          .replace('{missing}', formatPrice(reach.missingCents, locale))
          .replace('{amount}', formatPrice(reach.projectedCents, locale));
  return (
    /* Ölçüler tasarımdan (`Musteri - Sepet.dc.html:104` web · `:399` mobil): web `22×24` + `gap 12`, mobil `14` + `gap 7`. */
    <div className={cardClass({ compact, pad: 'snug', compactPad: 'sm', gap: compact ? 'xs' : 'md' })}>
      {!compact && <h2 className="font-serif text-h2-sm text-ink">{grouped ? t.group.summaryScope : t.summary}</h2>}

      {/* Tutar satırları tek blokta ve dar (8px): kartın 12px'lik aralığı satırlara uygulansa KDV notu toplamdan koparıp ayrı bir
          cümleye dönüşürdü. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between font-sans text-body-sm">
          <span className="text-body">{t.subtotal}</span>
          <span className="font-bold text-ink">{formatPrice(view.subtotalCents, locale)}</span>
        </div>

        {discountCents > 0 && (
          <div className="flex items-center justify-between font-sans text-body-sm text-olive">
            {/* Satır indirimin nedenini söyler: kampanyanın görünen adı, yoksa kupon kodu ya da türü. Cümleyi ortak yardımcı kurar ki
                ödeme sayfası aynı indirimi başka türlü anlatmasın. */}
            <span>{discountLabel(view.discount, summary, locale)}</span>
            <span className="font-bold">−{formatPrice(discountCents, locale)}</span>
          </div>
        )}

        {/* İndirimler birleşmez; kural indirim satırının hemen altında durur ki "neden tek indirim" sorusu sorulduğu yerde cevaplansın. */}
        {discountCents > 0 && <span className="font-sans text-micro leading-relaxed text-muted">{t.singleRule}</span>}

        {/* ELİNİN ALTINDAKİ İNDİRİM — zeytin, çünkü kazanç davetidir; ücretsiz kargo eşiğinin
            cümlesiyle aynı aile. Sunucu yalnız KAZANILABİLİR olanı gönderir (eşiğe varmak bugünkü
            indirimi büyütmüyorsa alan `null`), yani buradaki cümle her zaman tutulabilir bir sözdür. */}
        {reachableNote !== null && <span className="font-sans text-note leading-relaxed text-olive">{reachableNote}</span>}

        {fee !== null && (
          <div className="flex items-center justify-between font-sans text-body-sm">
            <span className="text-body">{t.group.shippingRow}</span>
            {/* Ücretsizken tutar sütununa tek kelime yazılır, çünkü kutlama cümlesi sağa yaslı hücreyi bozar. Zeytin ton yalnız
                ücretsizken, yoksa masraf kazanç gibi okunurdu. */}
            {fee.feeCents > 0 ? (
              <span className="font-bold text-ink">{formatPrice(fee.feeCents, locale)}</span>
            ) : (
              <span className="font-bold text-olive">{t.group.free}</span>
            )}
          </div>
        )}

        {routeOnly && (
          <div className="flex items-center justify-between font-sans text-body-sm">
            <span className="text-body">{t.deliveryRow}</span>
            <span className="font-bold text-olive">{t.group.free}</span>
          </div>
        )}

        <div
          className={[
            'flex items-center justify-between border-t border-sand-200 font-sans font-bold text-ink',
            compact ? 'pt-2 text-copy' : 'pt-2.5 text-card-title-sm',
          ].join(' ')}
        >
          <span>{summary.total}</span>
          <span>{formatPrice(totalCents, locale)}</span>
        </div>
        <span className="font-sans text-micro text-muted">{summary.vatIncluded}</span>
        {/* İki gruplu sepette indirim bir siparişe DEĞİL, iki siparişe dağılacak. Kupon/kampanya
            her siparişin kendi kalemlerine göre checkout'ta yeniden çözülüyor; burada tek bir
            sayı yazıp "bunu ödeyeceksiniz" demek, tutulmayacak bir söz olurdu. */}
        {grouped && discountCents > 0 && <span className="font-sans text-micro leading-relaxed text-muted">{t.group.discountSplit}</span>}
      </div>

      <FreeShippingProgress view={view} t={t} locale={locale} />

      {/* Asgari sepet BİLGİ kutusudur, hata değil: müşteri yanlış bir şey yapmadı, eşiğe henüz
          varmadı. Bal tonu (bekleyen durum) doğru aile; terracotta onu suçlu gösterirdi. */}
      {!view.minBasketOk && !view.hasBlocked && (
        <div className="rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-note font-semibold text-honey">
          {checkoutBlockReason(view, t, locale)}
        </div>
      )}

      {/* Kapının cümlesi düğmenin ÜSTÜNDE ve bal tonunda: müşteri hata yapmadı, bir adım eksik —
          ve o adım hemen üstteki kartta (`CartIdentity`). Sepet engeli varken çizilmez: o
          hâlde düğmenin altındaki kırmızı satır zaten konuşuyor. */}
      {!compact && !grouped && gate !== null && checkoutBlockReason(view, t, locale) === null && (
        <div className="rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-note font-semibold text-honey">{gate}</div>
      )}

      {!compact && !grouped && (
        <>
          {/* Düğme yalnız gerçek bir engel varken pasifleşir; `disabled` bir `<a>` olmadığı için iki dal ayrı çizilir. */}
          {blocked ? (
            <button
              type="button"
              disabled
              title={reason ?? undefined}
              className={buttonClass({ variant: 'primary', size: 'md', compact, fullWidth: true, className: 'disabled:cursor-not-allowed' })}
            >
              {t.checkout}
            </button>
          ) : (
            /* Sepetin tamamı kargodaysa açılacak taslak kargo taslağıdır; bayrak olmasa rota bölgesindeki adres için malın
               bulunmadığı depodan rota siparişi açılırdı. */
            <Link
              href={view.shippingOnly ? { pathname: '/checkout', query: { group: 'shipping' } } : '/checkout'}
              className={buttonClass({ variant: 'primary', size: 'md', compact, fullWidth: true })}
            >
              {t.checkout}
            </Link>
          )}
          {view.hasBlocked && <span className="text-center font-sans text-note font-semibold text-terracotta">{t.checkoutBlocked}</span>}
        </>
      )}
    </div>
  );
}
