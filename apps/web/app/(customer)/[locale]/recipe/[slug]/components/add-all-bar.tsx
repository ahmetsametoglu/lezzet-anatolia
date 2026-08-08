'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontRecipeItem } from '@/lib/storefront/storefront-types';
import { buyableItems, type Messages } from '../recipe-types';

/**
 * **"Tüm malzemeleri sepete ekle"** — tarifin tek toplu eylemi (08.24).
 *
 * ── SEPETE YENİ KAVRAM GİRMEDİ ──────────────────────────────────────────────
 * Tarif bir satış birimi DEĞİL: `addMany` var olan kalemleri sepete taşıyor ve aynı varyant zaten
 * sepetteyse adet artıyor (`mergeEntry`). Tarife özel bir sepet satırı yazılsaydı, tarif bir gün
 * faturaya kalem olarak düşmeye çalışırdı — oysa siparişte yalnız ürünler var.
 *
 * ── SAYI EKLENENİ SAYAR, TARİFİN MALZEMESİNİ DEĞİL ──────────────────────────
 * Tasarımın cümlesi *"3 malzeme sepete eklendi ✓"*. Dört malzemeden biri tükendiyse ÜÇ der:
 * sepete girmeyen bir kalemi saymak, müşteriye sepetinde olmayan bir şeyi söylemektir. Eleme
 * `buyableItems`ta, yani düğmenin pasifliğiyle ve gönderilen listeyle AYNI yerde.
 *
 * ── SEPETE GİDİLMEZ ─────────────────────────────────────────────────────────
 * Tekrar sipariş düğmesi sepete yönlendiriyor (`reorder-button.tsx`) çünkü orada niyet zaten
 * "siparişi tekrarla" — akış tamamlanıyor. Burada müşteri bir tarif OKUYOR; sayfadan koparmak,
 * hazırlanışı yarıda kesmek olurdu. Onay satırda kalır, sepet rozeti başlıkta zaten artar.
 */
interface AddAllBarProps {
  items: readonly StorefrontRecipeItem[];
  totalCents: number | null;
  locale: Locale;
  t: Messages;
  /** Mobil web: tek satırlık kart (toplam solda, düğme sağda) — tasarımın dar ekran düzeni. */
  compact?: boolean;
}

export function AddAllBar({ items, totalCents, locale, t, compact = false }: AddAllBarProps) {
  const { addMany } = useCart();
  const [added, setAdded] = useState<number | null>(null);
  const buyable = buyableItems(items);

  const onAdd = () => {
    if (buyable.length === 0) return;
    addMany(
      buyable.map((item) => ({ kind: 'variant' as const, variantId: item.variantId, qty: item.qty, stockId: item.stockId })),
      // Eklenemeyen kalem sayısı sepete geçer: uyarıyı orada tek bir yer karşılıyor (`addSkipped`),
      // her yüzeyin kendi cümlesini kurması aynı bilginin iki farklı yazılışı olurdu.
      items.length - buyable.length,
    );
    setAdded(buyable.length);
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2.5 rounded-card border border-sand-200 bg-card px-4 py-3">
          <div className="flex flex-col">
            <span className="font-sans text-micro text-muted">{t.total}</span>
            {/* Toplam yoksa çizgi: "0,00 €" alınamayan bir tarifi bedava gösterirdi. */}
            <span className="font-sans text-h2-sm font-bold text-ink">
              {totalCents !== null ? formatPrice(totalCents, locale) : '—'}
            </span>
          </div>
          <Button size="sm" disabled={buyable.length === 0} onClick={onAdd} className="flex-none">
            {t.addAllShort}
          </Button>
        </div>
        {added !== null && <Confirmation count={added} t={t} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t-[1.5px] border-dashed border-sand-400 pt-3.5">
      <div className="flex items-center justify-between">
        <span className="font-sans text-body-sm font-semibold text-ink">{t.total}</span>
        <span className="font-sans text-h2-sm font-bold text-ink">
          {totalCents !== null ? formatPrice(totalCents, locale) : '—'}
        </span>
      </div>
      <Button fullWidth disabled={buyable.length === 0} onClick={onAdd}>
        {t.addAll}
      </Button>
      {added !== null && <Confirmation count={added} t={t} />}
      {/* Not her hâlde durur (tasarım): tükenme kuralını ve "fiyat hesabınıza göre" sözünü
          müşterinin ÖNCEDEN okuması gerekiyor — tükenme yaşandıktan sonra açıklamak geç olurdu. */}
      <span className="font-sans text-micro leading-relaxed text-muted">{t.note}</span>
    </div>
  );
}

function Confirmation({ count, t }: { count: number; t: Messages }) {
  return (
    <span role="status" className="rounded-soft bg-olive-bg px-3 py-2 font-sans text-note font-semibold text-olive-dark">
      {t.added.replace('{n}', String(count))}
    </span>
  );
}
