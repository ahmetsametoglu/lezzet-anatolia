'use client';

import { FilterChip } from '@/components/customer/ui/filter-controls';
import { Icon } from '@/components/customer/ui/icons';
import type { CatalogHref } from '@/app/(customer)/[locale]/catalog/catalog-types';
import { shippableChipOf } from '@/lib/delivery/place-filter';
import type { PlaceMode } from '@/lib/delivery/read-place';
import { useDeliveryPlace } from './place-context';

/**
 * **"Adresime gönderilebilir" çipi** — üç hâli tek yerde (08.27; kullanıcı bulgusu 08.08).
 *
 * Kuralın kendisi `lib/delivery/place-filter.ts`te ve künyesi orada: çip adres hakkında bir soru
 * soruyor, o hâlde cevabı da adrese bağlı olmalı. Burada yalnız o kararın ÇİZİMİ var.
 *
 * ── `ask` — posta kodu yok ──────────────────────────────────────────────────
 * Çip süzgeç değil, **davet** olur: tıklayınca BAŞLIKTAKİ yer sorusu açılır (masaüstünde panel,
 * mobil webde çekmece — yer tek yerden sorulur, kullanıcı kararı 14.09). Eskiden burada sessizce
 * "kargolanabilir mi" süzgeci koşuyordu ve kullanıcının gördüğü hâl buydu — kod girilmemişken çip
 * duruyor, tıklanıyor, hiçbir şey değişmiyordu. Çipi tümden gizlemek de yanlış olurdu: müşteriye
 * adresini sormanın en doğal yeri, adres hakkında soru soran denetimin kendisi.
 *
 * Kesik çizgili kenar `PlaceChip`in "yer seçilmedi" hâliyle aynı dili konuşuyor — iki denetim aynı
 * eksiği aynı biçimde anlatır.
 *
 * ── `hidden` — bölge içi ────────────────────────────────────────────────────
 * Rota aracı gidiyor, soğuk zincir dâhil her aktif ürün ulaşıyor: süzecek şey yok. Eleyecek şeyi
 * olmayan bir denetim çizmek, müşteriye işe yaramayan bir düğme sunmaktır.
 *
 * ── `filter` — bölge dışı ───────────────────────────────────────────────────
 * Yalnız kargolanabilirler ulaşıyor; çip gerçekten süzer. Bugüne dek doğru olan tek hâl buydu.
 */
interface ShippableChipProps {
  mode: PlaceMode;
  label: string;
  /** Yer sorulacağı hâlde çipin metni — "adresinizi girin" gibi bir davet (çağıranın sözlüğünden). */
  askLabel: string;
  href: CatalogHref;
  active: boolean;
  compact?: boolean;
}

export function ShippableChip({ mode, label, askLabel, href, active, compact = false }: ShippableChipProps) {
  const { setPanelOpen } = useDeliveryPlace();
  const kind = shippableChipOf(mode);

  if (kind === 'hidden') return null;

  if (kind === 'ask') {
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={[
          'inline-flex cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-sand-400 bg-card font-sans font-bold text-muted transition-colors hover:border-olive hover:text-olive',
          compact ? 'px-3 py-1.5 text-micro' : 'px-4 py-2 text-note',
        ].join(' ')}
      >
        <Icon name="pin" size={compact ? 12 : 14} />
        {askLabel}
      </button>
    );
  }

  return <FilterChip label={label} href={href} active={active} tone="place" size="control" compact={compact} icon="pin" />;
}
