import { addressLineOf } from '@lezzet/address-fr';
import type { Country } from '@lezzet/types';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextField } from '@/components/ui/text-field';
import type { PlaceOption } from '@/lib/api/places';
import { useAddressSearch } from './use-address-search.hook';
import { usePostalSuggest } from './use-postal-suggest.hook';

/*
  ADRESİN ÜÇ ALANI — sokak · posta kodu · şehir, ÖNERİLERİYLE birlikte (MB-06).

  ── NEDEN AYRI BİR BİLEŞEN ──────────────────────────────────────────────────
  Bu davranış `address-form`un içinde yaşıyordu ve orada kalması gerektiği sanılıyordu, çünkü form
  "adres formu"ydu. Ama form iki şey birden yapıyor: alanları ÇİZİYOR ve kaydı KENDİSİ yazıyor
  (`createAddress`/`updateAddress`). İkincisi yüzünden profesyonel başvurusu formu olduğu gibi
  kullanamıyordu — orada adres bir KAYIT değil, başvuru gövdesinin bir parçası. Sonuç ölçüldü
  (MB-06): başvuru ekranı üç düz `TextField` yazmış; ne BAN önerisi var, ne posta kodu önerisi,
  ne çok yerleşimli kodun şehir listesi, ne de ülke türetimi. Aynı ülkede aynı adresi giren
  müşteri, hangi ekrandan girdiğine göre farklı bir yardım alıyordu.

  Ayrım şu: **kalıcılık çağıranın, DAVRANIŞ burasının.** Kaydeden form da (adres çekmecesi),
  kaydetmeyen form da (B2B başvurusu) aynı üç alanı aynı akıllılıkla çizsin.

  ── GÖRÜNÜŞ VE SÖZCÜKLER ÇAĞIRANDAN ─────────────────────────────────────────
  İki yüzeyin alan biçimi ve etiketleri farklı (biri hap köşeli ve görünür etiketli, öteki
  yer tutuculu) ve sözlükleri de ayrı — metni buraya taşımak, iki ekranın kelimelerini tek sözlüğe
  hapsetmek olurdu. O yüzden `copy` ve `shape` prop: paylaşılan şey CÜMLE değil DAVRANIŞ.

  ── ÜLKE İÇERİDE TÜRER, DIŞARIYA BİLDİRİLİR ─────────────────────────────────
  Ülke bir alan değil, posta kodundan türeyen bir sonuçtur (`address-form` künyesinin 21.28
  kararı: 610 kod iki ülkede birden geçerli). Türetme burada olur çünkü seçim burada yapılır;
  sonucu kullanan taraf çağırandır (adres gövdesine yazar ya da yok sayar) — bu yüzden
  `onCountryChange` İSTEĞE BAĞLI.
*/

/** Üç alanın değeri — çağıranın kendi taslağının bir alt kümesi. */
export interface AddressFieldsValue {
  line1: string;
  postalCode: string;
  city: string;
}

/** Alanların sözcükleri — her yüzey kendi sözlüğünden geçirir. */
export interface AddressFieldsCopy {
  lineLabel: string;
  linePlaceholder: string;
  zipLabel: string;
  zipPlaceholder: string;
  cityLabel: string;
  cityPlaceholder: string;
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
  /** Görünür etiket çizilsin mi — B2B formu etiketli, adres çekmecesi yer tutuculu. */
  withLabels?: boolean;
  shape?: 'pill' | 'soft';
  /**
   * Alanlar ekranda mı — kapanma animasyonu boyunca ayakta duran çekmece `false` geçer ve öneri
   * sorgusu ağa çıkmaz (görünmeyen bir formun sorusunun cevabı da görünmez).
   */
  active?: boolean;
  /** Posta kodundan çözülen ülke; kod elle değişince `null`. Kullanmayan çağıran geçmez. */
  onCountryChange?: (country: Country | null) => void;
  /** `${testIDPrefix}-line` gibi türetilir — iki yüzeyin testleri kendi adlarını korur. */
  testIDPrefix: string;
}

