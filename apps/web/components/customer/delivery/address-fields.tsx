'use client';

import { addressLineOf, type AddressKind } from '@lezzet/address';
import type { Country, PlaceOption } from '@lezzet/types';
import { useState } from 'react';

import type { FieldVariant } from '@/components/customer/form/field-shell';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { useAddressSearch } from '@/lib/address/use-address-search.hook';
import { usePostalSuggest } from '@/lib/address/use-postal-suggest.hook';
import { useDeliveryPlace } from './place-context';

/*
  Adresin üç alanı (sokak, posta kodu, şehir) önerileriyle; kalıcılık çağıranın, davranış burasının, ki kaydeden form da kaydetmeyen
  başvuru formu da aynı yardımı alsın. Ülke posta kodundan türer ve kod elle değişince `null`a düşer, çünkü eski seçim yeni kodun
  cevabı değildir.
*/

/** Üç alanın değeri — çağıranın kendi taslağının bir alt kümesi. Dışa AÇILMAZ: çağıranlar kendi
    taslaklarından geçiyor, yapısal uyum yeter (`AddressFormCopy` künyesindeki aynı gerekçe). */
interface AddressFieldsValue {
  line1: string;
  postalCode: string;
  city: string;
}

/** Alanların sözcükleri — her sayfa kendi `messages.json`'undan geçirir (global sözlük yok, CLAUDE §2). */
export interface AddressFieldsCopy {
  line1: string;
  postalCode: string;
  city: string;
  /** Yer tutucular isteğe bağlı; telefondaki başvuru formu native gibi boş alanı adıyla gösterir. */
  line1Placeholder?: string;
  postalCodePlaceholder?: string;
  cityPlaceholder?: string;
  /** BAN veri lisansının künyesi; öneri listesinin altında gösterilmesi zorunlu. */
  suggestCredit: string;
  suggestLabel: string;
  suggestBusy: string;
  zipSuggestLabel: string;
  citySuggestLabel: string;
}

interface AddressFieldsProps {
  value: AddressFieldsValue;
  /** Yalnız DEĞİŞEN alanlar — çağıran kendi taslağını yamalar. */
  onChange: (patch: Partial<AddressFieldsValue>) => void;
  copy: AddressFieldsCopy;
  /**
   * Alanlar ekranda mı — kapalı bir formun sorgusu ağa çıkmaz (görünmeyen bir formun sorusunun
   * cevabı da görünmez).
   */
  active?: boolean;
  /** Posta kodundan çözülen ülke; kod elle değişince `null`. Kullanmayan çağıran geçmez. */
  onCountryChange?: (country: Country | null) => void;
  /** Seçilen önerinin koordinatı; kod elle değişince `null`a düşer, çünkü nokta seçilen satıra aittir. */
  onPointChange?: (point: { lat: number; lng: number; precision: AddressKind } | null) => void;
  /**
   * BAN sokak önerisi (varsayılan açık). BAN yalnız Fransız adreslerini bildiği için Alman şirketinin adresinde kapatılır, yoksa benzer
   * adlı bir Fransız komünü sessizce yanlış ülkeye yazılabilirdi.
   */
  streetSuggest?: boolean;
  /** Kod alanı terk edilince çağrılır — teslimat cevabını veren taraf çağırandır. */
  onPostalBlur?: (postalCode: string) => void;
  /** Kod alanının hata metni; çağıranın kendi doğrulamasından gelir. */
  postalError?: string;
  /** Cümlesiz geçersizlik: başvuru formu alanlarını topluca ve cümlesiz işaretler; uydurma bir cümle olmayan bir anahtar olurdu. */
  postalInvalid?: boolean;
  /** Sokak alanının hata işareti (başvuru formunun alan-alan doğrulaması). */
  line1Invalid?: boolean;
  cityInvalid?: boolean;
  /** Sokak ile posta kodu arasına giren alan (adres formunun kapı/katı): alan sırası sabit ve başvuru formunda o alan yok. */
  afterLine1?: React.ReactNode;
  /** Telefon forku: satır native adres bloğunun ölçüsünde (posta kodu 120 px, aralık 8 px), ki iki yüzeyde aynı alan aynı genişlikte dursun. */
  compact?: boolean;
  /** Alanların çizimi; telefondaki başvuru formu native gibi hap alan ister. */
  variant?: FieldVariant;
}

