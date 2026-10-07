'use client';

import type { Locale } from '@lezzet/i18n';
import homeMessages from '@lezzet/i18n/customer/home';
import { focusRingClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { placeLineOf } from '@lezzet/address';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Teslimat yerinin göstergesi: masaüstünde başlıktaki hap paneli açar, telefonda vitrin başlığının konum satırı çekmeceyi açar. Yazılan
 * ad bölgemizin değil yerin adıdır (`placeName`), çünkü müşterinin zihninde iç bölge adı değil şehir vardır.
 */
interface PlaceChipProps {
  locale: Locale;
  /** Telefon vitrin başlığının konum satırı. */
  line?: boolean;
}

export function PlaceChip({ locale, line = false }: PlaceChipProps) {
  const t = messages[locale];
  const { place, address, updating, panelOpen, setPanelOpen, pickup } = useDeliveryPlace();
  // Gel-al seçiliyken hap depoyu söyler: sepet o depoya göre okunuyor, adres yalnız fatura.
  const pickedWarehouse = pickup?.warehouses.find((w) => w.id === pickup.selectedWarehouseId) ?? null;

  // Yer adı yoksa bölge adı yazılır, ki referansta olmayan ama bölgemizde duran kodda da bir ad görünsün.
  const placeLabel = place?.placeName ?? place?.zoneName ?? null;
  const label = pickedWarehouse
    ? pickedWarehouse.name
    : address
    ? `${address.label || address.city} · ${address.postalCode}`
    : place
      ? placeLabel
        ? `${place.postalCode} ${placeLabel}`
        : place.postalCode
      : t.empty;
  // Teslim şekli yalnız yer biliniyorken yazılır — boş hapta söylenecek bir şey yok.
  const channel = pickedWarehouse ? t.channelPickup : place ? (place.inRoute ? t.channelDoor : t.channelShip) : null;

  if (line) {
    // Yer değişirken iskelet çizilir, çünkü eski yeri göstermek cevabın alınmadığı izlenimini verir; satırın biçimi native'le ortaktır.
    const header = homeMessages[locale].header;
    // Şehir seçili adresin kendisinden; misafirde yalnız yerin adı, çünkü bölge adı iç rota adıdır ve başka şehri gösterebilir.
    const zip = address
      ? { postalCode: address.postalCode, placeName: address.city }
      : place
        ? { postalCode: place.postalCode, placeName: place.placeName }
        : null;
    const postal = pickedWarehouse
      ? pickedWarehouse.name
      : zip
        ? placeLineOf({ label: address?.label, ...zip }).toLocaleUpperCase(locale)
        : null;
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label={postal === null ? header.locationEmptyLabel : header.locationLabel.replace('{postal}', postal)}
        className={`w-max max-w-full cursor-pointer truncate text-left font-sans text-micro leading-normal font-bold tracking-[0.08em] text-terracotta transition-colors hover:text-terracotta-bright ${focusRingClass}`}
      >
        {updating ? (
          <Skeleton className="inline-block h-3 w-32 rounded-full align-middle" />
        ) : postal === null ? (
          header.locationEmpty
        ) : (
          header.location.replace('{postal}', postal)
        )}
      </button>
    );
  }

  // Yer değişirken iskelet hapın boyunda durur, ki başlık zıplamasın.
  if (updating) {
    return (
      <span aria-hidden className="block h-10.5 w-[200px] flex-none overflow-hidden rounded-pill">
        <Skeleton className="h-full w-full" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(!panelOpen)}
      aria-expanded={panelOpen}
      className={[
        'flex max-w-full flex-none cursor-pointer items-center gap-2 rounded-pill border border-olive-edge bg-olive-bg px-3.75 py-2.5 font-sans text-note font-bold transition-colors hover:border-olive',
        focusRingClass,
      ].join(' ')}
    >
      <Icon name="pin" size={16} className="flex-none text-olive-dark" />
      <span className={['truncate', place || address ? 'text-ink' : 'text-body'].join(' ')}>{label}</span>
      {channel && <span className="flex-none font-sans text-field-label font-semibold whitespace-nowrap text-olive-dark">· {channel}</span>}
      <span aria-hidden className="text-micro font-semibold text-muted">
        ▾
      </span>
    </button>
  );
}