export function AddressFields({
  value,
  onChange,
  copy,
  withLabels = false,
  shape,
  active = true,
  onCountryChange,
  testIDPrefix,
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
  const search = useAddressSearch(value.line1, { enabled: active && suggestOpen });

  /**
   * BAN önerisine dokunuldu: satır, posta kodu ve şehir BİRLİKTE yazılır, liste kapanır.
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
  };

  /** Kod önerisinin satır kimliği: aynı kod iki ülkede geçerli olabiliyor, kod tek başına anahtar değil. */
  const zipKey = (suggestion: PlaceOption): string => `${suggestion.country}:${suggestion.postalCode}`;

  /**
   * Posta kodu seçildi. Şehir de buradan gelir: kod tek yerleşimliyse doğrudan yazılır, çok
   * yerleşimliyse alan BOŞALIR ve altında liste açılır — kodların ~%39'u çok yerleşimli ve birini
   * seçmek "Bischheim'lı müşteriye Strasbourg yazmak" olurdu (19.17'nin kayıtlı dersi).
   */
  const applyZip = (id: string): void => {
    const picked = zipSuggestions.find((suggestion) => zipKey(suggestion) === id);
    if (picked === undefined) return;
    setZipOpen(false);
    setPlace(picked);
    onCountryChange?.(picked.country);
    setCityOpen(picked.places.length > 1);
    onChange({ postalCode: picked.postalCode, city: picked.places.length === 1 ? (picked.places[0] ?? '') : '' });
  };

  const applyCity = (name: string): void => {
    setCityOpen(false);
    onChange({ city: name });
  };

  return (
    <View style={styles.fields}>
      {/* İÇERİK TÜRLERİ (kullanıcı bulgusu 09.08): alanlar cihaza "burası adres" demeden hiçbir
          öneri çıkmıyordu — Android Autofill / iOS AutoFill yalnız beyan edilmiş alanı tanır. */}
      <TextField
        value={value.line1}
        onChangeText={(next) => {
          setSuggestOpen(true);
          onChange({ line1: next });
        }}
        accessibilityLabel={copy.lineLabel}
        label={withLabels ? copy.lineLabel : undefined}
        placeholder={copy.linePlaceholder}
        content="streetAddress"
        shape={shape}
        testID={`${testIDPrefix}-line`}
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
        accessibilityLabel={copy.suggestLabel}
        testID={`${testIDPrefix}-suggestions`}
      />
      {/* Kota doldu (429): tek satır söylenir ve BİTER — alan yazmaya açık kalır, kaydetme
          engellenmez. Öneri yardımcı bir özellik; yokluğu müşterinin işini durdurmaz. */}
      {search.throttled ? (
        <Note description={copy.suggestBusy} tone="warm" testID={`${testIDPrefix}-suggest-busy`} />
      ) : null}
      {/* Posta kodu dar, şehir geniş — webin 1 : 1,6 oranı (kod beş hane, şehir adı uzun). */}
      <View style={styles.zipRow}>
        <View style={styles.zipField}>
          <TextField
            value={value.postalCode}
            onChangeText={(next) => {
              /* Kod ELLE değişti: önceki seçim artık bu kodun cevabı değil. Ülkeyi ve şehir
                 listesini düşürmek şart — kalsalardı müşteri kodu değiştirdikten sonra hâlâ eski
                 yerin cevabını okur, üstelik o ülkeyle kaydederdi. */
              setZipOpen(true);
              setCityOpen(false);
              onCountryChange?.(null);
              setPlace(null);
              onChange({ postalCode: next.replace(/\D/g, '').slice(0, 5) });
            }}
            accessibilityLabel={copy.zipLabel}
            label={withLabels ? copy.zipLabel : undefined}
            placeholder={copy.zipPlaceholder}
            content="postalCode"
            shape={shape}
            testID={`${testIDPrefix}-zip`}
          />
        </View>
        <View style={styles.cityField}>
          <TextField
            value={value.city}
            onChangeText={(next) => onChange({ city: next })}
            accessibilityLabel={copy.cityLabel}
            label={withLabels ? copy.cityLabel : undefined}
            placeholder={copy.cityPlaceholder}
            content="city"
            shape={shape}
            testID={`${testIDPrefix}-city`}
          />
        </View>
      </View>
      {/* Kod önerileri — alanın ALTINDA, seçilince kodu ve (tek yerleşimliyse) şehri doldurur.
          Künye satırı YOK: veri kendi referansımız (GeoNames, migration ile geliyor) ve kaynak
          gösterimi orada yapılmış; BAN'ın Etalab yükümlülüğü buraya taşınmaz. */}
      <SuggestionList
        items={zipSuggestions.map((suggestion) => ({
          id: zipKey(suggestion),
          title: `${suggestion.postalCode} · ${suggestion.country}`,
          // Ad yoksa (kod yalnız kendi tablomuzda) alt satır hiç çizilmez — uydurulacak ad yok.
          subtitle: suggestion.places.length === 0 ? undefined : suggestion.places.join(', '),
        }))}
        onSelect={applyZip}
        accessibilityLabel={copy.zipSuggestLabel}
        testID={`${testIDPrefix}-zip-suggestions`}
      />
      {/* Kodun yerleşimleri — yalnız ÇOK yerleşimli kodda ve yalnız kod seçildikten sonra. */}
      {cityOpen && place !== null ? (
        <SuggestionList
          items={place.places.map((name) => ({ id: name, title: name }))}
          onSelect={applyCity}
          accessibilityLabel={copy.citySuggestLabel}
          testID={`${testIDPrefix}-city-suggestions`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Alanlar arası boşluk formun kendi ritmiyle aynı (`address-form` `lg`) — blok kaba girince fark edilmez. */
  fields: { gap: theme.space.lg },
  /* Posta kodu dar SABİT sütun + şehir kalan genişlik (v3:206-209 — zip 120px, şehir flex).
     Ölçüler adres çekmecesinden BİREBİR taşındı; B2B formu kendi 1:1,6 oranını bırakıp buna
     geçiyor — aynı alan ikilisinin iki ekranda iki genişlikte olması zaten ayrışmanın kendisiydi. */
  zipRow: { flexDirection: 'row', gap: theme.space.md },
  zipField: { width: 120 },
  cityField: { flex: 1 },
}));
