'use client';

import type { ReactNode } from 'react';
import { RATIO_SQUARE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/customer/ui/badge';
import { Button } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import placeMessages from '@/components/customer/delivery/place-messages.json';
import type { CartLine as Line, CartRef } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';

/**
 * Sepet satırı (tasarım: `Musteri - Sepet.dc.html`).
 *
 * Masaüstünde TEK SATIR: görsel · ad+ayrıntı · adet · satır toplamı · çöp. Mobilde görselin sağında
 * iki kat: ad+çöp üstte, adet+toplam altta. İkisi aynı bileşende çünkü ayıran şey yerleşim, içerik
 * değil — ayrı dosyaya bölmek aynı satır kurallarını iki yerde bakmak olurdu.
 *
 * ENGELLİ SATIR ayrı bir yerleşimdir, uyarı eklenmiş normal satır değil: adet seçici ve toplam
 * KALKAR (seçilecek bir şey yoktur), yerine tek bir çıkış düğmesi gelir. Kart terracotta çerçeveyle
 * bağırmaz — görsel griye düşer, ad susar, rozet antrasit olur; sebebi üstteki uyarı söyler.
 *
 * Adet 0'a inince satır SİLİNİR, onay istenmez; yanlışlık 5 sn'lik "geri al" şeridiyle döner
 * (`CartUndo`). Onay kutusu her silmeyi yavaşlatırdı, geri alma yalnız yanlış olanı düzeltir.
 *
 * Görsel KARE çerçevededir (`RATIO_SQUARE`) — görsel künyesi sepet satırını böyle tanımlar
 * (`image.schema`: "1:1 · sepet · paket satırı"); katalog kartının 3:2'si burada satırı şişirir.
 *
 * **Satırda "sonraya kaydet" YOKTUR** ve bu bilinçli bir sapma (28.07 · kullanıcı geri bildirimi).
 * Tasarım K33 onu her satıra koyuyordu ("kısıt olmadan da kullanılabilir"), ama kısıt yokken kontrol
 * hiçbir şeyi açıklamıyordu: çöp kutusunun yanında ikinci bir eylem, gideceği yer görünmüyor (liste
 * boşken çizilmiyor), ve müşterinin o an yaptığı işle — adet ayarla, devam et — yarışıyor. Ertelemek
 * ancak bir SEBEBİ varken anlam taşır; sebebi de kısıt bloğu veriyor. Kaydetme oraya taşındı.
 */
interface CartLineProps {
  line: Line;
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartLineRow({ line, t, locale, compact = false }: CartLineProps) {
  const { setQty } = useCart();
  const { place } = useDeliveryPlace();
  const pt = placeMessages[locale];
  // Satırın kimliği türüne göre doğar: pakette paketin kendisi, varyantta varyant + parti.
  const key: CartRef =
    line.kind === 'bundle' ? { kind: 'bundle', bundleId: line.bundleId } : { kind: 'variant', variantId: line.variantId, stockId: line.stockId };
  const isOffer = line.wasCents !== undefined;

  // Engelin ÜÇ sebebi vardır ve müşteri hangisi olduğunu anlamalı: tükendi · satışa kapandı ·
  // ürün kayboldu. Tek bir "sorun var" cümlesi ne yapacağını söylemez.
  const blocked = line.blocked
    ? line.slug === ''
      ? { badge: t.goneBadge, reason: t.gone }
      : line.unitPriceCents === null
        ? { badge: t.closedBadge, reason: t.closed }
        : { badge: t.soldOutBadge, reason: t.soldOut }
    : null;

  /**
   * PAKET satırı bir GRUPTUR, satır değil (tasarım K27): antrasit çerçeve onu komşularından ayırır,
   * gövdesi kum tonuna kaçar ve altına kesikli ayraçla içerik şeridi eklenir. Normal satırın ince
   * kum çerçevesiyle çizilseydi "sekiz ürün tek fiyat" olduğu ancak rozeti okuyunca anlaşılırdı.
   */
  const isBundle = line.kind === 'bundle' && !blocked;

  /**
   * Paketin içeriği — SALT OKUNUR (tasarım K27). Kesikli ayraç bunun kartın gövdesinden ayrı, bilgi
   * amaçlı bir bölüm olduğunu söyler: kalemler düzenlenemez, fiyatları YOKTUR (tek fiyat kuralı) ve
   * adetleri de yazılmaz — burası bir fatura değil, "ne aldığımı hatırlat" satırı. Adet/silme
   * paketin BÜTÜNÜNE işler; kalem kalem çıkarma diye bir şey yok (DOMAIN §13).
   */
  const contents =
    line.kind === 'bundle' && line.contents.length > 0 ? (
      <div
        className={[
          'border-t border-dashed font-sans text-muted',
          compact ? 'mx-3 border-sand-400 pt-1.5 pb-3 text-micro leading-relaxed' : 'border-sand-200 px-5 py-2.5 text-note',
        ].join(' ')}
      >
        {t.packageContents} {line.contents.map((item) => item.name).join(' · ')}
      </div>
    ) : null;

  const card = (children: ReactNode) =>
    isBundle ? (
      <div className={['overflow-hidden rounded-card border-[1.5px] border-ink', compact ? 'bg-sand-50' : 'bg-card'].join(' ')}>
        <div className={['flex', compact ? 'gap-3 p-3' : 'items-center gap-4 bg-sand-50 px-5 py-4'].join(' ')}>{children}</div>
        {contents}
      </div>
    ) : (
      <div
        className={[
          'flex rounded-card border border-sand-200 bg-card',
          compact ? 'gap-3 p-3' : 'items-center gap-4 px-5 py-4',
          blocked ? 'opacity-90' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    );

  const image = (
    <div className={compact ? 'w-[58px] flex-none' : 'w-[72px] flex-none'}>
      <FramedImage
        src={line.image.url}
        alt={line.name}
        ratio={RATIO_SQUARE}
        crop={line.image.crop}
        className={blocked ? 'grayscale opacity-70' : undefined}
      />
    </div>
  );

  const name = (
    <span className="flex flex-wrap items-center gap-2">
      {line.slug ? (
        <Link
          href={
            line.kind === 'bundle'
              ? { pathname: '/package/[slug]' as const, params: { slug: line.slug } }
              : { pathname: '/product/[slug]' as const, params: { slug: line.slug } }
          }
          className={[
            'cursor-pointer font-sans font-bold transition-colors hover:text-olive',
            compact ? 'text-note' : 'text-body',
            blocked ? 'text-muted' : 'text-ink',
          ].join(' ')}
        >
          {line.name}
        </Link>
      ) : (
        <span className={['font-sans font-bold text-muted', compact ? 'text-note' : 'text-body'].join(' ')}>
          {line.name || '—'}
        </span>
      )}
      {line.kind === 'bundle' && !blocked && (
        <Badge tone="package" variant="filled">
          {t.packageBadge.replace('{n}', String(line.contents.length))}
        </Badge>
      )}
      {blocked ? (
        <Badge tone="closed" variant="filled">
          {blocked.badge}
        </Badge>
      ) : (
        isOffer && (
          <Badge tone="offer" variant="filled">
            {t.offerBadge}
          </Badge>
        )
      )}
    </span>
  );

  if (blocked) {
    const removeButton = (
      <Button
        variant="outlineTerracotta"
        size={compact ? 'xs' : 'sm'}
        onClick={() => setQty(key, 0)}
        className="w-max"
      >
        {t.remove}
      </Button>
    );

    // Mobilde sebep cümlesi DÜŞER: dar kartta ikinci satır olarak sarar ve düğmeyi aşağı iter.
    // Rozet neyin olduğunu, üstteki uyarı ne yapılacağını söyler — cümle üçüncü kez tekrar olurdu.
    return card(
      compact ? (
        <>
          {image}
          <div className="flex flex-1 flex-col gap-1.5">
            {name}
            {removeButton}
          </div>
        </>
      ) : (
        <>
          {image}
          <div className="flex flex-1 flex-col gap-1">
            {name}
            <span className="font-sans text-note text-muted">{[line.unitLabel, blocked.reason].filter(Boolean).join(' · ')}</span>
          </div>
          {removeButton}
        </>
      ),
    );
  }

  // Paket satırının meta'sı BAŞKA bir cümledir: boyu ve birim fiyatı yoktur, tek fiyatı ve bütün
  // olarak yönetildiği vardır (tasarım: "paket fiyatı 49,90 € · bütün olarak artırılır/silinir").
  const meta = (
    <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
      {line.kind === 'bundle'
        ? [line.unitPriceCents !== null ? t.packagePrice.replace('{price}', formatPrice(line.unitPriceCents, locale)) : null, t.packageWhole]
            .filter(Boolean)
            .join(' · ')
        : [line.unitLabel, line.unitPriceCents !== null ? t.unitPrice.replace('{price}', formatPrice(line.unitPriceCents, locale)) : null]
            .filter(Boolean)
            .join(' · ')}
      {line.wasCents !== undefined && <span className="ml-2 text-sand-600 line-through">{formatPrice(line.wasCents, locale)}</span>}
    </span>
  );

  /**
   * **Bu kalem BU ADRESE nasıl gider?** Kararın verildiği yer sepet olduğu için bilgi de burada,
   * kalem kalem duruyor (28.07 · kullanıcı geri bildirimi). Başlıktaki hap yalnız yeri söyler.
   *
   * Yer bilinmiyorsa satır SESSİZ kalır: kime gönderileceğini bilmeden "kapıya getiriyoruz" ya da
   * "gönderemiyoruz" demek, ikisi de uydurma olurdu. Soruyu sepetin üstündeki şerit soruyor.
   *
   * Üç hâl: rota içi → kapıya · rota dışı ve kargolanabilir → kargo · rota dışı ve soğuk zincir →
   * gönderilemez (bal tonu). Üçüncüsü uyarıdır ama satırı engellemez — çıkışı kısıt bloğu verir.
   */
  const deliveryNote = place ? (
    <span
      className={[
        'font-sans font-semibold',
        compact ? 'text-micro' : 'text-note',
        place.inRoute ? 'text-olive-dark' : line.shippable ? 'text-muted' : 'text-honey',
      ].join(' ')}
    >
      {place.inRoute ? pt.lineInRoute : line.shippable ? pt.lineShipping : pt.lineBlocked}
    </span>
  ) : null;

  // Tavana ulaşıldığında sebep YAZILIR; "+" sessizce pasifleşirse müşteri arızalı sanır.
  const capNote =
    line.limitCap !== null && line.qty >= line.limitCap ? (
      <span className="font-sans text-micro font-semibold text-terracotta">
        {t.limitReached.replace('{n}', String(line.limitCap))}
      </span>
    ) : null;

  const stepper = (
    <QtyStepper
      value={line.qty}
      onChange={(next) => setQty(key, next)}
      min={0}
      max={line.limitCap}
      size={compact ? 'sm' : 'md'}
    />
  );

  // Fırsat kaleminde satır toplamı terracotta: indirimin nereye düştüğü tutarın kendisinde görünür.
  const total =
    line.lineTotalCents !== null ? (
      <span
        className={[
          'font-sans font-bold',
          compact ? 'text-body' : 'w-20 text-right text-card-title-sm',
          isOffer ? 'text-terracotta' : 'text-ink',
        ].join(' ')}
      >
        {formatPrice(line.lineTotalCents, locale)}
      </span>
    ) : null;

  const trash = (
    <button
      type="button"
      onClick={() => setQty(key, 0)}
      aria-label={t.remove}
      title={t.remove}
      className={[
        'cursor-pointer font-sans text-sand-600 transition-colors hover:text-terracotta',
        'disabled:cursor-not-allowed disabled:opacity-40',
        compact ? 'text-body' : 'text-icon-sm',
      ].join(' ')}
    >
      🗑
    </button>
  );

  return card(
    compact ? (
      <>
        {image}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            {name}
            {trash}
          </div>
          {meta}
          {deliveryNote}
          {capNote}
          <div className="mt-0.5 flex items-center justify-between gap-3">
            {stepper}
            {total}
          </div>
        </div>
      </>
    ) : (
      <>
        {image}
        <div className="flex flex-1 flex-col gap-1">
          {name}
          {meta}
          {deliveryNote}
          {capNote}
        </div>
        {stepper}
        {total}
        {trash}
      </>
    ),
  );
}
