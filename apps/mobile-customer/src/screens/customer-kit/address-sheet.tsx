import type { LocalizedCopy } from '@lezzet/i18n';
import { useRef, useState } from 'react';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import type { MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { AddressForm } from './address-form';
import addressCopy from '@lezzet/i18n/customer/address';

/*
  ADRES ÇEKMECESİ (Musteri Mobil `shAddr`, 21.313) — formun yüzen sayfa kabuğu. İçerik `AddressForm`; burada yalnız
  AÇILMA/KAPANMA kararları var. İki tüketen: hesap ekranının adres bölümü ve "Siparişi tamamla"
  ekranının adres dilimi (10.08'e kadar orada düğme müşteriyi profil sayfasına atıyordu).

  ── FORM HER AÇILIŞTA TAZE, KAPANIRKEN YERİNDE ──────────────────────────────
  İki kural aynı anda gerekiyor:
  1. Çekmece her açıldığında taslak SIFIRLANIR (yeni adres boş, düzenleme dolu) — bunu `key`
     yapıyor: `session` her açılışta artar, form yeniden kurulur. Taslağı prop değişimiyle
     düzeltmek, açılışın İLK KARESİNDE bir önceki adresi göstermek demekti.
  2. Kapanış animasyonu (240 ms) boyunca içerik YERİNDE kalır — `shown` son açık hedefi tutar.
     `target` null olur olmaz formu boşaltsaydık, çekmece boş bir formla aşağı kayardı.
*/

/** Başlık formun ortak sözlüğünden (web adres penceresiyle aynı metin — `@lezzet/i18n/customer/address`). */
type AddressCopy = LocalizedCopy<typeof addressCopy>;

/** Çekmecenin konusu: `editing: null` yeni adres, dolu ise düzenleme. `null` = kapalı. */
export interface AddressSheetTarget {
  editing: MeAddress | null;
}

interface AddressSheetProps {
  target: AddressSheetTarget | null;
  /** Yazımdan önceki liste — `AddressForm`un yeni adresi çözmesi için. */
  addresses: MeAddress[];
  onClose: () => void;
  /** Yazım başarılı; imza `AddressForm`unkiyle aynı (`savedId` silmede `null`). */
  onSaved: (addresses: MeAddress[], savedId: string | null) => void;
  /** Yeni adreste alıcı/telefon varsayılanı — hesabın künyesi; gerekçesi `AddressForm`da. */
  defaults?: { recipient: string; phone: string };
  testID?: string;
}

export function AddressSheet({ target, addresses, onClose, onSaved, defaults, testID }: AddressSheetProps) {
  const locale = useAppLocale();
  const copy: AddressCopy = addressCopy[locale];

  const [session, setSession] = useState(0);
  const opened = useRef<AddressSheetTarget | null>(null);
  if (target !== null && target !== opened.current) {
    opened.current = target;
    setSession((count) => count + 1);
  }
  const shown = target ?? opened.current;

  return (
    <BottomSheet
      visible={target !== null}
      title={shown?.editing == null ? copy.newTitle : copy.editTitle}
      onClose={onClose}
      testID={testID}
    >
      <AddressForm
        key={session}
        editing={shown?.editing ?? null}
        addresses={addresses}
        active={target !== null}
        defaults={defaults}
        onSaved={(next, savedId) => {
          onSaved(next, savedId);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
