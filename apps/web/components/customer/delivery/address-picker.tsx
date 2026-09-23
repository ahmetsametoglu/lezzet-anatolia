'use client';

import { useState } from 'react';
import { addressTitle } from '@lezzet/address';
import type { Address } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { Icon } from '@/components/customer/ui/icons';
import { useToast } from '@/components/customer/ui/toast';
import { useAccount } from '@/components/customer/account/account-context';
import { errorText } from '@/lib/customer-error-text';
import { AddressForm, addressDefaultsOf, toAddressFields, toFormInput } from './address-form';
import { useDeliveryPlace } from './place-context';
import { useMyAddresses } from './use-my-addresses.hook';
import messages from '@lezzet/i18n/customer/address';
import placeMessages from './place-messages.json';

/**
 * Teslimat adresi seçici: sepet panelinden ve başlıktaki yer panelinden aynı soru için açılır, bu yüzden tek bileşendir.
 * Seçmek varsayılan yapmaktır (`Address.isDefault`), çünkü ikinci bir "seçili adres" alanı aynı gerçeğin iki kaynağı olurdu.
 */
interface AddressPickerDialogProps {
  locale: Locale;
  onClose: () => void;
  /** Mobil web forku — çekmece ve tek sütun (`Dialog placement`, `AddressForm compact`). */
  compact?: boolean;
  /** Doğrudan formla açılış: sepet panelinin "+ Adres ekle"si ve "Düzenle"si. */
  initialMode?: 'list' | 'new' | 'edit';
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; address: Address };

