'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { useDeliveryPlace } from './place-context';

/**
 * K35 · Adres formu — **checkout ile hesap sayfasının ORTAK parçası**.
 *
 * Bir süre yalnız checkout'un içinde, yerel bir fonksiyon olarak yaşıyordu; hesap sayfası adres
 * eklemek isteyince ikinci bir kopya yazmak gerekiyordu. Aynı formun iki görünümü, biri
 * iyileştiğinde öbürünün eskimesi demekti (CLAUDE.md §1) — üstelik burada "iyileşme" dediğimiz şey
 * `autoComplete` jetonları ve posta kodu doğrulaması gibi, unutulduğunda sessizce pahalıya patlayan
 * ayrıntılar.
 *
 * **Metin dışarıdan gelir** (`AddressFormCopy`): her sayfa kendi `messages.json`'undan geçirir —
 * global sözlük yok (CLAUDE.md §2). Bileşen hangi sayfada olduğunu bilmez.
 *
 * Alan sırası **K33** ile birebir ve SABİT: başlık · alıcı · sokak · kapı/kat · posta kodu + şehir ·
 * telefon · ülke · varsayılan.
 */

export interface NewAddressInput {
  /** "Ev", "İş" — kart başlığı olur; boş bırakılabilir, o zaman şehir başlık olur. */
  label?: string;
  /** Alıcı: adrese GİDEN kişi, hesabın sahibi olmak zorunda değil (hediye, iş adresi). */
  recipient?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  phone?: string;
  /** Ülke K33'te SALT OKUNUR ("Fransa") — bugün tek ülkeye teslim ediyoruz, seçim sunmak yalan olurdu. */
  makeDefault?: boolean;
}

/**
 * Formun ihtiyaç duyduğu metinler — sayfanın kendi sözlüğünden geçirilir.
 *
 * Dışa AÇILMAZ: çağıranlar kendi `Messages` tipinden geçiyor, yapısal uyum yeter. Export edilseydi
 * kullanılmayan bir dışa açık tip olurdu (`knip`).
 */
interface AddressFormCopy {
  optional: string;
  label: string;
  recipient: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  phone: string;
  country: string;
  countryValue: string;
  makeDefault: string;
  save: string;
  cancel: string;
  postalHint: string;
  placeInRoute: string;
  placeInRouteNoDate: string;
  placeShipping: string;
}

interface AddressFormProps {
  copy: AddressFormCopy;
  locale: Locale;
  /** Düzenlemede mevcut değerler; yeni adreste boş. */
  initial?: NewAddressInput;
  onSave: (input: NewAddressInput) => Promise<void>;
  onCancel: () => void;
}

