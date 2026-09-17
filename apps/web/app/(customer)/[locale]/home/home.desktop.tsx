import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';import { buttonClass } from '@/components/customer/ui/button';
import { CtaBand, InviteBand, SectionHeading } from '@/components/customer/ui/section';
import { CategoryCard, CollectionCard, OfferCard, PackageCard, ProductCard } from '@/components/customer/ui/storefront-cards';
import { RecipeTeaserCard } from '@/components/customer/ui/recipe-card';
import { campaignValue } from '@/lib/storefront/campaign-note';
import { Link } from '@/i18n/navigation';
import { limitText, type HomeViewProps } from './home-types';

/**
 * Anasayfa — masaüstü düzeni (tasarım: `Musteri Web.dc.html`, "Web · Anasayfa" ekranı).
 * Bölüm sırası tasarımdan birebir: kahraman → kategoriler → koleksiyonlar → vitrin → fırsatlar →
 * paketler → tarifler → keşif → profesyonel çağrısı.
 *
 * Bu dosya KOMPOZİSYONDUR: parçaları (K7-K10 kartlar, K13-K15 bantlar) dizer, kendi stilini
 * kurmaz. Ham ölçü/renk yazılmaz — tipografi `text-h1`/`text-lead` gibi ölçek kademelerinden,
 * renk token'lardan gelir (envanter §0.4).
 *
 * Fırsat bölümü teklif yoksa HİÇ render edilmez (envanter §4: "teklif yoksa bu bölüm hiç var
 * olmamalı" — boş başlık bırakılmaz).
 */