export function AddressPickerDialog({ locale, onClose, compact = false, initialMode = 'list' }: AddressPickerDialogProps) {
  const t = messages[locale];
  const account = useAccount();
  const notify = useToast();
  const { address: current, saveAddress, pickup, selectPickup } = useDeliveryPlace();
  const pickedWarehouseId = pickup?.selectedWarehouseId ?? null;
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode === 'new' ? { kind: 'new' } : { kind: 'list' });
  // "Düzenle" ile açıldıysa form SEÇİLİ adresin tam satırıyla açılır (alıcı, telefon burada).
  // `current`/`initialMode` yalnız AÇILIŞTA okunur: seçici açıkken seçim değişince form yeniden kurulmaz.
  const { addresses, failed, busy, choose } = useMyAddresses((rows) => {
    if (initialMode !== 'edit' || !current) return;
    const row = rows.find((a) => a.id === current.id);
    if (row) setMode({ kind: 'edit', address: row });
  });

  const pick = async (id: string) => {
    setError(null);
    if (!(await choose(id))) return setError(errorText(t.errors, null));
    onClose();
  };
  const pickPickup = async (id: string) => {
    setError(null);
    if (!(await selectPickup(id))) return setError(errorText(t.errors, null));
    onClose();
  };

  const save = async (id: string | null, input: Parameters<typeof toAddressFields>[0]) => {
    setError(null);
    /* Çağrı dönmediyse (sunucuya ulaşılamadı, bağlantı koptu) genel cümleye düşer: ret yutulmaz, müşteriye söylenir. */
    const result = await saveAddress({
      id,
      fields: toAddressFields(input),
      // Yeni adres seçili olur (kaydetmek = seçmek); düzenlenen adres zaten seçiliyse öyle kalır.
      makeDefault: id === null || id === current?.id,
      point: input.point,
    }).catch(() => ({ ok: false as const, errorKey: null }));
    if (!result.ok) return setError(errorText(t.errors, result.errorKey));
    // Yeni adres için iş bitti: müşteri adresi oraya göndermek için ekledi, listeye dönmesine
    // gerek yok. Düzenlemede de aynı — seçim değişmedi, yalnız satır güncellendi.
    if (id === null) notify(t.savedToast.replace('{name}', addressTitle(result.address)));
    onClose();
  };

  const title = mode.kind === 'new' ? t.newTitle : mode.kind === 'edit' ? t.editTitle : t.pickerTitle;

  if (mode.kind !== 'list') {
    const formProps = {
      locale,
      compact,
      frame: false,
      defaultChoice: false,
      // Hata FORMUN içinde çizilir: çekmecede (mobil web) pencerenin kendi satırı hiç çizilmiyordu.
      error,
      onCancel: () => (initialMode === 'list' ? setMode({ kind: 'list' }) : onClose()),
    };
    // Mobil webde form KENDİ çekmecesini açıyor (`AddressForm compact` künyesi); ikinci bir kabuk
    // çizilmez. Masaüstünde form bu pencerenin içinde durur.
    const form =
      mode.kind === 'new' ? (
        <AddressForm {...formProps} defaults={addressDefaultsOf(account ? { name: account.name, phone: null } : null)} onSave={(input) => save(null, input)} />
      ) : (
        <AddressForm {...formProps} initial={toFormInput(mode.address)} onSave={(input) => save(mode.address.id, input)} />
      );
    if (compact) return form;
    return (
      <Dialog title={title} description={mode.kind === 'new' ? t.newBody : undefined} closeLabel={placeMessages[locale].close} onClose={onClose} maxWidth={580}>
        {form}
      </Dialog>
    );
  }

  return (
    <Dialog title={title} closeLabel={placeMessages[locale].close} onClose={onClose} maxWidth={460} placement={compact ? 'sheet' : 'center'}>
      <p className="font-sans text-note leading-relaxed text-body">{t.pickerBody}</p>

      {failed && <span className="font-sans text-note font-semibold text-terracotta">{t.failed}</span>}
      {!failed && addresses === null && <span className="font-sans text-note text-muted">{t.loading}</span>}
      {addresses !== null && addresses.length === 0 && <span className="font-sans text-note text-muted">{t.empty}</span>}

      {addresses !== null && addresses.length > 0 && (
        <div className="flex flex-col gap-2">
          {addresses.map((row) => {
            // Depo seçiliyken varsayılan adres fatura adresidir, seçili çizilmez — tek seçim, tek çerçeve.
            const selected = pickedWarehouseId === null && row.id === current?.id;
            return (
              <div
                key={row.id}
                className={[
                  'flex items-start gap-3 rounded-soft px-3.5 py-3',
                  // Seçili adres ZEYTİN çerçeveli — hesap sayfasının varsayılan kartıyla aynı dil.
                  selected ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
                ].join(' ')}
              >
                {/* Satırın gövdesi bir DÜĞME: seçmek için tıklanır. Düzenle ayrı bir düğme ve
                    gövdenin dışında — düğme içine düğme konamaz (geçersiz HTML, klavye de bozulur). */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(row.id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left disabled:cursor-progress"
                >
                  <span className="truncate font-sans text-body-sm font-bold text-ink">
                    {addressTitle(row)}
                    {selected && <span className="font-semibold text-olive-dark"> · {t.selected}</span>}
                  </span>
                  <span className="truncate font-sans text-note text-body">{row.line1}</span>
                  <span className="font-sans text-note text-body">
                    {row.postalCode} {row.city}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMode({ kind: 'edit', address: row })}
                  className="flex-none cursor-pointer font-sans text-note font-semibold text-olive underline hover:text-olive-dark disabled:cursor-progress"
                >
                  {t.edit}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Gel-al (izinli müşteri): depo bir adres gibi seçilir — sepet ve ödeme o depoya göre kurulur, adres fatura adresi
          olarak kalır. Teklif sunucudan (`pickup`), izinsiz müşteride blok hiç yoktur. */}
      {pickup && (
        <div className="flex flex-col gap-2">
          {pickup.warehouses.map((warehouse) => {
            const selected = warehouse.id === pickedWarehouseId;
            return (
              <button
                key={warehouse.id}
                type="button"
                disabled={busy}
                onClick={() => void pickPickup(warehouse.id)}
                aria-pressed={selected}
                className={[
                  'flex cursor-pointer flex-col gap-0.5 rounded-soft px-3.5 py-3 text-left disabled:cursor-progress',
                  selected ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
                ].join(' ')}
                data-testid={`address-pick-warehouse-${warehouse.id}`}
              >
                <span className="flex items-center gap-1.5 font-sans text-body-sm font-bold text-ink">
                  <Icon name="pin" size={14} />
                  {t.pickupOption}
                  {selected && <span className="font-semibold text-olive-dark"> · {t.selected}</span>}
                </span>
                <span className="font-sans text-note text-body">
                  {warehouse.name} · {warehouse.addressLine}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-3">
        <Button variant="secondary" size="sm" compact={compact} disabled={busy} onClick={() => setMode({ kind: 'new' })}>
          {t.add}
        </Button>
        <Link href="/account" className="cursor-pointer font-sans text-note font-semibold text-muted hover:text-olive">
          {t.manage}
        </Link>
      </div>
    </Dialog>
  );
}
