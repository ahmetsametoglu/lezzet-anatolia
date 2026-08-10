import { addressLineOf } from '@lezzet/address-fr';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SuggestionList } from '@/components/ui/suggestion-list';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { createAddress, deleteAddress, updateAddress, type AddressWrite, type MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { useAddressSearch } from './use-address-search.hook';
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

/** Beş hane, yalnız rakam — Fransa posta kodu (form kapısı; asıl kural sunucuda). */
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

  /** Öneriye dokunuldu: satır, posta kodu ve şehir BİRLİKTE yazılır, liste kapanır. */
  const applySuggestion = (id: string): void => {
    const picked = search.suggestions.find((suggestion) => suggestion.id === id);
    if (picked === undefined) return;
    setSuggestOpen(false);
    editDraft({ line1: addressLineOf(picked), postalCode: picked.postalCode, city: picked.city });
  };

  const save = (): void => {
    const line1 = draft.line1.trim();
    const city = draft.city.trim();
    if (!line1 || !city || !POSTAL_CODE.test(draft.postalCode)) {
      setError(t.error);
      return;
    }
    /* `line2` gövdede BİLEREK yok: form göstermiyor; gönderilmeyen alana kapı dokunmaz
       (application patch kuralı) — web'den girilmiş kat/daire satırı burada kaybolmaz. */
    const body: AddressWrite = { label: draft.label.trim() || null, line1, postalCode: draft.postalCode, city };
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
            onChangeText={(value) => editDraft({ postalCode: value.replace(/\D/g, '').slice(0, 5) })}
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
      <Text style={styles.zipNote}>{t.zipNote}</Text>
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
  zipNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  deleteRow: { alignItems: 'center' },
}));
