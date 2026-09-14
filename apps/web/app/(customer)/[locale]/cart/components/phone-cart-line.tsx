'use client';

import type { Locale } from '@lezzet/i18n';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { QuantityStepper } from '@/components/customer/phone-kit/quantity-stepper';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { useCart } from '@/components/customer/cart/cart-context';
import type { CartLine, CartRef } from '@/lib/cart/cart-types';
import { formatPrice } from '@/lib/storefront/format';
import type { CartCopy, Messages } from '../cart-types';

/*
  SEPET SATIRI — TELEFON: native `CartLineRow`un (`apps/mobile/src/screens/cart/cart-line-row.tsx`) ve satırı kuran
  `renderLine`ın (`cart-screen.tsx`) web ikizi. İskelet: 56'lık daire fotoğraf · metin sütunu (paket üstbaşlığı · ad ·
  alt satır · satır toplamı · rozetler) · sağda adet sayacı, altında "kaldır".

  İki ton native'in ayrımı: PAKET koyu mürekkep kart (üstbaşlık zeytin, sayaç çerçeveli, "kaldır" terracotta) — paket
  bir üründen fazlasıdır ve listede öyle görünmeli; ÜRÜN zeminsiz satır, altında kesikli ayraç. Alt satır pakette
  içerik özeti ("Ad ×2 · …"), üründe "{boy} · {fiyat}".

  ROZETLER native'in dördü, iki aile: İŞARET (terracotta — indirimli fiyat · bu adrese gelemez · fiyat arttı) ve HATA
  (tükendi / satışa kapandı — satır çıkarılmadan devam edilemez, duyurulur). Tükenen satırda sayaç da "kaldır" da
  durur (native'in kararı): masaüstünün ayrı "engelli yerleşimi" telefonda yok. Adı çözülemeyen satır ("artık
  satılmayan ürün") adsız kutu olarak kalmaz.

  WEB'E ÖZGÜ: adet TAVANI (19.7) — teklif partisinde kalan (`limitCap`) ve bu yerde bulunan (`availableHere`); sayaç en
  dar olana uyar, tavana varınca sebep rozetle yazılır; sepetteki adet yerin tavanını AŞIYORSA rozet tek dokunuşla
  düzeltir (müşterinin yazdığı sayı sessizce değiştirilmez). Adet 0'a inince satır silinir ve 5 sn'lik "geri al"
  şeridi açılır (`CartUndo`, onay sorulmaz).
*/

const BADGE = 'self-start rounded-badge px-2 py-0.5 font-sans text-badge-sm font-semibold';
const NOTE_BADGE = `${BADGE} bg-terracotta-bg text-terracotta`;
const ERROR_BADGE = `${BADGE} bg-error-bg text-error`;

interface PhoneCartLineProps {
  line: CartLine;
  /** Ortak sepet sözlüğü (native ile aynı). */
  copy: CartCopy;
  /** Web sepet sözlüğü — tavan cümleleri. */
  t: Messages;
  locale: Locale;
}

