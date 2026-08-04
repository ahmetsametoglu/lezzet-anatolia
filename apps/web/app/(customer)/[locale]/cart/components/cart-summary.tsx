'use client';

import type { Locale } from '@lezzet/i18n';
import { buttonClass } from '@/components/customer/ui/button';
import { cardClass } from '@/components/customer/ui/card';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { cartBlockReason, shippingGroupFee, type CartView } from '@/lib/cart/cart-types';
import { discountLabel } from '@/lib/cart/discount-label';
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

/**
 * Engelin CÜMLESİ — sessizce pasif bir düğme ne yapılacağını anlatmaz.
 *
 * Kararı vermez, `cartBlockReason`'ı okur: hangi engelin önce geldiği bir sepet kuralıdır, ekranın
 * tercihi değil. `switch`'in `default`'u BİLEREK yok — üçüncü bir sebep eklendiğinde derleme durur
 * ve cümlesi yazılmadan geçemez; `default` koysaydık yeni sebep sessizce boş metne düşerdi.
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
 * Ücretsiz kargo ilerlemesi — eşik `Setting`'ten gelir (DOMAIN §6: parametrik), ilerleme ara
 * toplamdan hesaplanır. Yani **sayı uydurma değil**.
 *
 * Uydurma olmayan ama EKSİK olan şey şu: kargo ücretinin uygulanıp uygulanmayacağı teslimat
 * TÜRÜNE bağlı, tür de adresten çıkıyor — rota içindeki müşteri zaten ücretsiz teslim alıyor.
 * Bu yüzden burada bir "Teslimat: 6,90 €" satırı YOK; yalnız eşiğe ne kadar kaldığı var ve
 * cümle kargoyu adıyla anıyor. Eşik tanımsızsa (0) blok hiç çizilmez.
 *
 * ── ÇUBUK YALNIZ YOL BİLİNMİYORKEN ÇİZİLİR (19.7) ────────────────────────────
 * Yol biliniyorsa çubuğun söyleyeceği bir şey kalmıyor ve söylediği yanlış oluyordu:
 *   sepetin tamamı kapıya gidiyorsa → teslimat zaten ücretsiz, eşik hiç devreye girmiyor;
 *   iki grup varsa → eşik KARGO grubunun tutarına bakar (K37) ama çubuk sepetin tamamını
 *     ölçüyordu, yani 80 €'luk rota siparişi kargo grubunu bedavaymış gibi gösteriyordu;
 *   sepetin tamamı kargoysa → sayı doğru ama aynı cümle grubun kendi blokunda zaten yazılı.
 * Yol bilinmiyorken çubuk bugünkü "muhtemel" tonunda kalır: müşteri henüz yerini söylemedi,
 * söylediğinde cevap netleşecek.
 */
function FreeShippingProgress({ view, t, locale }: { view: CartView; t: Messages; locale: Locale }) {
  if (view.freeShippingCents <= 0) return null;
  if (view.lines.some((l) => l.route !== null)) return null;

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
   * Sepet iki gruba bölündü mü (19.7). Bölündüyse **aksiyon buradan düşer**: her grup kendi
   * blokunda kendi eylemiyle duruyor ve buradaki düğme sepetin tamamını ödeyecekmiş gibi
   * okunurdu — oysa `/checkout` yalnız kapıya giden kalemleri alır.
   *
   * Kart yine de kalır: sepetin tamamının parası bir yerde toplu görünmeli, indirim de orada.
   */
  grouped?: boolean;
}