export function HomeDesktop({ t, locale, data, hero }: HomeViewProps) {
  return (
    <div className="flex flex-col">
      {/* Kahraman */}
      <section className="grid grid-cols-[1.05fr_1fr] items-center gap-12 px-12 pt-14 pb-10">
        <div className="flex flex-col gap-5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.hero.eyebrow}</span>
          <h1 className="font-serif text-h1 text-ink">
            {t.hero.titleLead}
            <br />
            <em className="text-olive not-italic">{t.hero.titleAccent}</em>
          </h1>
          <p className="font-sans text-lead text-body">{t.hero.body}</p>
          <div className="flex gap-3.5">
            <Link href="/catalog" className={buttonClass({ className: '!px-[30px]' })}>
              {t.hero.ctaCatalog}
            </Link>
            <Link href="/packages" className={buttonClass({ variant: 'secondary' })}>
              {t.hero.ctaPackages}
            </Link>
          </div>
        </div>
        {/* Kahraman görseli operatörün "Vitrin görselleri" sekmesinden geliyor (`site_image.home_hero`,
            08.33): bir varlığa değil bir SAYFA YERİNE bağlı. Yüklenmemişse `null` — çerçeve yer
            tutucusunu çizer ve yerleşim kaymaz. Alt metin operatörünkü varsa onun, yoksa sayfanın:
            fotoğrafı yükleyen kişi ne olduğunu bilir, sayfa metni yalnız orada bir görsel olduğunu
            söyler. Kırpım künyesi de kapıdan geliyor — aynı fotoğraf 16:9 ve 3:2'ye farklı oturur. */}
        <FramedImage
          src={hero?.url ?? null}
          alt={hero?.alt ?? t.hero.imageAlt}
          ratio={RATIO_BAND}
          crop={hero?.crop}
          frames={hero?.frames}
          // İki sütunlu kahramanın görsel sütunu: ~593 px (içerik 1360 px'te durur).
          sizes="600px"
          className="!rounded-[24px]"
        />
      </section>

      {/* Kategoriler */}
      <section className="flex flex-col gap-5.5 border-t border-sand-275 px-12 pt-10 pb-12">
        <SectionHeading title={t.categories.title} action={{ label: t.categories.all, href: '/catalog' }} />
        <div className="grid grid-cols-6 gap-[18px]">
          {data.categories.map((c) => (
            <CategoryCard key={c.id} category={c} itemsLabel={t.categories.items} />
          ))}
        </div>
      </section>

      {/* Koleksiyonlar — koleksiyon yoksa başlık da ızgara da çizilmez. Telefon görünümü koleksiyonları
          kendi bandında gösterir (`home.mobile`). */}
      {data.collections.length > 0 && (
        <section className="flex flex-col gap-[18px] border-t border-sand-275 px-12 pt-11 pb-12">
          <SectionHeading
            eyebrow={t.collections.eyebrow}
            title={t.collections.title}
            action={{ label: t.featured.all, href: '/catalog' }}
          />
          <div className="grid grid-cols-2 gap-[18px]">
            {data.collections.map((c) => (
              <CollectionCard key={c.id} collection={c} labels={t.collections} campaignValue={c.campaign && campaignValue(c.campaign, t.campaign, locale)} />
            ))}
          </div>
        </section>
      )}

      {/* Vitrindekiler */}
      <section className="flex flex-col gap-[18px] border-t border-sand-275 px-12 pt-11 pb-12">
        <SectionHeading title={t.featured.title} action={{ label: t.featured.all, href: '/catalog' }} />
        <div className="grid grid-cols-4 gap-[18px]">
          {data.featured.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.featured, limit: null }} />
          ))}
        </div>
      </section>

      {/* Fırsatlar — teklif yoksa bölüm hiç çizilmez. */}
      {data.offers.length > 0 && (
        <section className="flex flex-col gap-[18px] border-t border-terracotta-line bg-terracotta-bg px-12 pt-11 pb-12">
          <SectionHeading
            eyebrow={t.offers.note}
            title={t.offers.title}
            tone="terracotta"
            action={{ label: t.offers.all, href: { pathname: '/catalog', query: { offers: '1' } } }}
          />
          <div className="grid grid-cols-3 gap-[18px]">
            {data.offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                locale={locale}
                limitLabel={limitText(t.offers.limit, o.limitLabel) ?? t.offers.note}
                actionLabels={t.featured}
              />
            ))}
          </div>
        </section>
      )}

      {/* Paketler — koyu bant; paket yoksa bölüm çizilmez. */}
      {data.packages.length > 0 && (
        <section className="flex flex-col gap-5 bg-ink px-12 pt-11 pb-12">
          <SectionHeading
            eyebrow={t.packages.eyebrow}
            title={t.packages.title}
            tone="onDark"
            action={{ label: t.packages.all, href: '/packages' }}
          />
          <div className="grid grid-cols-2 gap-[18px]">
            {data.packages.map((p) => (
              <PackageCard
                key={p.id}
                pack={p}
                locale={locale}
                badgeLabel={t.packages.badge}
                itemsLabel={t.packages.items.replace('{n}', String(p.itemCount))}
                ctaLabel={t.packages.cta}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sofradan Fikirler — tarif yoksa bölüm çizilmez. Telefon görünümünde bu şerit yok. */}
      {data.recipes.length > 0 && (
        <section className="flex flex-col gap-[18px] border-b border-sand-300 bg-cream-deep px-12 pt-11 pb-12">
          <SectionHeading
            eyebrow={t.recipes.eyebrow}
            title={t.recipes.title}
            action={{ label: t.recipes.all, href: '/recipes' }}
          />
          <div className="grid grid-cols-3 gap-[18px]">
            {data.recipes.map((r) => (
              <RecipeTeaserCard key={r.id} recipe={r} labels={t.recipes} />
            ))}
          </div>
        </section>
      )}

      <div className="mx-12 mt-11 mb-5">
        <CtaBand title={t.discover.title} body={t.discover.body} cta={{ label: t.discover.cta, href: '/discover' }} />
      </div>
      <div className="mx-12 mb-12">
        {/* Anasayfanın B2B çağrısı ana sayfaya dönüyordu (`/`) — tasarımın "gelinen yol" listesinde
            ilk sırada duran bağ, sayfa açılana kadar ölüydü (08.7). */}
        <InviteBand title={t.pro.title} body={t.pro.body} cta={{ label: t.pro.cta, href: '/professionals' }} />
      </div>
    </div>
  );
}