export function AddressForm({ copy, locale, initial, onSave, onCancel }: AddressFormProps) {
  const [form, setForm] = useState<NewAddressInput>(initial ?? { line1: '', postalCode: '', city: '' });
  const [busy, setBusy] = useState(false);
  const [postalError, setPostalError] = useState<string | null>(null);
  const { place, setPostalCode } = useDeliveryPlace();

  const filled = (key: keyof NewAddressInput) => Boolean((form[key] as string | undefined)?.trim());
  const complete = filled('label') && filled('recipient') && filled('line1') && filled('postalCode') && filled('city') && filled('phone');

  /**
   * `autoComplete` ŞART ve alanın kendi jetonuyla: tarayıcı kayıtlı adresi ancak alanın ne olduğunu
   * anlarsa önerir. Jeton yoksa öneri hiç çıkmaz ve müşteri adresini elle yazar — bir adres
   * formunda en pahalı sürtünme budur. `name` de veriliyor; bazı tarayıcılar sezgilerini ondan kurar.
   */
  const META: Record<string, { autoComplete: string; name: string }> = {
    label: { autoComplete: 'off', name: 'address-label' },
    recipient: { autoComplete: 'name', name: 'recipient' },
    line1: { autoComplete: 'address-line1', name: 'address-line1' },
    line2: { autoComplete: 'address-line2', name: 'address-line2' },
    postalCode: { autoComplete: 'postal-code', name: 'postal-code' },
    city: { autoComplete: 'address-level2', name: 'city' },
    phone: { autoComplete: 'tel', name: 'phone' },
  };

  const field = (key: keyof NewAddressInput, label: string, optional = false) => (
    <FormInputField
      label={label}
      optional={optional}
      optionalLabel={copy.optional}
      value={(form[key] as string) ?? ''}
      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      autoComplete={META[key]?.autoComplete}
      name={META[key]?.name}
    />
  );

  /**
   * Posta kodu ALAN TERK EDİLİNCE doğrulanır ve teslimat cevabı orada verilir (K34: "doğrulama alan
   * terk edilince çalışır, kaydete basınca değil"; K35: "posta kodu yazıldığı an teslimat cevabı
   * verir"). Müşteri formun sonuna kadar yazıp da adresin gönderilebilir olmadığını en sonda
   * öğrenmemeli.
   *
   * Çözümü sitenin ORTAK yer bağlamı yapar (`setPostalCode`) — burada ikinci bir çözüm yazılsaydı
   * başlıktaki yer hapı ile formun cevabı ayrışabilirdi. Yan etkisi de istediğimiz şey: kod bölge
   * dışıysa aşağıdaki K32 kısıt bloğu kendiliğinden açılır.
   */
  const checkPostal = async (raw: string) => {
    const value = raw.trim();
    if (!value) return setPostalError(null);
    const failure = await setPostalCode(value);
    setPostalError(failure ? copy.postalHint : null);
  };

  const answer = !postalError && place && place.postalCode === form.postalCode.trim() ? place : null;

  return (
    /* Tasarım künyesi: beyaz kart · 1px kum-200 kenar · radius 18 · ped 20/22 · gap 14.
       Satır içi açılır, ayrı sayfa yoktur (envanter). */
    <div className="flex w-full flex-col gap-3.5 rounded-card border border-sand-200 bg-card px-5.5 py-5">
      <div className="flex gap-3">
        <div className="flex-1">{field('label', copy.label)}</div>
        <div className="flex-1">{field('recipient', copy.recipient)}</div>
      </div>
      {field('line1', copy.line1)}
      {field('line2', copy.line2, true)}

      <div className="flex gap-3">
        {/* Posta kodu DAR (150px): beş hane, tam genişlikte kutu değerinden büyük görünüyor. */}
        <div className="w-[150px] flex-none">
          <FormInputField
            label={copy.postalCode}
            value={form.postalCode}
            onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
            onBlur={(e) => void checkPostal(e.target.value)}
            error={postalError ?? undefined}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            name="postal-code"
          />
        </div>
        <div className="flex-1">{field('city', copy.city)}</div>
      </div>

      {/* Teslimat cevabı. Bölge dışı bir HATA DEĞİLDİR (tasarım): nötr krem satır kullanılır,
          kırmızı yalnız biçim hatasına ayrılmıştır. */}
      {answer && (
        <div
          className={[
            'rounded-[12px] px-3.5 py-2.5 font-sans text-note leading-relaxed font-semibold',
            answer.inRoute ? 'border border-olive-line bg-olive-bg text-olive-dark' : 'bg-sand-100 text-body',
          ].join(' ')}
        >
          {answer.inRoute
            ? answer.nextDate
              ? copy.placeInRoute.replace('{date}', formatDeliveryDate(answer.nextDate, locale))
              : copy.placeInRouteNoDate
            : copy.placeShipping}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">{field('phone', copy.phone)}</div>
        {/* Ülke SALT OKUNUR (K34'ün beşinci hâli): bugün yalnız Fransa'ya teslim ediyoruz,
            seçim sunmak müşteriye olmayan bir olasılık göstermek olurdu. */}
        <div className="w-[170px] flex-none">
          <FormInputField label={copy.country} value={copy.countryValue} readOnly name="country" autoComplete="country-name" />
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.makeDefault ?? false}
          onChange={(e) => setForm((prev) => ({ ...prev, makeDefault: e.target.checked }))}
          className="size-[22px] flex-none cursor-pointer rounded-[6px] accent-olive"
        />
        <span className="font-sans text-body-sm text-ink">{copy.makeDefault}</span>
      </label>

      {/* Tasarımda eylem satırı İNCE BİR AYRAÇLA ayrılır: formun sonu ile kararın başladığı yer. */}
      <div className="flex items-center gap-2.5 border-t border-sand-100 pt-3.5">
        <Button
          disabled={!complete || busy}
          onClick={async () => {
            setBusy(true);
            await onSave({
              ...form,
              label: form.label?.trim() || undefined,
              recipient: form.recipient?.trim() || undefined,
              line2: form.line2?.trim() || undefined,
              phone: form.phone?.trim() || undefined,
            });
            setBusy(false);
          }}
        >
          {copy.save}
        </Button>
        {/* Vazgeç ÇERÇEVELİ (K2), hayalet metin değil: kaydetin yanında duran ikinci bir karar,
            metne kaçmış bir bağlantı değil. */}
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {copy.cancel}
        </Button>
      </div>
    </div>
  );
}
