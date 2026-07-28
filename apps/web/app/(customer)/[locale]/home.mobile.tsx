import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { buttonClass } from '@/components/customer/ui/button';
import { CtaBand, InviteBand, SectionHeading } from '@/components/customer/ui/section';
import { CategoryCard, OfferCard, PackageCard, ProductCard } from '@/components/customer/ui/storefront-cards';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { CartBar } from '@/components/customer/cart/cart-bar';
import { Link } from '@/i18n/navigation';
import { limitText, type HomeViewProps } from './home-types';

/**
 * Anasayfa — mobil düzeni (tasarım: `Musteri - Anasayfa.dc.html`, "Anasayfa Mobil" ekranı).
 * Aynı bölümler, mobil kurgusuyla: kategoriler yatay kaydırılan daire şeridi, vitrin iki sütun,
 * fırsatlar tek kutu içinde alt alta. Masaüstünün küçültülmüş hâli DEĞİL — ayrı dosya, ayrı düzen;
 * parçalar aynı (`compact`), yerleşim farklı.
 *
 * Trafiğin büyük kısmı mobil ve sosyal medyadan gelir (`musteri-anasayfa.md §7`), yani bu dosya
 * çoğu ziyaretçinin gördüğü ilk ekrandır.
 */
export function HomeMobile({ t, locale, data }: HomeViewProps) {
  return (
    <div className="flex flex-col pb-24">
      {/* Kahraman */}
      <section className="flex flex-col gap-3.5 px-4 py-5">
        <h1 className="font-serif text-h1-sm text-ink">
          {t.hero.titleLead} <em className="text-olive">{t.hero.titleAccent}</em>
        </h1>
        <FramedImage src={null} alt={t.hero.imageAlt} ratio={RATIO_BAND} />
        <Link href="/catalog" className={buttonClass({ fullWidth: true })}>
          {t.hero.ctaCatalog}
        </Link>
      </section>

      {/* Kategoriler — yatay şerit, daire maskeli */}
      <section className={`${SCROLL_STRIP} gap-2.5 px-4`}>
        {data.categories.map((c) => (
          <CategoryCard key={c.id} category={c} circle />
        ))}
      </section>

      {/* Fırsatlar — koşullu bölüm */}
      {data.offers.length > 0 && (
        <section className="mx-4 my-5 flex flex-col gap-3 rounded-card bg-cream-deep p-4">
          <SectionHeading title={t.offers.title} note={t.offers.note} compact />
          {data.offers.map((o) => (
            <OfferCard key={o.id} offer={o} locale={locale} limitLabel={limitText(t.offers.limit, o.limitLabel)} compact />
          ))}
        </section>
      )}

      {/* Vitrindekiler */}
      <section className="px-4 pb-1.5">
        <SectionHeading title={t.featured.title} action={{ label: t.featured.all, href: '/catalog' }} compact />
      </section>
      <section className="grid grid-cols-2 gap-3 px-4 pt-2 pb-5">
        {data.featured.map((p) => (
          <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.featured, limit: null }} compact />
        ))}
      </section>

      {/* Paketler */}
      <section className="flex flex-col gap-3 px-4 pb-4">
        {data.packages.map((p) => (
          <PackageCard
            key={p.id}
            pack={p}
            locale={locale}
            badgeLabel={t.packages.badge}
            itemsLabel={t.packages.items.replace('{n}', String(p.itemCount))}
            ctaLabel={t.packages.ctaShort}
            compact
          />
        ))}
      </section>

      <div className="mx-4 mb-3.5">
        <CtaBand title={t.discover.title} body={t.discover.body} cta={{ label: t.discover.cta, href: '/' }} compact />
      </div>
      <div className="mx-4 mb-[18px]">
        <InviteBand title={t.pro.title} body={t.pro.body} cta={{ label: t.pro.cta, href: '/' }} compact />
      </div>

      {/* K21 — gezinirken sepetin durumu ekranın altında kalır (sepet boşken hiç çizilmez). */}
      <CartBar locale={locale} />
    </div>
  );
}
