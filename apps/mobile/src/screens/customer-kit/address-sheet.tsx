import type { LocalizedCopy } from '@lezzet/i18n';
import { useRef, useState } from 'react';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { AddressForm } from './address-form';
import messages from './address-sheet-messages.json';

/*
  ADRES ÇEKMECESİ (v3 `shAddr`) — formun yüzen sayfa kabuğu. İçerik `AddressForm`; burada yalnız
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

type Messages = LocalizedCopy<typeof messages>;

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
  const t: Messages = messages[locale];

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
      title={shown?.editing == null ? t.titleNew : t.titleEdit}
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
