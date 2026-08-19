import type { LocalizedCopy } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { createAddress, deleteAddress, updateAddress, type AddressWrite, type MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { toastSuccess } from '@/lib/toast/toast-store';
import { AddressFields } from './address-fields';
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

  /* ÖNERİ DURUMU ARTIK BURADA DEĞİL (MB-06): BAN araması, posta kodu önerisi, çok yerleşimli
     kodun şehir listesi ve ülke türetimi `address-fields`e taşındı — aynı davranışı profesyonel
     başvurusu da kullanabilsin diye. Bu form yalnız SONUCU alır (`onCountryChange`) ve kaydı yazar.
     Teslimat durumu BİLEREK hiçbir yerde tutulmuyor: adres defterinin hizmet alanımızla ilgisi yok,
     o soru sepetin ve sipariş ekranının (kullanıcı kararı 10.08). */

  const editDraft = (patch: Partial<typeof draft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
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
      toastSuccess(t.deleted);
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
      {/* ÜÇ ALAN + ÖNERİLERİ ORTAK BLOKTA (MB-06): davranış `address-fields`e taşındı, çünkü aynı
          üç alanı profesyonel başvurusu da çiziyor ve orada hiçbir öneri yoktu. Buradan giden tek
          şey ALANLAR; kaydı (ve silmeyi) bu form yapmaya devam ediyor — ayrımın gerekçesi
          bileşenin künyesinde. Sözcükler yine bu formun sözlüğünden geçiyor. */}
      <AddressFields
        value={{ line1: draft.line1, postalCode: draft.postalCode, city: draft.city }}
        onChange={editDraft}
        onCountryChange={setCountry}
        active={active}
        copy={t}
        testIDPrefix="address"
      />
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
