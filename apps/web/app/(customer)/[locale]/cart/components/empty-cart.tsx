'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { RATIO_ILLUSTRATION } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { FilterChip } from '@/components/customer/ui/filter-controls';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { SectionHeading } from '@/components/customer/ui/section';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice, formatShortDate } from '@/lib/storefront/format';
import type { EmptyCartContext } from '@/lib/cart/empty-cart';
import type { Messages } from '../cart-types';

/**
 * Boş sepet ekranı (tasarım: `Musteri - Sepet.dc.html` → "Bos Sepet Web/Mobil").
 *
 * Bu bir BOŞ DURUM kutusu değil, kendi ekranıdır — ve tasarımın kuralı açık: **boş sepette ödeme
 * dili hiç geçmez.** Özet kartı, kupon, teslimat günü, pasif hâliyle bile "Checkout'a geç" — hiçbiri
 * çizilmez. Sepette tek eylem yön vermektir. Bu yüzden burada `CartSummary` de yok.
 *
 * Başlık İKİ HÂLLİDİR: "Sepetiniz şu an boş" (durum) · "Sepetiniz boşaldı" (az önce son kalem
 * çıkarıldı). Ayrım tasarımdan: ikincisi müşterinin az önce yaptığı işin sonucudur, ona "boş" demek
 * yaptığı şeyi görmezden gelmektir. Geri alma şeridi 5 sn üstünde durmaya devam eder.
 *
 * Öneri alanı ÜÇ bloktan oluşur (tasarım): son sipariş tekrarı · **vitrin seçkisi** · kategori
 * girişleri. Hiçbiri yoksa alan tamamen kaldırılır — ekran başlık ve iki düğmeyle kalır.
 *
 * Seçki bir süre hiç çizilmiyordu ("popülerlik sinyalimiz yok" gerekçesiyle) ve ekranın altı bomboş
 * kalıyordu. **Ölçüt yokluğu, alanı boş bırakmanın gerekçesi değil** (kullanıcı kararı 29.07):
 * gerçek bir "çok sevilen" listesi hesaplanana kadar alan katalogla dolar — müşteri o boşlukta
 * ekranın bittiğini sanıyordu. Sıralamanın kaynağı `readShowcase`, anasayfanın bandıyla aynı.
 */

// Kahraman görselinin çerçevesi (tasarım: web 260×200 · mobil 180×140 — ikisi de ~1,3) artık
// `@lezzet/types`te (`RATIO_ILLUSTRATION`, operasyon notu 09.08): operatörün kadraj panelinde
// kırptığı çerçeve ile müşterinin gördüğü çerçeve aynı sayıdan gelmek zorunda. İki kopya bugün
// eşitti ama ayrışsalardı fark KODDA değil FOTOĞRAFIN KENARINDA görünürdü — kimse hata görmez,
// yalnız görselin bir yanı sitede kesilir.

interface EmptyCartProps {
  t: Messages;
  locale: Locale;
  context: EmptyCartContext;
  compact?: boolean;
}

