'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, splitByRoute } from '@/lib/cart/cart-types';
import { PlacePrompt } from '@/components/customer/delivery/place-prompt';
import { PlaceRestriction } from '@/components/customer/delivery/place-restriction';
import { SavedList } from '@/components/customer/delivery/saved-list';
import { CartLineRow } from './components/cart-line';
import { CartGroup } from './components/cart-group';
import { CartSummary } from './components/cart-summary';
import { PlaceChangeCard } from './components/place-change-card';
import { CartCoupon } from './components/cart-coupon';
import { EmptyCart } from './components/empty-cart';
import { CartUnreachable } from './components/cart-unreachable';
import { CartSkeleton } from './components/cart-skeleton';
import type { CartViewProps } from './cart-types';

/**
 * Sepet — masaüstü düzeni (tasarım: `Musteri - Sepet.dc.html`, "Sepet Web").
 * Başlık + "alışverişe devam" → engel uyarısı → kalemler (sol 1.6fr) | özet (sağ 1fr, yapışkan).
 *
 * Özet YAPIŞKANDIR: uzun sepette müşteri kalemleri gezerken toplam ve tek aksiyon ekrandan
 * çıkmamalı — sepetin sorusu "ne var" değil, "ne tutuyor, devam edeyim mi".
 *
 * İlk okuma tamamlanmadan boş durum GÖSTERİLMEZ: sepette ürün varken bir an "sepetiniz boş" yazıp
 * sonra dolması, müşteriye sepetini kaybettiğini düşündürür.
 */
export function CartDesktop({ t, locale, emptyContext }: CartViewProps) {
  const { view, ready, failed, addSkipped } = useCart();
  // İlk kare BOŞ bırakılmaz: iskelet gerçek yerleşimin ölçüsünü taşır, içerik gelince zıplama olmaz.
  if (!ready) return <CartSkeleton t={t} />;

  // Okuma DÜŞTÜYSE boş ekran çizilmez: sepet boş değil, ulaşılamıyor (`CartUnreachable`).
  if (failed) return <CartUnreachable t={t} />;

  // Boş sepet KENDİ ekranıdır: "Sepetim" başlığı ve "alışverişe devam" bağlantısı da düşer, çünkü
  // kahramanın başlığı zaten sayfanın başlığıdır ve iki düğme zaten devam etme yoludur.
  //
  // Ölçüt "çözülmüş satır yok" DEĞİL, "niyet de yok": tekrar siparişten hemen sonra satırlar henüz
  // sunucudan dönmemişken ekranın ortası "Sepetiniz şu an boş" derken üstteki rozet "3" gösteriyordu
  // (29.07 denetimi). Tasarımın sözleşmesi geçişin TEK ADIM olmasını istiyor — arada iskelet var,
  // boş ekran yok.
  if (view.lines.length === 0) {
    return view.itemCount > 0 ? <CartSkeleton t={t} /> : <EmptyCart t={t} locale={locale} context={emptyContext} />;
  }

  const groups = splitByRoute(view.lines);
  const grouped = groups.route.length > 0 && groups.shipping.length > 0;

  return (
    // Başlık ve uyarı SOL SÜTUNUN İÇİNDEDİR, ızgaranın üstünde değil (tasarım): özet kartı sayfanın
    // en tepesinden başlar ve "Sepetim" ile aynı hizada durur. Üste alınınca sağ sütun başlık kadar
    // aşağı kayıyor ve tepede boş bir şerit kalıyordu.
    <section className="grid grid-cols-[1.6fr_1fr] items-start gap-10 px-12 pt-9 pb-12">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-page-title text-ink">{t.title}</h1>
          <Link href="/catalog" className="cursor-pointer font-sans text-body-sm font-bold text-olive hover:text-olive-dark">
            {t.back}
          </Link>
        </div>

        {/* Stok uyarısı BAL tonundadır, terracotta değil: müşteri hata yapmadı, dünya değişti.
            Kırmızı bir bant onu suçlu gösterir; asıl kırmızı, çıkarılacak satırın düğmesindedir. */}
        {view.hasBlocked && (
          <div className="rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3 font-sans text-body-sm font-semibold text-honey">
            {t.blockedNotice}
          </div>
        )}

        {/* Tekrar siparişin eksik geldiği BURADA söylenir (tasarım: "sepette tek cümleyle bildirilir").
            Uyarıyı doğuran boş sepet ekranı ekleme anında söküldüğü için orada gösterilemez. */}
        {addSkipped !== null && (
          <div className="rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3 font-sans text-body-sm font-semibold text-honey">
            {t.empty.skipped.replace('{n}', String(addSkipped))}
          </div>
        )}

        {/* K32 · Teslimat kısıtı — satırların ÜSTÜNDE: hangi kalemlerin etkilendiğini ve çıkışı,
            müşteri listeyi gezmeden görmeli. Kısıt yoksa (ya da yer bilinmiyorsa) hiç çizilmez. */}
        {/* Yer BİLİNMİYORSA soru burada sorulur, biliniyorsa kısıt bloğu konuşur — ikisi birbirini
            dışlar. Sepet, checkout'tan önceki son duraktır: soruyu buraya koymamak, mekanizmayı
            kurup duvarı yine checkout'ta bırakmak olurdu. */}
        <PlacePrompt locale={locale} scope="cart" />
        <PlaceRestriction locale={locale} lines={view.lines} minBasketCents={view.minBasketCents} freeShippingCents={view.freeShippingCents} />

        {/* Sepet iki yola bölündüyse her grup kendi başlığı, toplamı ve eylemiyle durur; tek yol
            varsa hiçbir şey değişmez — ayrım ancak ayrılacak bir şey varken bilgidir. */}
        {grouped ? (
          <>
            <CartGroup kind="route" lines={groups.route} view={view} t={t} locale={locale} />
            <CartGroup kind="shipping" lines={groups.shipping} view={view} t={t} locale={locale} />
          </>
        ) : (
          view.lines.map((line) => <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} />)
        )}

        {/* K33 · Sonraya kaydedilenler — sepetin ALTINDA, boşken hiç çizilmez. */}
        <SavedList locale={locale} />
      </div>

      <div className="sticky top-5 flex flex-col gap-3.5">
        {/* Yer değişimi bildirimi ÖZETİN ÜSTÜNDE (tasarım: sağ sütunun kendi kartı): müşteri
            önce neyin değiştiğini okur, sonra tutara bakar. */}
        <PlaceChangeCard t={t} locale={locale} />
        <CartSummary view={view} t={t} locale={locale} grouped={grouped} />
        <CartCoupon t={t} locale={locale} />
      </div>
    </section>
  );
}