export function AddressFields({
  value,
  onChange,
  copy,
  active = true,
  onCountryChange,
  onPointChange,
  onPostalBlur,
  postalError,
  postalInvalid,
  line1Invalid,
  cityInvalid,
  afterLine1,
  streetSuggest = true,
  compact = false,
  variant = 'form',
}: AddressFieldsProps) {
  /* Kod listesinden SEÇİLEN satır — yalnız ŞEHİR listesini çizmek için (çok yerleşimli kod).
     Elle yazılan kodda `null` kalır. */
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const zipSuggestions = usePostalSuggest(value.postalCode, { enabled: active && zipOpen });

  /* LİSTE NE ZAMAN AÇIK: yalnız müşteri sokak alanına YAZARKEN. Form yeni açıldığında (düzenlemede
     alan zaten dolu) ve öneri seçildikten sonra kapalıdır — aksi hâlde seçilen adres kendi
     önerisini yeniden getirir ve liste seçimin üstünde asılı kalırdı. */
  const [suggestOpen, setSuggestOpen] = useState(false);
  /**
   * Öneriler müşterinin bulunduğu yeri öne alır: sokak adı Fransa'da yüzlerce kez tekrarlanır ve servis yalnız metne bakarsa uzak
   * şehirler başa gelir. Nokta site genelindeki yer bağlamından okunur; yer bilinmiyorsa ipucu gönderilmez.
   */
  /* Adı `browsingPlace`: aşağıdaki `place` KOD LİSTESİNDEN seçilen satırdır (şehir listesini
     çizmek için), bu ise sitenin gezinme yeri. İkisi farklı sorular — aynı adı taşımamalılar. */
  const { place: browsingPlace } = useDeliveryPlace();
  const search = useAddressSearch(value.line1, {
    enabled: streetSuggest && active && suggestOpen,
    near: browsingPlace?.point ?? undefined,
  });

  /**
   * BAN önerisine tıklandı: satır, posta kodu ve şehir BİRLİKTE yazılır, listeler kapanır.
   *
   * **Ülke `FR` olur ve bu bir tahmin değil:** kaynak Fransız devletinin adres tabanıdır (BAN) ve
   * yalnız Fransız adreslerini bilir. Kapı bu değeri yine de DOĞRULAR.
   */
  const applySuggestion = (id: string): void => {
    const picked = search.suggestions.find((suggestion) => suggestion.id === id);
    if (picked === undefined) return;
    setSuggestOpen(false);
    setZipOpen(false);
    setCityOpen(false);
    // Şehir öneriden geldi; kodun yerleşim listesine ihtiyaç yok.
    setPlace(null);
    onCountryChange?.('FR');
    // Koordinat SEÇİLEN satırdan geliyor — müşterinin gözüyle onayladığı nokta, sonradan bir
    // taramanın tahmin edeceğinden iyi kaynaktır ve ikinci bir çağrı gerektirmez.
    onPointChange?.({ lat: picked.latitude, lng: picked.longitude, precision: picked.kind });
    onChange({ line1: addressLineOf(picked), postalCode: picked.postalCode, city: picked.city });
    // Teslimat cevabı kodun kendi yolundan verilir — öneriden gelen kod da bir koddur.
    onPostalBlur?.(picked.postalCode);
  };

  /** Kod önerisinin satır kimliği: aynı kod iki ülkede geçerli olabiliyor, kod tek başına anahtar değil. */
  const zipKey = (suggestion: PlaceOption): string => `${suggestion.country}:${suggestion.postalCode}`;

  /**
   * Posta kodu seçildi: tek yerleşimliyse şehir yazılır, çok yerleşimliyse alan boşalır ve liste açılır, çünkü birini kendiliğinden
   * seçmek müşteriye yanlış şehir yazabilirdi.
   */
  const applyZip = (id: string): void => {
    const picked = zipSuggestions.find((suggestion) => zipKey(suggestion) === id);
    if (picked === undefined) return;
    setZipOpen(false);
    setPlace(picked);
    onCountryChange?.(picked.country);
    setCityOpen(picked.places.length > 1);
    onChange({ postalCode: picked.postalCode, city: picked.places.length === 1 ? (picked.places[0] ?? '') : '' });
    onPostalBlur?.(picked.postalCode);
  };

  const applyCity = (name: string): void => {
    setCityOpen(false);
    onChange({ city: name });
  };

  return (
    <>
      <FormInputField
        label={copy.line1}
        placeholder={copy.line1Placeholder}
        variant={variant}
        value={value.line1}
        onChange={(e) => {
          setSuggestOpen(true);
          onChange({ line1: e.target.value });
        }}
        invalid={line1Invalid}
        autoComplete="address-line1"
        name="address-line1"
      />
      {/* Servisin önerileri alanın hemen altında; künye satırı listeyle gelir, çünkü kaynak gösterimi gösteren yüzeyin sorumluluğu. */}
      <SuggestionList
        items={search.suggestions.map((suggestion) => ({
          id: suggestion.id,
          title: addressLineOf(suggestion),
          subtitle: `${suggestion.postalCode} ${suggestion.city}`,
        }))}
        onSelect={applySuggestion}
        footnote={copy.suggestCredit}
        label={copy.suggestLabel}
      />
      {/* Kota dolunca tek satır söylenir, alan yazmaya açık kalır; öneri yardımcıdır, yokluğu hata değil, bu yüzden kırmızı değil. */}
      {search.throttled && (
        <span className="font-sans text-note leading-relaxed text-body">{copy.suggestBusy}</span>
      )}

      {afterLine1}

      <div className={compact ? 'flex gap-2' : 'flex gap-3'}>
        {/* Posta kodu beş hane olduğu için dar ve sabit; şehir kalan genişliği alır. */}
        <div className={compact ? 'w-30 flex-none' : 'w-[150px] flex-none'}>
          <FormInputField
            label={copy.postalCode}
            placeholder={copy.postalCodePlaceholder}
            variant={variant}
            value={value.postalCode}
            onChange={(e) => {
              /* Kod elle değişti: önceki seçimin ülkesi ve şehir listesi düşer, kalsalardı müşteri eski yerin cevabıyla kaydederdi. */
              setZipOpen(true);
              setCityOpen(false);
              onCountryChange?.(null);
              // Nokta da kodun peşinden gider: elle değiştirilen kodda önerinin koordinatı bu adresin cevabı değildir.
              onPointChange?.(null);
              setPlace(null);
              onChange({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) });
            }}
            onBlur={(e) => onPostalBlur?.(e.target.value)}
            error={postalError}
            invalid={postalInvalid}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            name="postal-code"
          />
        </div>
        <div className="flex-1">
          <FormInputField
            label={copy.city}
            placeholder={copy.cityPlaceholder}
            variant={variant}
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            invalid={cityInvalid}
            autoComplete="address-level2"
            name="city"
          />
        </div>
      </div>
      {/* Kod önerileri — alanların ALTINDA, seçilince kodu ve (tek yerleşimliyse) şehri doldurur.
          Künye satırı YOK: veri kendi referansımız (GeoNames, migration ile geliyor) ve kaynak
          gösterimi orada yapılmış; BAN'ın Etalab yükümlülüğü buraya taşınmaz. */}
      <SuggestionList
        items={zipSuggestions.map((suggestion) => ({
          id: zipKey(suggestion),
          title: suggestion.postalCode,
          // Ad yoksa (kod yalnız kendi tablomuzda) alt satır hiç çizilmez — uydurulacak ad yok.
          subtitle: suggestion.places.length === 0 ? undefined : suggestion.places.join(', '),
        }))}
        onSelect={applyZip}
        label={copy.zipSuggestLabel}
      />
      {/* Kodun yerleşimleri — yalnız ÇOK yerleşimli kodda ve yalnız kod seçildikten sonra. */}
      {cityOpen && place !== null && (
        <SuggestionList
          items={place.places.map((name) => ({ id: name, title: name }))}
          onSelect={applyCity}
          label={copy.citySuggestLabel}
        />
      )}
    </>
  );
}
