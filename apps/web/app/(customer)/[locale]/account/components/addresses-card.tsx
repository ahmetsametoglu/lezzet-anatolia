'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Address } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { AddressForm, toAddressFields, toFormInput, type AddressDefaults } from '@/components/customer/delivery/address-form';
import { Note } from '@/components/customer/phone-kit/note';
import { SettingsCard, SettingsDivider } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { addressLine } from '@/lib/address/address-line';
import { errorText } from '@/lib/customer-error-text';
import { addAddressAction, deleteAddressAction, setBillingAddressAction, setDefaultAddressAction, updateAddressAction } from '../actions';
import { Card } from '@/components/customer/ui/card';
import { CardHead } from './account-cards';
import type { AccountCopy, Messages } from '../account-types';

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
 *
 * **Telefon görünümü native'in adres kartını çizer** (14.09, `phoneCopy` verilince): kum kartın
 * içinde satırlar kesikli ayraçla ayrılır; etiket · rol rozetleri · adres satırı · metin eylemleri.
 * Eylemler native'in kısa adlarıyla ve native'in kuralıyla dizilir: en çok iki eylem satırın
 * sağında, üç ve fazlası metnin ALTINDA sağa yaslı şeritte (native 09.09 ölçümü: üçüncü eylem adres
 * satırını kelime ortasından bölüyordu). Silme web'in eki — native'de adres silinmiyor; onayı yine
 * satırın içinde.
 */
interface AddressesCardProps {
  t: Messages;
  locale: Locale;
  addresses: Address[];
  /**
   * Hesabın adı ve numarası — YENİ adres formu bununla dolu açılır (kullanıcı kararı 22.08).
   * Kartın kendisi kuralı bilmez, `addressDefaultsOf` üretir ve sayfa geçirir.
   */
  defaults: AddressDefaults | undefined;
  compact: boolean;
  /**
   * **Fatura adresi rolü gösterilsin mi** (kullanıcı kararı 08.09) — yalnız KURUMSAL hesapta `true`.
   * Bireysel hesapta bu kavramın karşılığı yok; rozeti ve "fatura adresim yap" eylemini orada
   * göstermek müşteriye cevabı olmayan bir soru sormak olurdu. Ayrım çağıranda (`account.company`),
   * kart hesabın türünü bilmez. Native hesap ekranıyla aynı kural (`address-card.tsx`).
   */
  billing: boolean;
  /**
   * Telefon görünümünün adres metni (ortak sözlüğün `addresses` bloğu) — verilince kart native adres
   * kartı olarak çizilir. Form yine `AddressForm` (telefonda çekmecede açılır, `compact`).
   */
  phoneCopy?: AccountCopy['addresses'];
}

/** Rol rozeti — native `defaultBadge`/`billingBadge`: 10'luk yazı, 600, harf aralığı yok, rozet köşe. */
const BADGE = 'rounded-badge px-2 py-0.5 font-sans text-eyebrow-xs font-semibold tracking-normal';

