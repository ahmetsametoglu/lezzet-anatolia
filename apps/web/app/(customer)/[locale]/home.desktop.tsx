import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { PlacePrompt } from '@/components/customer/delivery/place-prompt';
import { buttonClass } from '@/components/customer/ui/button';
import { CtaBand, InviteBand, SectionHeading } from '@/components/customer/ui/section';
import { CategoryCard, CollectionCard, OfferCard, PackageCard, ProductCard } from '@/components/customer/ui/storefront-cards';
import { Link } from '@/i18n/navigation';
import { limitText, type HomeViewProps } from './home-types';

/**
 * Anasayfa — masaüstü düzeni (tasarım: `Musteri - Anasayfa.dc.html`, "Anasayfa Web" ekranı).
 * Bölüm sırası tasarımdan birebir: kahraman → kategoriler → fırsatlar → vitrin → paketler →
 * keşif → profesyonel çağrısı.
 *
 * Bu dosya KOMPOZİSYONDUR: parçaları (K7-K10 kartlar, K13-K15 bantlar) dizer, kendi stilini
 * kurmaz. Ham ölçü/renk yazılmaz — tipografi `text-h1`/`text-lead` gibi ölçek kademelerinden,
 * renk token'lardan gelir (envanter §0.4).
 *
 * Fırsat bölümü teklif yoksa HİÇ render edilmez (envanter §4: "teklif yoksa bu bölüm hiç var
 * olmamalı" — boş başlık bırakılmaz).
 */
export function HomeDesktop({ t, locale, data }: HomeViewProps) {
  return (
    <div className="flex flex-col">
      {/* Kahraman */}
      <section className="grid grid-cols-[1.05fr_1fr] items-center gap-12 px-12 pt-14 pb-10">
        <div className="flex flex-col gap-5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.hero.eyebrow}</span>
          <h1 className="font-serif text-h1 text-ink">
            {t.hero.titleLead}
            <br />
            <em className="text-olive">{t.hero.titleAccent}</em>
          </h1>
          <p className="font-sans text-lead text-body">{t.hero.body}</p>
          <div className="flex gap-3.5">
            <Link href="/catalog" className={buttonClass({ className: '!px-[30px]' })}>
              {t.hero.ctaCatalog}
            </Link>
            <Link href="/" className={buttonClass({ variant: 'secondary' })}>
              {t.hero.ctaDeals}
            </Link>
          </div>
        </div>
        <FramedImage src={null} alt={t.hero.imageAlt} ratio={RATIO_BAND} className="!rounded-[24px]" />
      </section>

      {/* K31 · Posta kodu sorma şeridi — kahramanın HEMEN ALTINDA (tasarım). Yer biliniyorsa ya da
          "şimdi değil" denmişse kendini hiç çizmez; kesmez, kilitlemez. */}
      <div className="px-12 pb-8">
        <PlacePrompt locale={locale} />
      </div>

      {/* Kategoriler */}
      <section className="flex flex-col gap-4 px-12 pt-2 pb-12">
        <SectionHeading title={t.categories.title} />
        <div className="grid grid-cols-6 gap-4">
          {data.categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>

      {/* Koleksiyonlar — koşullu bölüm (08.26).
          Tasarımın `hasCollections` koşulu: koleksiyon yoksa başlık da bant da HİÇ doğmaz. Fırsat
          bölümünün kuralının aynısı (envanter K8) — boş bir "Koleksiyonlar" başlığı, olmayan bir
          seçkiyi var gibi gösterir.
          **Bu bölüm YALNIZ masaüstünde:** tasarımın mobil ekranında koleksiyon bandı çizilmemiş
          (ölçüldü — `Musteri - Anasayfa.dc.html` mobil bloğunda `collections` bağı yok). Cihaz
          forku burada bir yerleşim farkı değil, bir İÇERİK kararı; improvise edilmedi (CLAUDE §3). */}
      {data.collections.length > 0 && (
        <section className="flex flex-col gap-4 px-12 pb-12">
          <SectionHeading title={t.collections.title} note={t.collections.note} />
          <div className="grid grid-cols-2 gap-[18px]">
            {data.collections.map((c) => (
              <CollectionCard key={c.id} collection={c} labels={t.collections} />
            ))}
          </div>
        </section>
      )}

      {/* Fırsatlar — koşullu bölüm */}
      {data.offers.length > 0 && (
        <section className="flex flex-col gap-4 bg-cream-deep px-12 py-10">
          <SectionHeading title={t.offers.title} note={t.offers.note} />
          <div className="grid grid-cols-3 gap-[18px]">
            {data.offers.map((o) => (
              <OfferCard key={o.id} offer={o} locale={locale} limitLabel={limitText(t.offers.limit, o.limitLabel)} />
            ))}
          </div>
        </section>
      )}

      {/* Vitrindekiler */}
      <section className="flex flex-col gap-4 px-12 py-11">
        <SectionHeading title={t.featured.title} action={{ label: t.featured.all, href: '/catalog' }} />
        <div className="grid grid-cols-4 gap-[18px]">
          {data.featured.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.featured, limit: null }} />
          ))}
        </div>
      </section>

      {/* Paketler */}
      <section className="grid grid-cols-2 gap-[18px] px-12 pb-11">
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
      </section>

      <div className="mx-12 mb-11">
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
