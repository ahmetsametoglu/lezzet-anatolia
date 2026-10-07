'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { RATIO_ILLUSTRATION } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { FilterChip } from '@/components/customer/ui/filter-controls';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { SectionHeading } from '@/components/customer/ui/section';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice, formatShortDate } from '@/lib/storefront/format';
import type { EmptyCartContext } from '@/lib/cart/empty-cart';
import type { Messages } from '../cart-types';

/**
 * Boş sepet kendi ekranıdır, boş durum kutusu değil: ödeme dili hiç geçmez, tek eylem yön vermektir. Başlık "boşaldı" ile "boş"
 * arasında ayrılır, çünkü son kalemi az önce çıkaran müşteriye "boş" demek yaptığı işi görmezden gelir.
 */

// Kahraman çerçevesi `RATIO_ILLUSTRATION`dan gelir: operatörün kırptığı çerçeve ile müşterinin gördüğü aynı sayıdan doğmazsa
// fark yalnız görselin kesilen kenarında görünür.

interface EmptyCartProps {
  t: Messages;
  locale: Locale;
  context: EmptyCartContext;
  compact?: boolean;
}

export function EmptyCart({ t, locale, context, compact = false }: EmptyCartProps) {
  const { addMany, justRemoved } = useCart();
  /**
   * İkinci tıklamayı kapatır, çünkü `addMany` adetleri toplar ve iki tık siparişi ikiye katlardı. "N kalem eklenmedi" uyarısı
   * sağlayıcıda yaşar (`addSkipped`), çünkü ekleme bu ekranı hemen söker.
   */
  const [sent, setSent] = useState(false);
  const last = context.lastOrder;

  const title = justRemoved ? t.empty.titleEmptied : t.empty.title;

  const hero = (
    <div
      className={[
        'flex border-b border-sand-100',
        compact ? 'flex-col items-center gap-3 px-5 pt-7 pb-6 text-center' : 'items-center justify-center gap-12 px-12 pt-14 pb-11',
      ].join(' ')}
    >
      <div className={compact ? 'w-[180px]' : 'w-[260px] flex-none opacity-90'}>
        {/* Çizim yüklenmemişse çerçeve tam boyutuyla durur, fotoğraf gelince yerleşim kaymaz; ton ve köşe çağrı yerinde ezilir,
            çünkü `FramedImage`ın varsayılanı karanlıkta dönen operasyon grisidir. `alt` boş kalabilir: çizim dekoratiftir ve
            yanındaki başlık aynı şeyi söyler. */}
        <FramedImage
          src={context.illustration?.url ?? null}
          alt={context.illustration?.alt ?? ''}
          ratio={RATIO_ILLUSTRATION}
          crop={context.illustration?.crop}
          frames={context.illustration?.frames}
          sizes={compact ? '180px' : '260px'}
          className={compact ? '!rounded-[14px] !bg-cream-deep' : '!rounded-[16px] !bg-cream-deep'}
          placeholder={<Icon name="basket" size={compact ? 40 : 56} className="text-sand-500" />}
        />
      </div>

      <div className={['flex flex-col', compact ? 'items-center gap-3' : 'max-w-[520px] gap-3.5'].join(' ')}>
        {/* `leading-tight` ŞART: tip token'ları yalnız punto taşıyor, satır yüksekliği taşımıyor —
            aralık verilmezse 38px başlık gövdenin 1,5 mirasıyla 57px satıra oturuyor ve kahraman
            tasarımdan ~11px uzuyor. Aynı tuzağa dördüncü kez düşüldü (K19 · girdi · md buton). */}
        <h1 className={['font-serif leading-tight text-ink', compact ? 'text-page-title-sm' : 'text-page-title'].join(' ')}>{title}</h1>
        {/* Mobilde metin KISALIR, küçültülmez: dar ekranda uzun cümle beş satıra yayılıp düğmeleri
            katlamanın altına iter. Tasarım iki ayrı cümle veriyor, ikisi de yazılı. */}
        <p className={['font-sans leading-relaxed text-body', compact ? 'text-note' : 'text-copy'].join(' ')}>
          {compact ? t.empty.bodyShort : t.empty.body}
        </p>

        <div className={['flex gap-3', compact ? 'w-full flex-col' : 'mt-1'].join(' ')}>
          <Link href="/catalog" className={buttonClass({ variant: 'primary', size: 'md', compact, fullWidth: compact })}>
            {t.empty.cta}
          </Link>
          <Link href="/packages" className={buttonClass({ variant: 'outlineOlive', size: 'md', compact, fullWidth: compact })}>
            {t.empty.packagesCta}
          </Link>
        </div>

        {/* Teslimat vaadi: satış cümlesi değil, KARAR bilgisi — "sipariş verirsem nasıl gelir".
            Masaüstünde düğmelerin altında ince bir ayraçla, mobilde ekranın sonunda kendi kutusunda. */}
        {!compact && (
          <span className="mt-1.5 flex items-start gap-2 border-t border-sand-200 pt-3 font-sans text-note leading-relaxed text-muted">
            <Icon name="snowflake" size={14} className="mt-0.75" />
            {t.empty.delivery}
          </span>
        )}
      </div>
    </div>
  );

  const lastOrderBlock = last && (
    <div
      className={[
        'flex rounded-card bg-cream-deep',
        compact ? 'flex-col gap-2.5 p-3.5' : 'items-center gap-5 px-6 py-5',
      ].join(' ')}
    >
      {!compact && (
        <div className="w-14 flex-none">
          <FramedImage src={last.image.url} alt="" ratio={1} crop={last.image.crop} frames={last.image.frames} sizes="56px" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1">
        <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-copy'].join(' ')}>{t.empty.repeatTitle}</span>
        {/* Meta satırı masaüstünde ürün adlarını, telefonda kalem sayısını yazar: dar ekranda üç uzun ad üç satıra yayılıp düğmeyi
            aşağı iter. */}
        <span className={['font-sans text-body', compact ? 'text-micro' : 'text-body-sm'].join(' ')}>
          {[
            last.reference,
            formatShortDate(last.placedAt, locale),
            compact ? t.empty.repeatItems.replace('{n}', String(last.itemCount)) : last.names.join(', '),
          ].join(' · ')}
          {` — ${formatPrice(last.totalCents, locale)}`}
        </span>
      </div>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        compact={compact}
        fullWidth={compact}
        disabled={sent}
        onClick={() => {
          setSent(true);
          addMany(last.entries, last.unavailable);
        }}
      >
        {t.empty.repeatCta}
      </Button>
    </div>
  );

  // Kategori girişleri BAŞLIKSIZ durur (tasarım): çipler zaten kendilerini anlatıyor, üstlerine
  // "nereden başlamak istersiniz?" koymak kahramanın söylediğini ikinci kez söylemek olurdu.
  const categoryBlock = context.categories.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {context.categories.map((c) => (
        <FilterChip key={c.id} label={c.name} href={{ pathname: '/catalog', query: { category: c.slug } }} compact={compact} />
      ))}
      {/* "Paketler" tasarımda kategorilerin YANINDA dördüncü çip: paket bir kategori değil ama
          müşteri için aynı sorunun cevabı — "nereden başlayayım". Kahramandaki düğmeyle çakışmaz,
          çipler kategori satırının kendi dili. */}
      <FilterChip label={t.empty.packagesChip} href={{ pathname: '/packages' }} compact={compact} />
    </div>
  );

  /**
   * Vitrin seçkisi anasayfanın kartını, bölüm başlığını ve sıralamasını (`readShowcase`) kullanır. Sıralama ölçütü olmasa da alan
   * boş bırakılmaz: boşluk müşteriye ekranın bittiği izlenimini verir.
   */
  const showcaseBlock = context.showcase.length > 0 && (
    <div className={['flex flex-col', compact ? 'gap-2.5' : 'gap-4'].join(' ')}>
      <SectionHeading title={t.empty.showcaseTitle} action={{ label: t.empty.showcaseAll, href: '/catalog' }} compact={compact} />
      <div className={['grid', compact ? 'grid-cols-2 gap-3' : 'grid-cols-4 gap-5'].join(' ')}>
        {context.showcase.map((p) => (
          <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.empty.card, limit: null }} compact={compact} />
        ))}
      </div>
    </div>
  );

  const hasSuggestion = Boolean(lastOrderBlock || showcaseBlock || categoryBlock);

  return (
    <div className="flex flex-col">
      {hero}

      {/* Bağlam yoksa alan HİÇ çizilmez — tasarım: "boşluk doldurulmaz". */}
      {hasSuggestion && (
        <div className={['flex flex-col', compact ? 'gap-4 p-4' : 'gap-7 px-12 pt-9 pb-12'].join(' ')}>
          {lastOrderBlock}
          {categoryBlock}
          {showcaseBlock}
        </div>
      )}

      {compact && (
        <div className="px-4 pb-6">
          <div className="flex items-start gap-2 rounded-soft bg-cream-deep px-4 py-3 font-sans text-micro leading-relaxed text-body">
            <Icon name="snowflake" size={13} className="mt-0.5" />
            {t.empty.delivery}
          </div>
        </div>
      )}
    </div>
  );
}