export function AddressesCard({ t, locale, addresses, defaults, compact, billing, phoneCopy }: AddressesCardProps) {
  /** Tek seferde tek form: ekleme ile düzenleme aynı yerde açılır, ikisi birden açık kalamaz. */
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<{ errorKey: string | null }>) => {
    setBusy(true);
    setError(null);
    // Çağrı dönmezse (sunucuya ulaşılamadı) genel cümleye düşer ve kart kilitli kalmaz (14.09).
    const { errorKey } = await task().catch(() => ({ errorKey: 'unexpected' }));
    setBusy(false);
    // Cümle EKRANDA kurulur (denetim H1/H2): sunucu anahtar döner, sözlük burada. Bilinmeyen bir
    // anahtar jenerik cümleye düşer — ekran asla boş kalmaz, ham mesaj da asla görünmez.
    if (errorKey) return setError(errorText(t.errors, errorKey));
    setEditing(null);
    setConfirmDelete(null);
  };

  const editForm = (address: Address) => (
    <AddressForm
      key={address.id}
      locale={locale}
      // Mobil webde form ÇEKMECEDE açılır (21.08) — karar formun kendisinde, künyesi orada.
      compact={compact}
      initial={toFormInput(address)}
      billingChoice={billing}
      onCancel={() => setEditing(null)}
      onSave={async (input) => {
        await run(async () => {
          const result = await updateAddressAction(address.id, toAddressFields(input), input.point);
          // Varsayılan işareti AYRI eylemdir: tek satırı güncellemek yetmiyor, öbürlerinin
          // bayrağı düşmek zorunda (tek varsayılan kuralı).
          if (!result.errorKey && input.makeDefault && !address.isDefault) await setDefaultAddressAction(address.id);
          // Fatura işareti de aynı sınıftan (08.09): kutu yalnız İŞARETLEMEyi ister — kutuyu
          // boşaltmak işareti kaldırmaz, çünkü "fatura adresi yok" ayrı bir beyandır ve başka
          // bir adresi seçmek eskisini zaten düşürür.
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
        // `isBilling` gövdeyle gitmez, kapı ekledikten sonra kendi yolundan işaretler (künyesi).
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
        {/* Rolün ne işe yaradığı — adres yokken çizilmez: olmayan bir rozetin açıklaması gürültüdür (native). */}
        {addresses.length > 0 && <p className="font-sans text-helper text-muted">{phoneCopy.note}</p>}
        {addresses.map((address, index) => {
          const title = address.label || address.city;
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
            <TextAction key="delete" label={t.addressDelete} tone="terracotta" onClick={() => setConfirmDelete(address.id)} />,
          ].filter((action) => action !== null);
          const confirming = confirmDelete === address.id;
          const inline = actions.length <= 2 && !confirming;
          const row = (
            <div className={inline ? 'flex items-center gap-2.5' : 'flex flex-col gap-2'}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-note font-bold text-ink">{title}</span>
                  {address.isDefault && <span className={`${BADGE} bg-olive-bg text-olive-dark`}>{phoneCopy.default}</span>}
                  {/* İki rol AYRI rozet ve ayrı tonda: bir adres ikisi birden olabilir (native'in kuralı). */}
                  {billing && address.isBilling && <span className={`${BADGE} bg-sand-300 text-ink`}>{phoneCopy.billing}</span>}
                </div>
                <span className="font-sans text-body-sm text-muted">{addressLine(address)}</span>
              </div>
              {confirming ? (
                /* Onay SATIRIN İÇİNDE: ayrı bir pencere, sıradan bir işi olduğundan ağır gösterirdi. */
                <div className="flex flex-wrap items-center justify-end gap-3.5">
                  <span className="font-sans text-note font-semibold text-terracotta">{t.addressDeleteConfirm}</span>
                  <TextAction label={t.addressDeleteYes} tone="terracotta" onClick={() => act(() => deleteAddressAction(address.id))} />
                  <TextAction label={t.cancel} onClick={() => setConfirmDelete(null)} />
                </div>
              ) : (
                /* Eylemler BÖLÜNMEZ (native'de `flex:none`): sığmayan eylem metninin ortasından kırılmaz, bütün
                   olarak alt satıra iner — silme web'in eki ve dar ekranda üç eylem tek şeride sığmıyordu (görüldü 14.09). */
                <div
                  className={[
                    '[&>*]:whitespace-nowrap',
                    inline ? 'flex flex-none items-center gap-2.5' : 'flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2',
                  ].join(' ')}
                >
                  {actions}
                </div>
              )}
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
              // Varsayılan adres ZEYTİN çerçeveli (tasarım): teslimat yeri göstergesini o besliyor.
              address.isDefault ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-sans text-body-sm font-bold text-ink">
                {address.label || address.city}
                {address.isDefault && ` · ${t.addressDefault}`}
                {/* İki rol AYRI yazılır: bir adres ikisi birden olabilir ve çoğu işletmede öyledir.
                    Tek bir işarete indirilseydi müşteri hangi rolü taşıdığını göremezdi. */}
                {billing && address.isBilling && ` · ${t.addressBilling}`}
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
                {/* "Fatura adresim yap" da aynı kuralla: yalnız kurumsal hesapta ve yalnız fatura
                    adresi OLMAYANDA. Varsayılanı düşürmez — ayrı soru, ayrı eylem (kapının künyesi). */}
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