export function CartSummary({ view, t, locale, compact = false, grouped = false }: CartSummaryProps) {
  // Engelin kendisi TEK yerde kararlaşır (`cartBlockReason`); burada yalnız okunur. Koşul üç
  // ekranda elle yazılıyordu ve üçünün ayrışması hiçbir hata vermeden düğmelerin bir kısmını
  // açık bırakırdı. Kilit yine de bir NEZAKET: sunucu güvenliği ekranın kilidine dayanmaz,
  // checkout aynı iki koşulu kendisi de kontrol ediyor.
  const reason = checkoutBlockReason(view, t, locale);
  const blocked = reason !== null;
  // İndirim tutarı türetilir, yeniden hesaplanmaz — kararın sahibi motor, yazan sunucu.
  const discountCents = view.subtotalCents - view.totalCents;
  /**
   * Sepetin tamamı kargo grubundaysa **tek sipariş** doğar ve o siparişin kargo ücreti BELLİDİR:
   * tür bilinmiyor değil, "kargo". Ücret satırının yokluğunun gerekçesi (tür adresten çıkar)
   * burada geçerli değil — sayıyı saklamak müşteriyi kasada sürprizle karşılamak olurdu.
   */
  const fee = view.shippingOnly ? shippingGroupFee(view) : null;
  const totalCents = view.totalCents + (fee?.feeCents ?? 0);
  return (
    /* Ölçüler tasarımdan (`Musteri - Sepet.dc.html:104` web · `:399` mobil): web `22×24` + `gap 12`,
       mobil `14` + `gap 7`. Web pedi `p-6` (24×24) yazılıydı — dikeyde 2 px fazlaydı, `snug` ile
       tasarıma döndü. Mobil ped ve dar boşluk bu kartın kendi kademesi ve primitifte adı var. */
    <div className={cardClass({ compact, pad: 'snug', compactPad: 'sm', gap: compact ? 'xs' : 'md' })}>
      {!compact && <h2 className="font-serif text-h2-sm text-ink">{grouped ? t.group.summaryScope : t.summary}</h2>}

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
            {/* Satır NEDEN indiğini söyler. Kampanyanın müşteriye görünen adı varsa o yazılır
                ("İndirim — Hoş geldin indirimi"); yoksa kupon kodu ya da türün kendisi ("kampanya
                %15"). Cümleyi ortak yardımcı kurar ki ödeme sayfası aynı indirimi başka türlü
                anlatmasın. */}
            <span>{discountLabel(view.discount, t, locale)}</span>
            <span className="font-bold">−{formatPrice(discountCents, locale)}</span>
          </div>
        )}

        {fee !== null && (
          <div className="flex items-center justify-between font-sans text-body-sm">
            <span className="text-body">{t.group.shippingRow}</span>
            {/* Ücretsizken tutar sütununa TEK KELİME yazılır: "🎉 Ücretsiz kargo eşiğini geçtiniz"
                bir kutlama cümlesidir ve sağa yaslı bir tutar hücresinde satırı bozar. Kutlamanın
                yeri ilerleme çubuğu; buranın işi sayıyı söylemek.
                Zeytin ton YALNIZ ücretsizken: ödenecek bir tutarı iyi haber rengiyle yazmak,
                masrafı kazanç gibi okutur. */}
            {fee.feeCents > 0 ? (
              <span className="font-bold text-ink">{formatPrice(fee.feeCents, locale)}</span>
            ) : (
              <span className="font-bold text-olive">{t.group.free}</span>
            )}
          </div>
        )}

        <div
          className={[
            'flex items-center justify-between border-t border-sand-200 font-sans font-bold text-ink',
            compact ? 'pt-2 text-body' : 'pt-2.5 text-card-title-sm',
          ].join(' ')}
        >
          <span>{t.total}</span>
          <span>{formatPrice(totalCents, locale)}</span>
        </div>
        <span className="font-sans text-micro text-muted">{t.vatIncluded}</span>
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

      {!compact && !grouped && (
        <>
          {/* Checkout BAĞLANDI (08.13). Düğme yalnız gerçek bir engel varken pasifleşir:
              tükenen/satıştan kalkan kalem ya da asgari sepetin altı. Engel yoksa düğme bir
              bağlantıdır — `disabled` bir `<a>` diye bir şey olmadığı için iki dal ayrı çizilir. */}
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
            /* Sepetin tamamı kargodaysa açılacak taslak da KARGO taslağıdır: aynı düğme, farklı
               sipariş. Bayrak olmadan checkout adresi rota bölgesine düşen müşteri için rota
               siparişi açar ve malın bulunmadığı depodan sipariş üretirdi (19.15). */
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
