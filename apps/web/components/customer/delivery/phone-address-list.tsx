import { addressContact, addressLine, addressTitle } from '@lezzet/address';
import type { Locale } from '@lezzet/i18n';
import type { Address, CheckoutPickup } from '@lezzet/types';
import { OptionRow } from '@/components/customer/phone-kit/option-row';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import messages from '@lezzet/i18n/customer/address';

/*
  Adres seçicinin mobil web listesi, native adres çekmecesiyle aynı: kartın gövdesi seçer, yanındaki "Düzenle" formu açar. Depo müşterinin
  adresi olmadığı için onun kartında düzenleme yoktur.
*/

interface PhoneAddressListProps {
  locale: Locale;
  /** `null` = henüz okunmadı. */
  addresses: Address[] | null;
  failed: boolean;
  /** Seçili çizilecek adres; depo seçiliyken `null`, çünkü o zaman varsayılan adres yalnız fatura adresidir. */
  selectedId: string | null;
  pickup: CheckoutPickup | null;
  error: string | null;
  onPick: (addressId: string) => void;
  onPickPickup: (warehouseId: string) => void;
  onEdit: (address: Address) => void;
  onAdd: () => void;
}

export function PhoneAddressList({
  locale,
  addresses,
  failed,
  selectedId,
  pickup,
  error,
  onPick,
  onPickPickup,
  onEdit,
  onAdd,
}: PhoneAddressListProps) {
  const t = messages[locale];
  const loading = !failed && addresses === null;
  const status = failed ? t.failed : loading ? t.loading : addresses?.length === 0 ? t.empty : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="font-sans text-body-sm leading-[1.6] text-body">{t.pickerHint}</p>
      {status !== null && <p className={`font-sans text-body-sm leading-[1.6] ${failed ? 'text-error' : 'text-body'}`}>{status}</p>}
      {addresses?.map((row) => {
        const selected = row.id === selectedId;
        return (
          <OptionRow
            key={row.id}
            label={addressTitle(row)}
            badge={selected ? t.selectedBadge : undefined}
            description={addressLine(row)}
            detail={addressContact(row) ?? undefined}
            selected={selected}
            onClick={() => onPick(row.id)}
            action={<TextAction label={t.edit} ariaLabel={`${t.edit} · ${addressTitle(row)}`} onClick={() => onEdit(row)} />}
            testId={`address-pick-${row.id}`}
          />
        );
      })}
      {/* Depo kartı ve ekleme bağlantısı liste gelince çizilir, yoksa gelen adresler onları aşağı iterdi. */}
      {!loading && pickup?.warehouses.map((warehouse) => (
        <OptionRow
          key={warehouse.id}
          label={t.pickupOption}
          badge={warehouse.id === pickup.selectedWarehouseId ? t.selectedBadge : undefined}
          description={`${warehouse.name} · ${warehouse.addressLine}`}
          selected={warehouse.id === pickup.selectedWarehouseId}
          onClick={() => onPickPickup(warehouse.id)}
          testId={`address-pick-warehouse-${warehouse.id}`}
        />
      ))}
      {error !== null && <p className="font-sans text-body-sm leading-[1.6] text-error">{error}</p>}
      {!loading && (
        <span className="self-start">
          <TextAction label={t.addNew} onClick={onAdd} />
        </span>
      )}
    </div>
  );
}
