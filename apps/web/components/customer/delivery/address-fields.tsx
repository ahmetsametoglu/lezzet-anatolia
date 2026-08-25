'use client';

import { addressLineOf } from '@lezzet/address-fr';
import type { Country, PlaceOption } from '@lezzet/types';
import { useState } from 'react';

import { FormInputField } from '@/components/customer/form/form-input-field';
import { SuggestionList } from '@/components/customer/ui/suggestion-list';
import { useAddressSearch } from '@/lib/address/use-address-search.hook';
import { usePostalSuggest } from '@/lib/address/use-postal-suggest.hook';

/*
  ADRESİN ÜÇ ALANI — sokak · posta kodu · şehir, ÖNERİLERİYLE birlikte.

  ── NEDEN AYRI BİR BİLEŞEN ──────────────────────────────────────────────────
  Bu davranış `address-form`un içinde yaşayabilirdi, ama form iki şey birden yapıyor: alanları
  ÇİZİYOR ve kaydı KENDİSİ yazıyor (`onSave` → adres tablosu). İkincisi yüzünden profesyonel
  başvuru formu onu olduğu gibi kullanamıyordu — orada adres bir KAYIT değil, başvuru gövdesinin
  bir parçası. Ölçüldü: başvuru ekranı üç düz `FormInputField` yazmıştı; ne BAN önerisi vardı, ne
  kod önerisi, ne çok yerleşimli kodun şehir listesi, ne de ülke türetimi. Aynı müşteri, aynı
  adresi, hangi ekrandan girdiğine göre farklı bir yardım alıyordu.

  Ayrım şu: **kalıcılık çağıranın, DAVRANIŞ burasının.** Kaydeden form da (checkout · hesap),
  kaydetmeyen form da (B2B başvurusu) aynı üç alanı aynı akıllılıkla çizsin.

  Native tarafta aynı ayrım aynı gerekçeyle yapılmıştı (`address-fields.tsx`, MB-06). Kod
  paylaşılmıyor — çizim iki yüzeyde farklı ve olması gereken de bu; paylaşılan şey DAVRANIŞ ve o
  ortak çekirdekte (`@lezzet/react-hooks`) ile ortak kapıda (`@lezzet/address-fr`) duruyor.

  ── ÜLKE İÇERİDE TÜRER, DIŞARIYA BİLDİRİLİR ─────────────────────────────────
  Ülke bir alan değil, posta kodundan türeyen bir sonuçtur: **610 kod iki ülkede birden geçerli**
  (ölçüm 10.08). Türetme burada olur çünkü seçim burada yapılır; sonucu kullanan taraf çağırandır
  — bu yüzden `onCountryChange` İSTEĞE BAĞLI. Kod ELLE değiştirilince ülke `null`a düşer: eski
  seçim artık yeni kodun cevabı değildir ve "ölçülemeyen değer sıfır değildir" (CLAUDE §1) burada
  da geçerli — bilinmeyen ülkeyi `FR`de bırakmak, bilinmeyeni bilinen gibi okutmak olurdu.
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
  /** BAN künyesi (Etalab 2.0) — öneri listesinin altında ZORUNLU. */
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
  /**
   * BAN sokak önerisi çizilsin mi (varsayılan: evet).
   *
   * **Kapatılabilir olması şart, çünkü BAN YALNIZ FRANSIZ adreslerini bilir.** Profesyonel
   * başvurusunun 🇩🇪 AB-vergi yolunda adres bir ALMAN şirketinindir.
   *
   * ÖLÇÜLDÜ (21.08, servise doğrudan sorularak): Alman yazımıyla girilen dört adres (*"Hauptstrasse
   * 12 Kehl"*, *"Bahnhofstrasse 5 Offenburg"*, *"Marktplatz 3 Freiburg"*, *"Karlstrasse 8 77694
   * Kehl"*) **sıfır** öneri döndürdü — yani çoğu zaman kapı zaten sessiz kalırdı. Ama beşinci
   * sorgu tam da korkulanı üretti: *"Rue de Paris 10 Berlin"* → **5 öneri**, ilki *"Rue de Paris
   * 62620 **Barlin**"* (skor 0,61). Barlin bir Fransız komünü ve Berlin'e benziyor; müşteri makul
   * görünen o satırı seçse adres sessizce yanlış ülkeye yazılırdı.
   *
   * Yani kapının karşılığı ikili: yanlış ülkenin "kolaylığını" kapatır **ve** çoğunlukla boş
   * dönecek bir sorguyu her tuşta ağa çıkarmaz. Öneri bir kolaylıktır; yanlış ülkenin kolaylığı
   * ise sessiz bir veri hatasıdır.
   *
   * Posta kodu ve yerleşim önerileri BUNDAN ETKİLENMEZ ve etkilenmemeli: onların kaynağı kendi
   * `postal_code_place` referansımız ve o iki ülkeyi de kapsıyor (610 ortak kod).
   */
  streetSuggest?: boolean;
  /** Kod alanı terk edilince çağrılır — teslimat cevabını veren taraf çağırandır. */
  onPostalBlur?: (postalCode: string) => void;
  /** Kod alanının hata metni; çağıranın kendi doğrulamasından gelir. */
  postalError?: string;
  /**
   * Cümlesiz geçersizlik — kırmızı çerçeve, altında metin YOK. `postalError`ın kardeşi:
   * adres formu kod için ayrı bir cümle söylüyor (*"5 haneli bir posta kodu girin"*), başvuru
   * formu ise tüm alanlarını topluca ve cümlesiz işaretliyor (`FormInputField.invalid` künyesi).
   * İkincisine uydurma bir cümle üretmek, olmayan bir sözlük anahtarı icat etmek olurdu.
   */
  postalInvalid?: boolean;
  /** Sokak alanının hata işareti (başvuru formunun alan-alan doğrulaması). */
  line1Invalid?: boolean;
  cityInvalid?: boolean;
  /**
   * Sokak bloğu ile posta kodu satırının ARASINA giren alan(lar) — adres formunun "kapı/kat"ı.
   *
   * Yuva şart, çünkü alan sırası K33'te SABİT: başlık · alıcı · **sokak · kapı/kat · posta kodu +
   * şehir** · telefon. Kapı/katı üçlünün altına atmak sırayı bozardı; bileşenin içine almak ise
   * onu B2B başvuru formuna da dayatırdı — orada öyle bir alan yok. Kapı/kat üçlünün parçası
   * değil zaten: BAN önerisi sokak satırını yazar, kapı/kat müşterinin kendi eklediği bilgidir.
   */
  afterLine1?: React.ReactNode;
  /**
   * Mobil web forku — posta kodu ve şehir AYNI SATIRDA ama sabit genişlikle değil, ORANLA
   * bölüşür (%35 / %65).
   *
   * Sabit sütun masaüstünün ölçüsüydü ve dar ekranda tersine dönüyordu — ölçüldü (390 px): kod
   * **150 px**, şehir **116 px**; beş haneli bir sayı şehir adından geniş. Bir tur alt alta
   * alındılar, kullanıcı düzeltti: ikisi mantıkça bir bütün, ayrı satırlara bölünmeleri formu
   * gereksiz uzatıyor. Doğru çözüm satırı bölmek değil, PAYI çevirmekti.
   */
  compact?: boolean;
}

