'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { FilterChip } from '@/components/customer/ui/filter-controls';
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
 * Öneri alanı bağlama göre değişen TEK bloktur; bağlam yoksa **tamamen kaldırılır** — ekran başlık
 * ve iki düğmeyle kalır, boşluk doldurulmaz.
 */

/** Kahraman görselinin çerçevesi (tasarım: web 260×200 · mobil 180×140 — ikisi de ~4:3). */
const ILLUSTRATION_RATIO = 4 / 3;

interface EmptyCartProps {
  t: Messages;
  locale: Locale;
  context: EmptyCartContext;
  compact?: boolean;
}

export function EmptyCart({ t, locale, context, compact = false }: EmptyCartProps) {
  const { addMany, justRemoved } = useCart();
  // Tükenmiş kalemler sessizce atlanır ama SÖYLENİR — eklemenin eksik geldiğini müşteri fark etmeli.
  // Aynı state ikinci tıklamayı da kapatır: `addMany` adetleri TOPLAR, iki tık siparişi ikiye katlardı.
  const [skipped, setSkipped] = useState<number | null>(null);
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
        {/* Görsel künyesi henüz yok (hasır sepet / tezgâh fotoğrafı); çerçeve TAM boyutuyla durur ki
            asıl fotoğraf gelince yerleşim kaymasın. Yer tutucu boş bir kutu değil, sepet işareti. */}
        <FramedImage src={null} alt="" ratio={ILLUSTRATION_RATIO} placeholder={<span className="text-h1-sm">🧺</span>} />
      </div>

      <div className={['flex flex-col', compact ? 'items-center gap-3' : 'max-w-[520px] gap-3.5'].join(' ')}>
        <h1 className={['font-serif text-ink', compact ? 'text-page-title-sm' : 'text-page-title'].join(' ')}>{title}</h1>
        {/* Mobilde metin KISALIR, küçültülmez: dar ekranda uzun cümle beş satıra yayılıp düğmeleri
            katlamanın altına iter. Tasarım iki ayrı cümle veriyor, ikisi de yazılı. */}
        <p className={['font-sans leading-relaxed text-body', compact ? 'text-note' : 'text-body'].join(' ')}>
          {compact ? t.empty.bodyShort : t.empty.body}
        </p>

        <div className={['flex gap-3', compact ? 'w-full flex-col' : 'mt-1'].join(' ')}>
          <Link href="/catalog" className={buttonClass({ variant: 'primary', size: 'md', fullWidth: compact })}>
            {t.empty.cta}
          </Link>
          <Link href="/packages" className={buttonClass({ variant: 'outlineOlive', size: 'md', fullWidth: compact })}>
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
        <span className={['font-sans text-body', compact ? 'text-micro' : 'text-body-sm'].join(' ')}>
          {[last.reference, formatShortDate(last.placedAt, locale), last.names.join(', ')].join(' · ')}
          {` — ${formatPrice(last.totalCents, locale)}`}
        </span>
      </div>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        fullWidth={compact}
        disabled={skipped !== null}
        onClick={() => {
          addMany(last.entries);
          setSkipped(last.unavailable);
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
    </div>
  );

  const hasSuggestion = Boolean(lastOrderBlock || categoryBlock);

  return (
    <div className="flex flex-col">
      {hero}

      {/* Bağlam yoksa alan HİÇ çizilmez — tasarım: "boşluk doldurulmaz". */}
      {hasSuggestion && (
        <div className={['flex flex-col', compact ? 'gap-3.5 p-4' : 'gap-4 px-12 pt-9 pb-4'].join(' ')}>
          {lastOrderBlock}
          {/* Atlanan kalem tek cümleyle bildirilir; sessizce eksik eklemek güveni bozar. */}
          {skipped !== null && skipped > 0 && (
            <span className="font-sans text-note font-semibold text-honey">{t.empty.skipped.replace('{n}', String(skipped))}</span>
          )}
          {categoryBlock}
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