export function PhoneCartLine({ line, copy, t, locale }: PhoneCartLineProps) {
  const { setQty } = useCart();
  const c = copy.line;
  const bundle = line.kind === 'bundle';
  // Paket KENDİ kimliğiyle adreslenir: varyant kapısına paket kimliği verilseydi eşleşme bulunmaz, hiçbir şey olmazdı.
  const ref: CartRef = bundle ? { kind: 'bundle', bundleId: line.bundleId } : { kind: 'variant', variantId: line.variantId, stockId: line.stockId };
  const name = line.name === '' ? c.unknown : line.name;

  const priceLabel = line.unitPriceCents === null ? null : formatPrice(line.unitPriceCents, locale);
  const contents = line.contents.map((item) => `${item.name} ×${item.qty}`).join(' · ');
  const subtitle =
    bundle && contents !== ''
      ? contents
      : priceLabel === null
        ? line.unitLabel === ''
          ? c.noPrice
          : line.unitLabel
        : line.unitLabel === ''
          ? priceLabel
          : c.unit.replace('{variant}', line.unitLabel).replace('{price}', priceLabel);

  // Tavanın iki kaynağı iki ayrı şey söyler: "bu FİYATTAN en fazla" ⟷ "bu YERE en fazla". Cümleyi dayanılan yazar.
  const placeCap = line.availableHere !== null && line.availableHere > 0 ? line.availableHere : null;
  const cap = Math.min(line.limitCap ?? Infinity, placeCap ?? Infinity);
  const overCap = placeCap !== null && line.qty > placeCap;
  const atCap = Number.isFinite(cap) && line.qty >= cap;
  const placeBinds = placeCap !== null && (line.limitCap === null || placeCap <= line.limitCap);

  return (
    <div className={['relative flex items-center gap-3', bundle ? 'rounded-control bg-ink px-3.5 py-3' : 'px-0.5 py-3'].join(' ')}>
      <CirclePhoto image={line.image} initial={name.slice(0, 1)} size={56} initialClassName="text-h2-sm text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {bundle && <span className="font-sans text-eyebrow-xs text-olive-light uppercase">{c.bundle}</span>}
        <span className={['font-sans text-control', bundle ? 'text-sand-50' : 'text-ink'].join(' ')}>{name}</span>
        <span className={['font-sans text-body-sm leading-[1.6]', bundle ? 'text-neutral-400' : 'text-muted'].join(' ')}>{subtitle}</span>
        <span className={['mt-0.5 font-sans text-body-sm font-bold', bundle ? 'text-sand-50' : 'text-ink'].join(' ')}>
          {line.lineTotalCents === null ? c.noPrice : formatPrice(line.lineTotalCents, locale)}
        </span>
        {line.wasCents !== undefined && <span className={NOTE_BADGE}>{c.discounted}</span>}
        {line.blocked && (
          // Tükendi bir DURUM DEĞİŞİKLİĞİDİR (sepete girdikten sonra oldu): duyurulur.
          <span role="alert" className={ERROR_BADGE}>
            {line.unitPriceCents === null ? c.closed : c.soldOut}
          </span>
        )}
        {/* Duyurulmaz: adresin sabit gerçeği, satırların üstündeki tek uyarı aynı şeyi zaten söylüyor. */}
        {line.group === 'undeliverable' && <span className={NOTE_BADGE}>{c.undeliverable}</span>}
        {line.priceChange !== undefined && (
          <span role="alert" className={NOTE_BADGE}>
            {c.priceUp.replace('{price}', formatPrice(line.priceChange.previousCents, locale))}
          </span>
        )}
        {overCap ? (
          <button type="button" onClick={() => setQty(ref, placeCap)} className={`${NOTE_BADGE} cursor-pointer text-left transition-opacity hover:opacity-80`}>
            {t.placeCap.replace('{n}', String(placeCap))} · {t.placeCapFix.replace('{n}', String(placeCap))}
          </button>
        ) : (
          atCap && <span className={NOTE_BADGE}>{placeBinds ? t.placeCap.replace('{n}', String(cap)) : t.limitReached.replace('{n}', String(cap))}</span>
        )}
      </div>
      <div className="flex flex-none flex-col items-center gap-2.5">
        <QuantityStepper
          size="line"
          tone={bundle ? 'ink' : 'sand'}
          value={line.qty}
          onChange={(next) => setQty(ref, next)}
          min={0}
          // Tavan aşılmış hâlde sayaç kilitlenmez: değer zaten tavanın üstünde; düzeltmeyi rozet yapar.
          max={overCap || !Number.isFinite(cap) ? null : cap}
          decreaseLabel={c.decrease.replace('{name}', name)}
          increaseLabel={c.increase.replace('{name}', name)}
        />
        <TextAction label={c.remove} onClick={() => setQty(ref, 0)} tone={bundle ? 'terracotta' : 'olive'} ariaLabel={c.removeLabel.replace('{name}', name)} edges="down" />
      </div>
      {/* Ürün satırının kesikli alt ayracı — paket kartında yok (kartın kendi kenarı var). */}
      {!bundle && <span aria-hidden className="absolute inset-x-0 bottom-0 border-b-[1.5px] border-dashed border-sand-400" />}
    </div>
  );
}
