'use client';

import { useState } from 'react';
import { meetsMinBasket } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, type CartLine, type CartRef } from '@/lib/cart/cart-types';
import { formatPrice } from '@/lib/storefront/format';
import { useDeliveryPlace } from './place-context';
import { PlaceDialog } from './place-dialog';
import { ZoneNoticeDialog } from './zone-notice-dialog';
import messages from './restriction-messages.json';

/**
 * K32 · Teslimat Kısıtı Bloğu — sepette ve (sonra) checkout'ta AYNI bileşen.
 *
 * Aynı olması tasarımın kararı: müşteri aynı kısıtı iki farklı dille iki kez okumamalı. Üç çıkış
 * HEP AYNI SIRADA durur — sepeti böl · yeri değiştir · haber ver.
 *
 * **Kırmızı yok, kilit yok.** Bu bir hata değil, bir durum bilgisi: sepete ekleme de checkout da
 * pasifleştirilmez. Müşteri bölge içindeki birine gönderiyor olabilir (tasarım §7).
 *
 * **Birinci çıkış her zaman mümkün değildir** ve tasarımın taslağı bunu atlıyordu. Üç hâl var,
 * üçünde de sebebi yazılır:
 *   sepetin tamamı kısıtlı → ayrılacak bir kalan yok, çıkış hiç gösterilmez
 *   kalan asgari sepetin altında → çıkış kapalı, eksik tutar söylenir
 *   kalan ücretsiz kargo eşiğinin altına düşüyor → çıkış açık ama doğacak ücret ÖNCEDEN söylenir
 * Üçüncüsü özellikle önemli: iki kalemi çıkarıp toplamın artmasını açıklamayan bir ekran, müşteriye
 * hata yapmış hissi verir.
 */
interface PlaceRestrictionProps {
  locale: Locale;
  /** Bu ekrandaki satırlar — sepette sepet satırları, checkout'ta siparişe girecek olanlar. */
  lines: CartLine[];
  /** Asgari sepet ve ücretsiz kargo eşiği (kuruş) — sepet okumasından gelir, ekran ayar okumaz. */
  minBasketCents: number;
  freeShippingCents: number;
  compact?: boolean;
}

export function PlaceRestriction({ locale, lines, minBasketCents, freeShippingCents, compact = false }: PlaceRestrictionProps) {
  const t = messages[locale];
  const { place } = useDeliveryPlace();
  const { saveForLater } = useCart();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Kısıt YALNIZ rota dışı bir yer bilindiğinde doğar. Yer sorulmamışsa kimse "gönderemiyoruz"
  // diyemez: kime gönderileceği bilinmiyor (tasarım: atlanırsa uyarılar "muhtemel" tonunda kalır).
  const blocked = place && !place.inRoute ? lines.filter((l) => !l.shippable && !l.blocked) : [];
  if (!place || blocked.length === 0) return null;

  const remaining = lines.filter((l) => !blocked.includes(l));
  const remainingCents = remaining.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  const currentCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);

  const allBlocked = remaining.length === 0;
  const basket = meetsMinBasket(remainingCents, minBasketCents);
  // Eşik 0 = tanımsız (okuma varsayılanı); o zaman "kargo ücreti doğar" diye bir şey yok.
  const losesFreeShipping = freeShippingCents > 0 && currentCents >= freeShippingCents && remainingCents < freeShippingCents;
  const canSplit = !allBlocked && basket.ok;

  const refOf = (line: CartLine): CartRef =>
    line.kind === 'bundle' ? { kind: 'bundle', bundleId: line.bundleId } : { kind: 'variant', variantId: line.variantId, stockId: line.stockId };

  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-card border border-honey-line bg-honey-bg',
        compact ? 'px-4 py-3.5' : 'px-5 py-4.5',
      ].join(' ')}
    >
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {t.title.replace('{n}', String(blocked.length))}
      </span>
      <p className={['font-sans leading-relaxed text-body', compact ? 'text-micro' : 'text-note'].join(' ')}>{t.reason}</p>

      {/* Hangi kalemler — sayı tek başına "hangisi" sorusunu cevaplamıyor.
          Satır içi "sonraya kaydet" YALNIZ ÇOĞULDA çizilir: seçim ancak seçilecek bir şey varken
          anlamlıdır ("ikisini bırak, birini gönder"). Tek kalemde o düğme alttaki birincil eylemle
          birebir aynı işi yapardı — aynı sonucu veren iki kontrol, müşteriyi olmayan bir farkı
          aramaya iter. Tek kalemde satır saf bilgidir: ad · adet · tutar. */}
      <ul className="flex flex-col gap-1.5">
        {blocked.map((line) => (
          <li key={cartKey(line)} className="flex items-center gap-3 rounded-soft border border-dashed border-honey-line bg-card px-3.5 py-2">
            {/* Nesne eylemden daha yüksek sesle konuşur: ad `body`, tutar `ink`. Eskiden ikisi de
                soluktu ve yanındaki zeytin link satırın en parlak öğesiydi. */}
            <span className="flex-1 font-sans text-note font-semibold text-body">
              {line.name}
              {line.unitLabel && ` · ${line.unitLabel}`} × {line.qty}
            </span>
            {line.lineTotalCents !== null && (
              <span className="font-sans text-note font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
            )}
            {blocked.length > 1 && (
              <Button variant="ghost" size="xs" onClick={() => saveForLater([refOf(line)])}>
                {t.saveOne}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/* Sepetin tamamı kısıtlıysa "kalanını sipariş et" anlamsız — cümle onun yerini alır. */}
      {allBlocked && <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.allBlocked}</p>}
      {!allBlocked && !basket.ok && (
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">
          {t.belowMin.replace('{remaining}', formatPrice(remainingCents, locale)).replace('{min}', formatPrice(minBasketCents, locale))}
        </p>
      )}
      {canSplit && losesFreeShipping && (
        <p className="font-sans text-note leading-relaxed text-honey">
          {t.losesFreeShipping.replace('{threshold}', formatPrice(freeShippingCents, locale))}
        </p>
      )}

      {/* Üç çıkış TEK dilbilgisiyle: dolu → çerçeveli → hayalet. Ağırlık farkı sırayı söyler, ama
          üçü de aynı ailedendir. Üçüncüsü eskiden altı çizili düz metindi ve iki hapın yanında
          "üçüncü buton" gibi değil, "metne kaçmış link" gibi duruyordu. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {canSplit && (
          <Button size="sm" onClick={() => saveForLater(blocked.map(refOf))}>
            {t.splitCta}
          </Button>
        )}
        <Button variant="outlineOlive" size="sm" onClick={() => setPlaceOpen(true)}>
          {t.changeCta}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNoticeOpen(true)}>
          {t.noticeCta}
        </Button>
      </div>

      {placeOpen && <PlaceDialog locale={locale} onClose={() => setPlaceOpen(false)} />}
      {noticeOpen && <ZoneNoticeDialog locale={locale} postalCode={place.postalCode} onClose={() => setNoticeOpen(false)} />}
    </div>
  );
}
