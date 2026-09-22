'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import addressMessages from '@lezzet/i18n/customer/address';
import type { Address } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { AddressForm, toAddressFields, toFormInput, type AddressDefaults } from '@/components/customer/delivery/address-form';
import { Note } from '@/components/customer/phone-kit/note';
import { SettingsCard, SettingsDivider } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { addressLine, addressTitle } from '@lezzet/address';
import { errorText } from '@/lib/customer-error-text';
import { addAddressAction, deleteAddressAction, setBillingAddressAction, setDefaultAddressAction, updateAddressAction } from '../actions';
import { Card } from '@/components/customer/ui/card';
import { NewsStrip } from '@/components/customer/ui/toast';
import { useFlash } from '@/lib/use-flash.hook';
import { CardHead } from './account-cards';
import type { AccountCopy, Messages } from '../account-types';

/**
 * Silme onayı satırın içinde sorulur, çünkü ayrı pencere sıradan bir işi olduğundan ağır gösterir; varsayılan silinince yenisini
 * sunucu seçer. Telefon görünümü native adres kartını çizer: en çok iki eylem satırın sağında, fazlası metnin altında durur.
 */
interface AddressesCardProps {
  t: Messages;
  locale: Locale;
  addresses: Address[];
  /** Yeni adres formu hesabın adı ve numarasıyla dolu açılır; değeri `addressDefaultsOf` üretir, kart kuralı bilmez. */
  defaults: AddressDefaults | undefined;
  compact: boolean;
  /** Yalnız kurumsal hesapta: bireysel hesapta fatura rolünün karşılığı yok ve soru cevapsız kalırdı. */
  billing: boolean;
  /** Verilince kart native adres kartı olarak çizilir. */
  phoneCopy?: AccountCopy['addresses'];
}

/** "Adres silindi" haberinin ekranda kaldığı süre (ms). */
const DELETED_MS = 3000;

/** Native'in rol rozetiyle aynı ölçü. */
const BADGE = 'rounded-badge px-2 py-0.5 font-sans text-eyebrow-xs font-semibold tracking-normal';