export function EmptyCart({ t, locale, context, compact = false }: EmptyCartProps) {
  const { addMany, justRemoved } = useCart();
  /**
   * İkinci tıklamayı kapatır — `addMany` adetleri TOPLAR, iki tık siparişi ikiye katlardı.
   *
   * "N kalem eklenmedi" uyarısı BURADA tutulmaz: ekleme bu ekranı hemen söküyor, uyarı da onunla
   * gidiyordu. Artık sağlayıcıda yaşıyor (`addSkipped`) ve tasarımın istediği yerde — sepette —
   * görünüyor.
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
        {/* Çizim operatörün "Vitrin görselleri" sekmesinden (`site_image.empty_cart`, 08.33).
            Yüklenmemişse çerçeve TAM boyutuyla durur ve yer tutucu boş bir kutu değil, sepet
            işaretidir — fotoğraf gelince yerleşim kaymaz.

            Ton ve köşe SITE'ın: `FramedImage`ın varsayılanı operasyon grisidir (`ops-gray`) ve
            karanlık modda döner — krem sayfanın ortasında soğuk gri bir kutu duruyordu. Primitifin
            varsayılanı değiştirilmedi (operasyon ekranları onu doğru kullanıyor), çağrı yerinde
            eziliyor. Köşe tasarımdan: web 16 · mobil 14.

            `alt` boş kalabilir ve kalmalı: bu bir DEKORATİF çizimdir, yanındaki başlık zaten aynı
            şeyi söylüyor — ekran okuyucuya iki kez okutmak gürültüdür. Operatör bir cümle yazdıysa
            o kazanır (bilerek yazılmış bir metni yok saymak, yazma imkânını anlamsız kılardı). */}
        <FramedImage
          src={context.illustration?.url ?? null}
          alt={context.illustration?.alt ?? ''}
          ratio={RATIO_ILLUSTRATION}
          crop={context.illustration?.crop}
          className={compact ? '!rounded-[14px] !bg-cream-deep' : '!rounded-[16px] !bg-cream-deep'}
          placeholder={<span className="text-h1-sm">🧺</span>}
        />
      </div>

      <div className={['flex flex-col', compact ? 'items-center gap-3' : 'max-w-[520px] gap-3.5'].join(' ')}>
        {/* `leading-tight` ŞART: tip token'ları yalnız punto taşıyor, satır yüksekliği taşımıyor —
            aralık verilmezse 38px başlık gövdenin 1,5 mirasıyla 57px satıra oturuyor ve kahraman
            tasarımdan ~11px uzuyor. Aynı tuzağa dördüncü kez düşüldü (K19 · girdi · md buton). */}
        <h1 className={['font-serif leading-tight text-ink', compact ? 'text-page-title-sm' : 'text-page-title'].join(' ')}>{title}</h1>
        {/* Mobilde metin KISALIR, küçültülmez: dar ekranda uzun cümle beş satıra yayılıp düğmeleri
            katlamanın altına iter. Tasarım iki ayrı cümle veriyor, ikisi de yazılı. */}
        <p className={['font-sans leading-relaxed text-body', compact ? 'text-note' : 'text-body'].join(' ')}>
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
          <span className="mt-1.5 border-t border-sand-200 pt-3 font-sans text-note leading-relaxed text-muted">{t.empty.delivery}</span>
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
          <FramedImage src={last.image.url} alt="" ratio={1} crop={last.image.crop} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1">
        <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-body'].join(' ')}>{t.empty.repeatTitle}</span>
        {/* Meta satırı cihaza göre FARKLI ve bu tasarımın kararı: masaüstünde ürün adları
            ("…Fıstıklı Baklava, Ispanaklı Gözleme…"), mobilde kalem SAYISI ("3 kalem"). Dar ekranda
            üç uzun ad üç satıra yayılıp düğmeyi aşağı itiyor; sayı tek satırda aynı bilgiyi veriyor.
            `itemCount` kapıda zaten hesaplanıyordu ama hiç okunmuyordu. */}
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
   * Vitrin seçkisi — tasarımda web 4'lü, mobil 2'li ızgara. Kart ve bölüm başlığı ANASAYFANIN
   * parçaları (`ProductCard` · `SectionHeading`): burada ikinci bir ürün kartı yazmak aynı kartın
   * iki görünümü demekti, biri iyileştiğinde öbürü geride kalırdı (CLAUDE.md §1).
   *
   * Mobilde ızgara ikiye düşer ama kart `compact` olur — küçültülmüş masaüstü değil, kartın kendi
   * dar hâli. Katalog boşsa bölüm hiç çizilmez.
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
          <div className="rounded-soft bg-cream-deep px-4 py-3 font-sans text-micro leading-relaxed text-body">{t.empty.delivery}</div>
        </div>
      )}
    </div>
  );
}
