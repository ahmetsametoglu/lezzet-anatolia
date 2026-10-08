import type { IconName } from '@lezzet/design-tokens/icons';
import type { LocalizedCopy } from '@lezzet/i18n';
import type catalogMessages from '@lezzet/i18n/customer/catalog';
import { CATALOG_SORTS, type CatalogSort } from '@lezzet/types';
import { ToggleSwitch } from '@/components/customer/phone-kit/toggle-switch';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';

/*
  Native katalogun sıralama sayfasının web telefon ikizi: seçenekler şemadan türer (`CATALOG_SORTS`) ve seçim anında uygulanıp çekmeceyi
  kapatır, bu yüzden "Temizle"/"Göster" yok. "Sadece indirimliler" iki yüzeyde aynı satırdır; etiketi ortak katalog sözlüğünden gelir.
*/

type CatalogCopy = LocalizedCopy<typeof catalogMessages>;

/**
 * Sıralama satırlarının ikonları — native'in kararıyla aynı (`SORT_ICONS`): iki fiyat satırı para ikonunu
 * paylaşır, yönü etiket söyler; "Önerilen" bilerek ikonsuz (sette onu anlatan çizim yok), yuva yine ayrılır.
 */
const SORT_ICONS: Partial<Record<CatalogSort, IconName>> = {
  priceAsc: 'money',
  priceDesc: 'money',
};

interface CatalogSortSheetProps {
  copy: CatalogCopy;
  sort: CatalogSort;
  onlyOffers: boolean;
  closeLabel: string;
  onSort: (sort: CatalogSort) => void;
  onToggleOffers: () => void;
  /** Kimliği sabit olmalı — `Dialog`un odak tuzağı kapanma işlevine bağlı. */
  onClose: () => void;
}

export function CatalogSortSheet({ copy, sort, onlyOffers, closeLabel, onSort, onToggleOffers, onClose }: CatalogSortSheetProps) {
  return (
    <Dialog placement="sheet" title={copy.filter.title} closeLabel={closeLabel} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {CATALOG_SORTS.map((option) => {
          const selected = sort === option;
          const icon = SORT_ICONS[option];
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onSort(option)}
              className={[
                'flex cursor-pointer items-center justify-between rounded-control border-[1.5px] px-4 py-3.5 text-left transition-[scale,border-color] active:scale-[0.98]',
                selected ? 'border-ink bg-sand-150' : 'border-sand-400 hover:border-ink',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                <span className="flex w-4.25 justify-center text-ink">{icon !== undefined && <MobileIcon name={icon} size={17} />}</span>
                <span className="font-sans text-control text-ink">{copy.sort[option]}</span>
              </span>
              {selected && (
                <span aria-hidden className="font-sans text-step-sm text-olive-dark">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2.5 px-0.5 py-1">
        <span className="font-sans text-body-sm leading-[1.6] font-semibold text-ink">{copy.filter.offers}</span>
        <ToggleSwitch checked={onlyOffers} onChange={onToggleOffers} label={copy.filter.offers} />
      </div>
    </Dialog>
  );
}
