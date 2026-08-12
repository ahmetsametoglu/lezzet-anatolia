import { addressLineOf } from '@lezzet/address-fr';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { createAddress, deleteAddress, updateAddress, type AddressWrite, type MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@/lib/i18n/app-locale';
import type { PlaceOption } from '@/lib/api/places';
import { publishToast } from '@/lib/toast/toast-store';
import { useAddressSearch } from './use-address-search.hook';
import { usePostalSuggest } from './use-postal-suggest.hook';
import messages from './address-sheet-messages.json';

/*
  ADRES FORMU (v3 `shAddr`) — etiket · sokak (BAN önerileriyle) · posta kodu/şehir · bölge notu ·
  Kaydet; düzenlemede ayrıca "Adresi sil".

  ── NEDEN KİTTE ─────────────────────────────────────────────────────────────
  Aynı form ÜÇ yerde lazım: hesap ekranının adres bölümü, "Siparişi tamamla" ekranı (müşteri
  checkout'un ortasında adres eklerken profil sayfasına ATILIYORDU — arıza 10.08) ve doğrulama
  sonrası profil tamamlama akışı. İkinci bir nüsha, iki ekranın adres doğrulamasının bir gün
  ayrışması demektir (CLAUDE §1): form KOPYALANMADI, hesap ekranından buraya TAŞINDI ve hesap
  ekranı artık bu dosyayı çağırıyor. Görünüm birebir korundu.

  ── YAZMAYI FORM YAPAR, SONUCU ÇAĞIRAN KULLANIR ─────────────────────────────
  `createAddress`/`updateAddress`/`deleteAddress` burada çağrılır — çağıranlar yalnız SONUCU alır
  (`onSaved`). Aksi hâlde her ekran kendi doğrulamasını ve gövde kurgusunu yazardı, yani ayrışmanın
  kapısı yine açık kalırdı. Her cevap GÜNCEL LİSTEDİR (uçların sözleşme kararı), o yüzden çağıran
  ikinci bir GET atmaz.

  ── METİNLER KENDİ SÖZLÜĞÜNDE ───────────────────────────────────────────────
  `address-sheet-messages.json` bu formun yanında durur (kitteki `place-view` deseni): metni üç
  ekranın sözlüğüne kopyalasaydık biri değişince ötekiler eskirdi.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Beş hane, yalnız rakam — FR ve DE'de ortak biçim (form kapısı; asıl kural sunucuda). */
const POSTAL_CODE = /^\d{5}$/;

interface AddressFormProps {
  /** Düzenlenen adres; `null` = yeni adres (silme bağlantısı da yalnız düzenlemede çıkar). */
  editing: MeAddress | null;
  /**
   * Yazımdan ÖNCEKİ liste. YENİ adresin kimliği bununla FARKTAN çözülür: uçlar tek tek adres
   * değil güncel LİSTE döndürüyor, çağıran ise (checkout) yeni adresi hemen seçmek zorunda.
   */
  addresses: MeAddress[];
  /**
   * Yazım başarılı. `addresses` uçtan dönen GÜNCEL liste; `savedId` kaydedilen adres —
   * SİLMEDE ve (olmaması gereken) çözülemeyen farkta `null`.
   */
  onSaved: (addresses: MeAddress[], savedId: string | null) => void;
  /** Kaydet düğmesinin metni; verilmezse sözlüğün "Kaydet"i. */
  saveLabel?: string;
  /**
   * Form ekranda mı — kapanma animasyonu boyunca ayakta duran çekmece `false` geçer ve öneri
   * sorgusu ağa çıkmaz (görünmeyen bir formun sorusunun cevabı da görünmez).
   */
  active?: boolean;
}

export function AddressForm({ editing, addresses, onSaved, saveLabel, active = true }: AddressFormProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  const [draft, setDraft] = useState({
    label: editing?.label ?? '',
    line1: editing?.line1 ?? '',
    postalCode: editing?.postalCode ?? '',
    city: editing?.city ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── ÜLKE: SEÇİLİR, YAZILMAZ (21.28) ────────────────────────────────────────
     Ülke bir alan değil, posta kodundan türeyen bir SONUÇtur (`0033_postal_code_place.sql`:
     müşterinin doldurduğu bir alan vergi sonucu doğuramaz) — ama koddan HER ZAMAN türemiyor:
     ölçüldü (10.08), **610 kod iki ülkede birden geçerli** (`67240` → Bischwiller / Bobenheim-Roxheim).
     Kodu listeden seçmek belirsizliği doğmadan kapatır: seçilen satır `(country, postalCode)`
     ikilisini birlikte taşır.

     `null` = "ülke bilinmiyor" ve bu geçerli bir hâldir: alan gövdeye HİÇ konmaz, kapı kodun
     kendisinden çözer. Çözemezse de kayıt geçer — kolonun varsayılanı devreye girer. Adres defteri
     hiçbir hâlde reddetmez (kullanıcı kararı 10.08).

     Düzenlemede mevcut ülkeyle başlar: müşteri hiçbir şeyi değiştirmeden "Kaydet"e bastığında
     seçilmiş ülke kaybolmamalı. */
  const [country, setCountry] = useState<Country | null>(editing?.country ?? null);

  /* Kod listesinden SEÇİLEN satır — yalnız ŞEHİR listesini çizmek için (çok yerleşimli kod).
     Elle yazılan kodda `null` kalır. Teslimat durumu BİLEREK tutulmuyor: adres defterinin hizmet
     alanımızla ilgisi yok, o soru sepetin ve sipariş ekranının (kullanıcı kararı 10.08). */
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const zipSuggestions = usePostalSuggest(draft.postalCode, { enabled: active && zipOpen });

  /* ADRES ARAMASI (BAN) — sokak alanına yazarken devletin adres servisinden öneri gelir ve
     dokunulan öneri ÜÇ alanı birden doldurur (sokak + posta kodu + şehir). Elle yazma yolu
     KAPANMAZ: servis düşerse ya da kota dolarsa liste hiç çizilmez, form bugünkü gibi çalışır —
     doğrulama da aynı kalır (5 hane posta kodu). Kararların künyesi `use-address-search.hook.ts`.

     LİSTE NE ZAMAN AÇIK: yalnız müşteri sokak alanına YAZARKEN. Form yeni açıldığında
     (düzenlemede alan zaten dolu) ve öneri seçildikten sonra kapalıdır — aksi hâlde seçilen
     adres kendi önerisini yeniden getirir ve liste seçimin üstünde asılı kalırdı. */
  const [suggestOpen, setSuggestOpen] = useState(false);
  const search = useAddressSearch(draft.line1, { enabled: active && suggestOpen });

  const editDraft = (patch: Partial<typeof draft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  /**
   * BAN önerisine dokunuldu: satır, posta kodu ve şehir BİRLİKTE yazılır, liste kapanır.
   *
   * **Ülke `FR` olur ve bu bir tahmin değil:** kaynak Fransız devletinin adres tabanıdır (BAN) ve
   * yalnız Fransız adreslerini bilir. Kapı bu değeri yine de DOĞRULAR (kodun FR'de geçerli olduğunu
   * referanstan sorar) — yani yanlış olsa bile sessizce geçmez.
   */
  const applySuggestion = (id: string): void => {
    const picked = search.suggestions.find((suggestion) => suggestion.id === id);
    if (picked === undefined) return;
    setSuggestOpen(false);
    setZipOpen(false);
    setCityOpen(false);
    // Şehir öneriden geldi; kodun yerleşim listesine ihtiyaç yok.
    setPlace(null);
    setCountry('FR');
    editDraft({ line1: addressLineOf(picked), postalCode: picked.postalCode, city: picked.city });
  };

  /** Kod önerisinin satır kimliği: aynı kod iki ülkede geçerli olabiliyor, kod tek başına anahtar değil. */
  const zipKey = (suggestion: PlaceOption): string => `${suggestion.country}:${suggestion.postalCode}`;

  /**
   * Posta kodu seçildi. Şehir de buradan gelir: kod tek yerleşimliyse doğrudan yazılır, çok
   * yerleşimliyse alan BOŞALIR ve altında liste açılır — kodların ~%39'u çok yerleşimli ve birini
   * seçmek "Bischheim'lı müşteriye Strasbourg yazmak" olurdu (19.17'nin kayıtlı dersi).
   *
   * Yerleşim adı HİÇ yoksa (kod yalnız kendi bölge tablomuzda var — 19.16a) alan elle yazmaya
   * kalır: uydurulacak bir ad yok.
   */
  const applyZip = (id: string): void => {
    const picked = zipSuggestions.find((suggestion) => zipKey(suggestion) === id);
    if (picked === undefined) return;
    setZipOpen(false);
    setPlace(picked);
    setCountry(picked.country);
    setCityOpen(picked.places.length > 1);
    editDraft({ postalCode: picked.postalCode, city: picked.places.length === 1 ? (picked.places[0] ?? '') : '' });
  };

  const applyCity = (name: string): void => {
    setCityOpen(false);
    editDraft({ city: name });
  };

  const save = (): void => {
    const line1 = draft.line1.trim();
    const city = draft.city.trim();
    if (!line1 || !city || !POSTAL_CODE.test(draft.postalCode)) {
      setError(t.error);
      return;
    }
    /* `line2` gövdede BİLEREK yok: form göstermiyor; gönderilmeyen alana kapı dokunmaz
       (application patch kuralı) — web'den girilmiş kat/daire satırı burada kaybolmaz.

       `country` yalnız BİLİNİYORSA gönderilir: gönderilmeyen alanı kapı kodun kendisinden çözer.
       `null` iken boş bir değer göndermek, "bilinmiyor"u bir değere çevirmek olurdu. */
    const body: AddressWrite = {
      label: draft.label.trim() || null,
      line1,
      postalCode: draft.postalCode,
      city,
      ...(country === null ? {} : { country }),
    };
    const knownIds = new Set(addresses.map((address) => address.id));
    setSaving(true);
    setError(null);
    const call = editing === null ? createAddress(body) : updateAddress(editing.id, body);
    void call.then((result) => {
      setSaving(false);
      if (result.error !== null) return setError(t.unexpected);
      const savedId = editing?.id ?? result.data.find((address) => !knownIds.has(address.id))?.id ?? null;
      onSaved(result.data, savedId);
    });
  };

  const remove = (): void => {
    if (editing === null) return;
    setSaving(true);
    void deleteAddress(editing.id).then((result) => {
      setSaving(false);
      if (result.error !== null) return setError(t.unexpected);
      onSaved(result.data, null);
      publishToast(t.deleted);
    });
  };

  return (
    <View style={styles.form}>
      <TextField
        value={draft.label}
        onChangeText={(value) => editDraft({ label: value })}
        accessibilityLabel={t.labelLabel}
        placeholder={t.labelPlaceholder}
        testID="address-label"
      />
      {/* İÇERİK TÜRLERİ (kullanıcı bulgusu 09.08): alanlar cihaza "burası adres" demeden hiçbir
          öneri çıkmıyordu — Android Autofill / iOS AutoFill yalnız beyan edilmiş alanı tanır.
          Sokak alanı `streetAddress`: kayıtlı adresi tek dokunuşla basar ve posta kodu/şehri de
          doldurur (sistem alan kümesini birlikte tanıyor). */}
      <TextField
        value={draft.line1}
        onChangeText={(value) => {
          setSuggestOpen(true);
          editDraft({ line1: value });
        }}
        accessibilityLabel={t.lineLabel}
        placeholder={t.linePlaceholder}
        content="streetAddress"
        testID="address-line"
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
        footnote={t.suggestCredit}
        accessibilityLabel={t.suggestLabel}
        testID="address-suggestions"
      />
      {/* Kota doldu (429): tek satır söylenir ve BİTER — alan yazmaya açık kalır, kaydetme
          engellenmez. Öneri yardımcı bir özellik; yokluğu müşterinin işini durdurmaz. */}
      {search.throttled ? <Note description={t.suggestBusy} tone="warm" testID="address-suggest-busy" /> : null}
      <View style={styles.zipRow}>
        <View style={styles.zipField}>
          <TextField
            value={draft.postalCode}
            onChangeText={(value) => {
              /* Kod ELLE değişti: önceki seçim artık bu kodun cevabı değil. Ülkeyi ve teslimat
                 cümlesini düşürmek şart — kalsalardı müşteri kodu değiştirdikten sonra hâlâ eski
                 yerin cevabını okur, üstelik o ülkeyle kaydederdi. */
              setZipOpen(true);
              setCityOpen(false);
              setCountry(null);
              setPlace(null);
              editDraft({ postalCode: value.replace(/\D/g, '').slice(0, 5) });
            }}
            accessibilityLabel={t.zipLabel}
            placeholder={t.zipPlaceholder}
            content="postalCode"
            testID="address-zip"
          />
        </View>
        <View style={styles.cityField}>
          <TextField
            value={draft.city}
            onChangeText={(value) => editDraft({ city: value })}
            accessibilityLabel={t.cityLabel}
            placeholder={t.cityPlaceholder}
            content="city"
            testID="address-city"
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
        accessibilityLabel={t.zipSuggestLabel}
        testID="address-zip-suggestions"
      />
      {/* Kodun yerleşimleri — yalnız ÇOK yerleşimli kodda ve yalnız kod seçildikten sonra. */}
      {cityOpen && place !== null ? (
        <SuggestionList
          items={place.places.map((name) => ({ id: name, title: name }))}
          onSelect={applyCity}
          accessibilityLabel={t.citySuggestLabel}
          testID="address-city-suggestions"
        />
      ) : null}
      {/* BÖLGE CÜMLESİ KALDIRILDI (kullanıcı kararı 11.08). Burada *"67 ile başlayan posta kodları
          teslimat bölgemizdedir"* yazıyordu; **genellenmiş ve statik** olduğu için de yanlıştı —
          ölçüldü: aktif bölgeler yalnız 67000 · 67100 · 67200 · 67300 · 67400 · 67540 · 67800.
          Müşterinin kayıtlı 67380 adresi bu cümleye göre bölge içindeydi ama ödeme ekranı aynı
          adrese "bölge dışı" diyordu; iki ekran zıt şey söylüyordu. Yerine yenisi YAZILMADI:
          kullanıcı kararı — kodların tam listesine zaten erişilebiliyor (teslimat bölgeleri
          sayfası), ve girilen kodun durumunu onboarding zaten GERÇEK veriden söylüyor. */}
      {error === null ? null : <Note description={error} tone="terracotta" testID="address-error" />}
      <PrimaryButton label={saving ? t.saving : (saveLabel ?? t.save)} onPress={save} disabled={saving} testID="address-save" />
      {editing === null ? null : (
        <View style={styles.deleteRow}>
          <TextAction label={t.delete} onPress={remove} tone="terracotta" disabled={saving} testID="address-delete" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space.lg,
  },
  /* Posta kodu dar sabit sütun + şehir kalan genişlik (v3:206-209 — zip 120px, şehir flex). */
  zipRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  zipField: { width: 120 },
  cityField: { flex: 1 },
  deleteRow: { alignItems: 'center' },
}));
