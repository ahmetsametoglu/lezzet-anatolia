'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Address } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { AddressForm, type NewAddressInput } from '@/components/customer/delivery/address-form';
import { addAddressAction, deleteAddressAction, setDefaultAddressAction, updateAddressAction } from '../actions';
import { Card, CardHead } from './account-cards';
import type { Messages } from '../account-types';

/**
 * Adresler kartı — ekle · düzenle · varsayılan yap · sil.
 *
 * **Form checkout'unkiyle AYNI bileşen** (`AddressForm`): alan sırası, `autoComplete` jetonları ve
 * posta kodu doğrulaması tek yerde yaşıyor. İkinci bir form yazmak, müşterinin aynı adresi iki
 * yerde iki farklı biçimde girmesi demekti (CLAUDE.md §1).
 *
 * **Silme onay ister** (tasarımın sözleşmesi) ve onay AYRI BİR PENCEREDE sorulmaz: soru satırın
 * kendi içinde açılır. Adres silmek geri alınamaz ama sıradan bir iş — modal açmak onu olduğundan
 * ağır gösterir.
 *
 * **Varsayılan adres silinirse en yeni adres varsayılan olur** — kararı sunucu verir
 * (`deleteAddressAction`), ekran onu bilmez. Boşta bırakmak teslimat yeri göstergesini sessizce
 * kaybettirirdi.
 */
interface AddressesCardProps {
  t: Messages;
  locale: Locale;
  addresses: Address[];
  compact: boolean;
}

/**
 * Formun çıktısı → adres alanları. Dönüşüm AÇIK yazılır (yayma ile değil): `NewAddressInput`
 * formun kendi sözleşmesi ve içinde `makeDefault` var — adres tablosunda öyle bir kolon yok,
 * `is_default` var ve onu ayrı bir eylem yönetiyor. Yayarak geçmek, kapının ayıklamasına güvenmek
 * demekti; iki taraf da doğru olsun.
 */
function toAddressFields(input: NewAddressInput) {
  return {
    label: input.label ?? null,
    recipient: input.recipient ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    postalCode: input.postalCode,
    city: input.city,
    phone: input.phone ?? null,
    country: 'FR' as const,
  };
}

/** DB satırı → formun beklediği şekil. Düzenlemede alanlar DOLU açılır; boş form yeniden yazdırırdı. */
function toFormInput(address: Address): NewAddressInput {
  return {
    label: address.label ?? undefined,
    recipient: address.recipient ?? undefined,
    line1: address.line1,
    line2: address.line2 ?? undefined,
    postalCode: address.postalCode,
    city: address.city,
    phone: address.phone ?? undefined,
    makeDefault: address.isDefault,
  };
}

export function AddressesCard({ t, locale, addresses, compact }: AddressesCardProps) {
  /** Tek seferde tek form: ekleme ile düzenleme aynı yerde açılır, ikisi birden açık kalamaz. */
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const { error: failure } = await task();
    setBusy(false);
    if (failure) return setError(failure);
    setEditing(null);
    setConfirmDelete(null);
  };

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
          <AddressForm
            key={address.id}
            copy={t.addressForm}
            locale={locale}
            initial={toFormInput(address)}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await run(async () => {
                const result = await updateAddressAction(address.id, toAddressFields(input));
                // Varsayılan işareti AYRI eylemdir: tek satırı güncellemek yetmiyor, öbürlerinin
                // bayrağı düşmek zorunda (tek varsayılan kuralı).
                if (!result.error && input.makeDefault && !address.isDefault) await setDefaultAddressAction(address.id);
                return result;
              });
            }}
          />
        ) : (
          <div
            key={address.id}
            className={[
              'flex flex-col gap-2 rounded-soft px-4 py-3.5',
              // Varsayılan adres ZEYTİN çerçeveli (tasarım): teslimat yeri göstergesini o besliyor.
              address.isDefault ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-sans text-body-sm font-bold text-ink">
                {address.label || address.city}
                {address.isDefault && ` · ${t.addressDefault}`}
              </span>
              <span className="truncate font-sans text-note text-body">
                {address.line1}, {address.postalCode} {address.city}
              </span>
            </div>

            {confirmDelete === address.id ? (
              /* Onay SATIRIN İÇİNDE: ayrı bir pencere, sıradan bir işi olduğundan ağır gösterirdi. */
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
                {/* "Varsayılan yap" yalnız varsayılan OLMAYANDA çıkar: zaten varsayılan olana
                    basılabilir bir düğme koymak, hiçbir şey yapmayan bir eylem göstermektir. */}
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

      {editing === 'new' && (
        <AddressForm
          copy={t.addressForm}
          locale={locale}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await run(() => addAddressAction({ ...toAddressFields(input), isDefault: input.makeDefault }));
          }}
        />
      )}

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
    </Card>
  );
}
