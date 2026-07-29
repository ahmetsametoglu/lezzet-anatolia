'use client';

import type { Locale } from '@lezzet/i18n';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { CartView } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';

/**
 * Sepet özeti — tutar satırları ve (masaüstünde) checkout düğmesi.
 *
 * **Kargo satırı YOK ve bu bilinçli.** Ücret teslimat türüne bağlı (rota içi ücretsiz, kargoda
 * eşiğe bakılır), teslimat türü ise ADRESTEN çıkar — adres checkout'ta sorulur. Sepette "Teslimat:
 * Ücretsiz" yazıp checkout'ta 6,90 € çıkarmak tutulmayan bir sözdür; satır orada, bilgi kesinken
 * gösterilir. Aynı sebeple "ücretsiz kargoya X kaldı" çubuğu da yok: eşik teslimat türüne bağlı.
 *
 * **İndirim satırı VAR ve genel toplam ondan sonra gelir.** Bir süre yoktu: kart, indirim motoru
 * kurulmadan önce yazılmıştı ve "ara toplam = genel toplam" varsayımı kodun içinde kalmıştı —
 * toplam satırı `totalCents` yerine `subtotalCents` basıyordu. Otomatik indirim inen sepette ekran
 * indirimi hiç göstermiyor, üstelik **yanlış toplam** yazıyordu (29.07 · kullanıcı özet kartının
 * tasarıma uymadığını fark edince çıktı).
 *
 * İndirim tutarı burada yeniden HESAPLANMAZ, `ara toplam − genel toplam` olarak okunur: kararı
 * motor verdi, sunucu yazdı; ekranın ikinci bir hesabı olsaydı ikisi bir gün ayrışırdı (§1).
 *
 * Mobilde düğme BURADA DEĞİL, ekranın altındaki koyu çubuktadır (`CartCheckoutBar`) — tasarım
 * özet kartını akışta, aksiyonu sabit çubukta tutar.
 */

/** İki engel de SEBEBİYLE söylenir; sessizce pasif bir düğme ne yapılacağını anlatmaz. */
export function checkoutBlockReason(view: CartView, t: Messages, locale: Locale): string | null {
  if (view.hasBlocked) return t.checkoutBlocked;
  if (!view.minBasketOk) {
    return t.minBasket
      .replace('{min}', formatPrice(view.minBasketCents, locale))
      .replace('{missing}', formatPrice(view.missingForMinBasketCents, locale));
  }
  return null;
}

/**
 * Ücretsiz kargo ilerlemesi — eşik `Setting`'ten gelir (DOMAIN §6: parametrik), ilerleme ara
 * toplamdan hesaplanır. Yani **sayı uydurma değil**.
 *
 * Uydurma olmayan ama EKSİK olan şey şu: kargo ücretinin uygulanıp uygulanmayacağı teslimat
 * TÜRÜNE bağlı, tür de adresten çıkıyor — rota içindeki müşteri zaten ücretsiz teslim alıyor.
 * Bu yüzden burada bir "Teslimat: 6,90 €" satırı YOK; yalnız eşiğe ne kadar kaldığı var ve
 * cümle kargoyu adıyla anıyor. Eşik tanımsızsa (0) blok hiç çizilmez.
 */
function FreeShippingProgress({ view, t, locale }: { view: CartView; t: Messages; locale: Locale }) {
  if (view.freeShippingCents <= 0) return null;

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
}

export function CartSummary({ view, t, locale, compact = false }: CartSummaryProps) {
  // Devam etmeyi GERÇEKTEN engelleyen iki hâl: çıkarılmadan geçilemeyecek satır, ve asgari sepetin
  // altı. İkisi de checkout'ta yeniden kontrol ediliyor; buradaki kilit müşteriyi boşuna bir adım
  // ilerletmemek için (sunucu güvenliği ekranın kilidine dayanmaz).
  const blocked = view.hasBlocked || !view.minBasketOk;
  const reason = checkoutBlockReason(view, t, locale);
  // İndirim tutarı türetilir, yeniden hesaplanmaz — kararın sahibi motor, yazan sunucu.
  const discountCents = view.subtotalCents - view.totalCents;
  return (
    <div className={['flex flex-col rounded-card border border-sand-200 bg-card', compact ? 'gap-2 p-3.5' : 'gap-3 p-6'].join(' ')}>
      {!compact && <h2 className="font-serif text-h2-sm text-ink">{t.summary}</h2>}

      {/* Tutar satırları TEK BLOKTA ve kendi aralarında dar (8px). Kartın 12px'lik ana aralığı
          bölümler arasındır — satırlara da uygulanınca "Fiyatlara KDV dahildir" toplamdan
          kopuyor, toplamın dipnotu olmaktan çıkıp ayrı bir cümleye dönüşüyordu (tasarımda 8px). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between font-sans text-body-sm">
          <span className="text-body">{t.subtotal}</span>
          <span className="font-bold text-ink">{formatPrice(view.subtotalCents, locale)}</span>
        </div>

        {discountCents > 0 && (
          <div className="flex items-center justify-between font-sans text-body-sm text-olive">
            {/* Kod VARSA yazılır (tasarım: "İndirim — HOSGELDIN10"): otomatik inen indirimin kodu
                yoktur ve uydurma bir kod göstermek müşteriye kullanmadığı bir kupon atfetmek olurdu. */}
            <span>{view.discount.status === 'applied' ? `${t.discount} — ${view.discount.code}` : t.discount}</span>
            <span className="font-bold">−{formatPrice(discountCents, locale)}</span>
          </div>
        )}

        <div
          className={[
            'flex items-center justify-between border-t border-sand-200 font-sans font-bold text-ink',
            compact ? 'pt-2 text-body' : 'pt-2.5 text-card-title-sm',
          ].join(' ')}
        >
          <span>{t.total}</span>
          <span>{formatPrice(view.totalCents, locale)}</span>
        </div>
        <span className="font-sans text-micro text-muted">{t.vatIncluded}</span>
      </div>

      <FreeShippingProgress view={view} t={t} locale={locale} />

      {/* Asgari sepet BİLGİ kutusudur, hata değil: müşteri yanlış bir şey yapmadı, eşiğe henüz
          varmadı. Bal tonu (bekleyen durum) doğru aile; terracotta onu suçlu gösterirdi. */}
      {!view.minBasketOk && !view.hasBlocked && (
        <div className="rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-note font-semibold text-honey">
          {checkoutBlockReason(view, t, locale)}
        </div>
      )}

      {!compact && (
        <>
          {/* Checkout BAĞLANDI (08.13). Düğme yalnız gerçek bir engel varken pasifleşir:
              tükenen/satıştan kalkan kalem ya da asgari sepetin altı. Engel yoksa düğme bir
              bağlantıdır — `disabled` bir `<a>` diye bir şey olmadığı için iki dal ayrı çizilir. */}
          {blocked ? (
            <button
              type="button"
              disabled
              title={reason ?? undefined}
              className={buttonClass({ variant: 'primary', size: 'md', fullWidth: true, className: 'disabled:cursor-not-allowed' })}
            >
              {t.checkout}
            </button>
          ) : (
            <Link href="/checkout" className={buttonClass({ variant: 'primary', size: 'md', fullWidth: true })}>
              {t.checkout}
            </Link>
          )}
          {view.hasBlocked && <span className="text-center font-sans text-note font-semibold text-terracotta">{t.checkoutBlocked}</span>}
        </>
      )}
    </div>
  );
}