export function AddressesCard({ t, locale, addresses, defaults, compact, billing, phoneCopy }: AddressesCardProps) {
  /** Tek seferde tek form: ekleme ile düzenleme aynı yerde açılır. */
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleted, showDeleted] = useFlash(DELETED_MS);

  const run = async (task: () => Promise<{ errorKey: string | null }>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    // Çağrı dönmezse genel cümleye düşer ve kart kilitli kalmaz.
    const { errorKey } = await task().catch(() => ({ errorKey: 'unexpected' }));
    setBusy(false);
    // Sunucu anahtar döner, cümle burada kurulur; bilinmeyen anahtar genel cümleye düşer.
    if (errorKey) {
      setError(errorText(t.errors, errorKey));
      return false;
    }
    setEditing(null);
    setConfirmDelete(null);
    return true;
  };

  const editForm = (address: Address) => (
    <AddressForm
      key={address.id}
      locale={locale}
      // Mobil webde form çekmecede açılır.
      compact={compact}
      initial={toFormInput(address)}
      billingChoice={billing}
      onCancel={() => setEditing(null)}
      // Telefonda silme native gibi düzenleme çekmecesinde ve onaysızdır; masaüstü satırdaki onayı korur.
      onDelete={
        phoneCopy
          ? async () => {
              if (await run(() => deleteAddressAction(address.id))) showDeleted();
            }
          : undefined
      }
      onSave={async (input) => {
        await run(async () => {
          const result = await updateAddressAction(address.id, toAddressFields(input), input.point);
          // Varsayılan işareti ayrı eylemdir: öbür adreslerin bayrağı da düşmek zorunda.
          if (!result.errorKey && input.makeDefault && !address.isDefault) await setDefaultAddressAction(address.id);
          // Kutuyu boşaltmak fatura işaretini kaldırmaz: başka adresi seçmek eskisini zaten düşürür.
          if (!result.errorKey && input.makeBilling && !address.isBilling) await setBillingAddressAction(address.id);
          return result;
        });
      }}
    />
  );

  const newForm = (
    <AddressForm
      locale={locale}
      compact={compact}
      defaults={defaults}
      billingChoice={billing}
      onCancel={() => setEditing(null)}
      onSave={async (input) => {
        // `isBilling` gövdeyle gitmez; kapı ekledikten sonra kendi yolundan işaretler.
        await run(() => addAddressAction({ ...toAddressFields(input), isDefault: input.makeDefault, isBilling: input.makeBilling }, input.point));
      }}
    />
  );

  if (phoneCopy) {
    // Metin eyleminin pasif hâli yok: bir yazma sürerken ikinci basış kesilir.
    const act = (task: () => Promise<{ errorKey: string | null }>) => {
      if (!busy) void run(task);
    };
    const add = <TextAction label={phoneCopy.add} onClick={() => setEditing('new')} />;
    return (
      <SettingsCard title={phoneCopy.title}>
        {/* Adres yokken çizilmez: olmayan rozetin açıklaması gürültüdür. */}
        {addresses.length > 0 && <p className="font-sans text-helper text-muted">{phoneCopy.note}</p>}
        {addresses.map((address, index) => {
          const title = addressTitle(address);
          const actions = [
            address.isDefault ? null : (
              <TextAction
                key="default"
                label={phoneCopy.makeDefault}
                ariaLabel={phoneCopy.makeDefaultLabel.replace('{label}', title)}
                onClick={() => act(() => setDefaultAddressAction(address.id))}
              />
            ),
            billing && !address.isBilling ? (
              <TextAction
                key="billing"
                label={phoneCopy.makeBilling}
                ariaLabel={phoneCopy.makeBillingLabel.replace('{label}', title)}
                onClick={() => act(() => setBillingAddressAction(address.id))}
              />
            ) : null,
            <TextAction key="edit" label={phoneCopy.edit} ariaLabel={phoneCopy.editLabel.replace('{label}', title)} onClick={() => setEditing(address.id)} />,
          ].filter((action) => action !== null);
          const inline = actions.length <= 2;
          const row = (
            <div className={inline ? 'flex items-center gap-2.5' : 'flex flex-col gap-2'}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-note font-bold text-ink">{title}</span>
                  {address.isDefault && <span className={`${BADGE} bg-olive-bg text-olive-dark`}>{phoneCopy.default}</span>}
                  {/* İki rol ayrı rozet ve ayrı tonda: bir adres ikisi birden olabilir. */}
                  {billing && address.isBilling && <span className={`${BADGE} bg-sand-300 text-ink`}>{phoneCopy.billing}</span>}
                </div>
                <span className="font-sans text-body-sm text-muted">{addressLine(address)}</span>
              </div>
              {/* Eylem bölünmez: sığmayan eylem metninin ortasından kırılmaz, bütün olarak alt satıra iner. */}
              <div
                className={[
                  '[&>*]:whitespace-nowrap',
                  inline ? 'flex flex-none items-center gap-2.5' : 'flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2',
                ].join(' ')}
              >
                {actions}
              </div>
            </div>
          );
          return (
            <div key={address.id}>
              {index === 0 ? row : <SettingsDivider>{row}</SettingsDivider>}
              {editing === address.id && editForm(address)}
            </div>
          );
        })}
        {error && <Note tone="terracotta" description={error} />}
        {addresses.length > 0 ? <SettingsDivider>{add}</SettingsDivider> : <span className="self-start">{add}</span>}
        {editing === 'new' && newForm}
        {deleted && <NewsStrip message={addressMessages[locale].form.deleted} placement="bottom" compact />}
      </SettingsCard>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead
        title={t.addressesTitle}
        compact={compact}
        note={t.addressesNote}
        action={
          editing === 'new' ? undefined : (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark"
            >
              {t.addressAdd}
            </button>
          )
        }
      />

      {addresses.length === 0 && editing !== 'new' && <span className="font-sans text-note text-muted">{t.addressEmpty}</span>}

      {addresses.map((address) =>
        editing === address.id ? (
          editForm(address)
        ) : (
          <div
            key={address.id}
            className={[
              'flex flex-col gap-2 rounded-soft px-4 py-3.5',
              // Varsayılan adres zeytin çerçeveli: teslimat yeri göstergesini o besler.
              address.isDefault ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-sans text-body-sm font-bold text-ink">
                {addressTitle(address)}
                {address.isDefault && ` · ${t.addressDefault}`}
                {/* İki rol ayrı yazılır: bir adres ikisi birden olabilir. */}
                {billing && address.isBilling && ` · ${t.addressBilling}`}
              </span>
              <span className="truncate font-sans text-note text-body">
                {address.line1}, {address.postalCode} {address.city}
              </span>
            </div>

            {confirmDelete === address.id ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-sans text-note font-semibold text-terracotta">{t.addressDeleteConfirm}</span>
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => void run(() => deleteAddressAction(address.id))}>
                  {t.addressDeleteYes}
                </Button>
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => setConfirmDelete(null)}>
                  {t.cancel}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 font-sans text-note text-muted">
                {/* Varsayılan olmayanda çıkar; varsayılana konan düğme hiçbir şey yapmazdı. */}
                {!address.isDefault && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setDefaultAddressAction(address.id))}
                    className="cursor-pointer font-bold text-olive hover:text-olive-dark disabled:cursor-progress"
                  >
                    {t.addressMakeDefault}
                  </button>
                )}
                {/* Yalnız kurumsal hesapta ve fatura adresi olmayanda; varsayılanı düşürmez, ayrı eylemdir. */}
                {billing && !address.isBilling && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setBillingAddressAction(address.id))}
                    className="cursor-pointer font-bold text-olive hover:text-olive-dark disabled:cursor-progress"
                  >
                    {t.addressMakeBilling}
                  </button>
                )}
                <button type="button" onClick={() => setEditing(address.id)} className="cursor-pointer hover:text-olive">
                  {t.edit}
                </button>
                <button type="button" onClick={() => setConfirmDelete(address.id)} className="cursor-pointer hover:text-terracotta">
                  {t.addressDelete}
                </button>
              </div>
            )}
          </div>
        ),
      )}

      {editing === 'new' && newForm}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
    </Card>
  );
}