export function AddressFields({
  value,
  onChange,
  copy,
  active = true,
  onCountryChange,
  onPostalBlur,
  postalError,
  postalInvalid,
  line1Invalid,
  cityInvalid,
  afterLine1,
  streetSuggest = true,
  compact = false,
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
  const search = useAddressSearch(value.line1, { enabled: streetSuggest && active && suggestOpen });

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
    onChange({ line1: addressLineOf(picked), postalCode: picked.postalCode, city: picked.city });
    // Teslimat cevabı kodun kendi yolundan verilir — öneriden gelen kod da bir koddur.
    onPostalBlur?.(picked.postalCode);
  };

  /** Kod önerisinin satır kimliği: aynı kod iki ülkede geçerli olabiliyor, kod tek başına anahtar değil. */
  const zipKey = (suggestion: PlaceOption): string => `${suggestion.country}:${suggestion.postalCode}`;

  /**
   * Posta kodu seçildi. Şehir de buradan gelir: kod tek yerleşimliyse doğrudan yazılır, çok
   * yerleşimliyse alan BOŞALIR ve altında liste açılır — kodların ~%40'ı çok yerleşimli ve birini
   * kendiliğinden seçmek "Bischheim'lı müşteriye Strasbourg yazmak" olurdu. O ders bu dosyanın
   * komşusunda kayıtlı (`address-form` künyesi: `67800` bizde "Strasbourg", gerçeği Bischheim).
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
        value={value.line1}
        onChange={(e) => {
          setSuggestOpen(true);
          onChange({ line1: e.target.value });
        }}
        invalid={line1Invalid}
        autoComplete="address-line1"
        name="address-line1"
      />
      {/* Adres servisinin önerileri — alanın hemen ALTINDA, seçilince üç alanı birden doldurur.
          Künye satırı listeyle birlikte gelir: veri Etalab 2.0 altında ve kaynak gösterimi
          gösteren yüzeyin sorumluluğu (STACK "Adres arama (FR)"). */}
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
      {/* Kota doldu (429): tek satır söylenir ve BİTER — alan yazmaya açık kalır, kaydetme
          engellenmez. Öneri yardımcı bir özellik; yokluğu müşterinin işini durdurmaz. Bu bir hata
          DEĞİL, o yüzden kırmızı değil: kırmızı biçim hatasına ayrılmış (K34). */}
      {search.throttled && (
        <span className="font-sans text-note leading-relaxed text-body">{copy.suggestBusy}</span>
      )}

      {afterLine1}

      <div className="flex gap-3">
        {/**
         * Posta kodu DAR: beş hane, tam genişlikte kutu değerinden büyük görünüyor.
         *
         * **Masaüstünde SABİT 150 px, çekmecede ORAN (kullanıcı kararı 21.08: "şehir yüzde altmış
         * beşini kaplar, geri kalanını posta kodu").** Sabit genişlik geniş kapta doğru, dar kapta
         * yanlıştı — ölçüldü (390 px): kod 150 px, şehir 116 px; beş haneli bir sayı şehir adından
         * genişti. Alt alta almak da çözüm değildi (denendi ve kullanıcı düzeltti): iki alan
         * mantıkça bir bütün ve ayrı satırlara bölünmeleri formu gereksiz uzatıyor.
         */}
        <div className={compact ? 'basis-[35%]' : 'w-[150px] flex-none'}>
          <FormInputField
            label={copy.postalCode}
            value={value.postalCode}
            onChange={(e) => {
              /* Kod ELLE değişti: önceki seçim artık bu kodun cevabı değil. Ülkeyi ve şehir
                 listesini düşürmek şart — kalsalardı müşteri kodu değiştirdikten sonra hâlâ eski
                 yerin cevabını okur, üstelik o ülkeyle kaydederdi. */
              setZipOpen(true);
              setCityOpen(false);
              onCountryChange?.(null);
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
