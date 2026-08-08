import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { deviceLocale } from '@/lib/i18n/locale';
import { AddressCard } from './address-card';
import { accountData, type AccountAddressView, type AccountData } from './account-fixture';
import messages from './messages.json';

/*
  PROFİLİ DÜZENLE (v3 `shPf` + `sa`) — ad/e-posta/telefon alanları, adres listesi ve adres formu.

  ── UI-ONLY (21.14 ikinci dilim) ────────────────────────────────────────────
  `/api/v1/me` sözleşmesi VAR ama bu ekran ona BAĞLANMADI (görevin açık kısıtı): kaydetme EKRANIN
  durumunda yaşıyor — yazılan gerçekten görünür, yalnız kalıcı değil. Bağlanma günü değişecek olan
  iki yazma çağrısıdır (profil · adres).

  ── ŞABLONDAN SAPMALAR ─────────────────────────────────────────────────────
  1. **Profil düzenleme SAYFA, yüzen sayfa (sheet) değil.** Şablon onu `shPf` yüzeninde çiziyor.
     Üç klavyeli alan + adres listesi bir yüzenin içinde telefon klavyesi açıkken ekranın yarısına
     sıkışırdı; ayrıca hesaptaki "Düzenle" bir YERE gitmeli ki geri tuşu anlamlı olsun. Adres
     FORMU şablondaki gibi yüzen sayfada kaldı — dört kısa alan, tek karar.
  2. **Onay toast değil, ekranda kalan bir kutu.** Şablon "Profil güncellendi ✓" toast'ı basıyor;
     toast küresel bir kabuk katmanı (vitrin ekranının kararı) ve bu uygulamada henüz yok.
  3. **Adres formunda "varsayılan" anahtarı YOK** — şablonda da yok: varsayılanlık listeden
     ("varsayılan yap") yönetiliyor, formda ikinci bir yol açmak aynı kararı iki yere yazardı.

  GÖRÜNÜR ETİKET YOK, YER TUTUCU VAR (şablonun kendi biçimi) — ama yer tutucu ekran okuyucuya AD
  değildir ve yazmaya başlayınca kaybolur: her alan ayrıca `accessibilityLabel` taşır.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Yeni adresin kimliği henüz yok — form bunu "kayıt mı, ekleme mi" ayrımı için kullanır. */
const NEW_ADDRESS_ID = '';

interface ProfileEditScreenProps {
  data?: AccountData;
}

export function ProfileEditScreen({ data = accountData() }: ProfileEditScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const router = useRouter();

  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone);
  const [profileSaved, setProfileSaved] = useState(false);

  const [addresses, setAddresses] = useState(data.addresses);
  /** Açık adres formu; kapalıyken `null`. */
  const [draft, setDraft] = useState<AccountAddressView | null>(null);
  const [draftError, setDraftError] = useState(false);
  const [addressFeedback, setAddressFeedback] = useState<string | null>(null);

  const openAddress = (address: AccountAddressView | null) => {
    setDraftError(false);
    setAddressFeedback(null);
    setDraft(
      address ?? {
        id: NEW_ADDRESS_ID,
        label: '',
        street: '',
        postalCode: '',
        city: '',
        isDefault: false,
      },
    );
  };

  const saveAddress = () => {
    if (draft === null) return;
    /* Şablonun kapısı: etiket, adres ve posta kodu olmadan kaydedilemez — şehir bunlardan
       türetilebilir bir bilgi değil ama teslimat kararını posta kodu verir. */
    if (draft.label.trim() === '' || draft.street.trim() === '' || draft.postalCode.trim() === '') {
      setDraftError(true);
      return;
    }
    const isNew = draft.id === NEW_ADDRESS_ID;
    const saved: AccountAddressView = isNew ? { ...draft, id: `address-${addresses.length + 1}` } : draft;
    setAddresses(isNew ? [...addresses, saved] : addresses.map((row) => (row.id === saved.id ? saved : row)));
    setDraft(null);
    setAddressFeedback(t.edit.address.saved);
  };

  const deleteAddress = () => {
    if (draft === null) return;
    setAddresses(addresses.filter((row) => row.id !== draft.id));
    setDraft(null);
    setAddressFeedback(t.edit.address.deleted);
  };

  const makeDefault = (id: string) =>
    setAddresses(addresses.map((address) => ({ ...address, isDefault: address.id === id })));

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.edit.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="profile-back" />}
        testID="profile-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="profile-form">
        <TextField
          value={name}
          onChangeText={(value) => {
            setName(value);
            setProfileSaved(false);
          }}
          accessibilityLabel={t.edit.nameLabel}
          placeholder={t.edit.namePlaceholder}
          testID="profile-name"
        />
        <TextField
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setProfileSaved(false);
          }}
          accessibilityLabel={t.edit.emailLabel}
          placeholder={t.edit.emailPlaceholder}
          testID="profile-email"
        />
        <TextField
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setProfileSaved(false);
          }}
          accessibilityLabel={t.edit.phoneLabel}
          placeholder={t.edit.phonePlaceholder}
          helperText={t.edit.phoneNote}
          testID="profile-phone"
        />
        <PrimaryButton label={t.edit.save} onPress={() => setProfileSaved(true)} testID="profile-save" />
        {profileSaved ? <Note description={t.edit.saved} tone="olive" testID="profile-saved" /> : null}

        <View style={styles.block}>
          <Text style={styles.blockTitle} accessibilityRole="header">
            {t.addresses.title}
          </Text>
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              copy={t.addresses}
              onMakeDefault={() => makeDefault(address.id)}
              onEdit={() => openAddress(address)}
              testID={`profile-address-${address.id}`}
            />
          ))}
          <TextAction label={t.addresses.add} onPress={() => openAddress(null)} testID="profile-address-add" />
          {addressFeedback === null ? null : (
            <Note description={addressFeedback} tone="olive" testID="profile-address-feedback" />
          )}
        </View>
      </ScrollView>

      {/* Adres formu kendi katmanını kurar (kitteki `BottomSheet`) — ekranın yerleşimine karışmaz. */}
      <BottomSheet
        visible={draft !== null}
        title={draft?.id === NEW_ADDRESS_ID ? t.edit.address.newTitle : t.edit.address.editTitle}
        onClose={() => setDraft(null)}
        testID="profile-address-sheet"
      >
        {draft === null ? null : (
          <>
            <TextField
              value={draft.label}
              onChangeText={(value) => setDraft({ ...draft, label: value })}
              accessibilityLabel={t.edit.address.labelLabel}
              placeholder={t.edit.address.labelPlaceholder}
              testID="profile-address-label"
            />
            <TextField
              value={draft.street}
              onChangeText={(value) => setDraft({ ...draft, street: value })}
              accessibilityLabel={t.edit.address.streetLabel}
              placeholder={t.edit.address.streetPlaceholder}
              testID="profile-address-street"
            />
            <TextField
              value={draft.postalCode}
              /* Posta kodu BEŞ HANE ve yalnız rakam (şablonun kendi kuralı): harf kabul eden bir
                 alan, teslimat bölgesini çözemeyen bir kayıt üretirdi. */
              onChangeText={(value) => setDraft({ ...draft, postalCode: value.replace(/\D/gu, '').slice(0, 5) })}
              accessibilityLabel={t.edit.address.zipLabel}
              placeholder={t.edit.address.zipPlaceholder}
              numeric
              testID="profile-address-zip"
            />
            <TextField
              value={draft.city}
              onChangeText={(value) => setDraft({ ...draft, city: value })}
              accessibilityLabel={t.edit.address.cityLabel}
              placeholder={t.edit.address.cityPlaceholder}
              testID="profile-address-city"
            />
            {/* Ret ALANIN değil FORMUN hatası (üç alandan hangisinin eksik olduğu tek tek
                söylenmez, şablonun metni de öyle): hata kutusu ekran okuyucuya da duyurulur. */}
            {draftError ? <Note description={t.edit.address.error} tone="error" testID="profile-address-error" /> : null}
            <PrimaryButton label={t.edit.address.save} onPress={saveAddress} testID="profile-address-save" />
            {/* Silme yalnız KAYITLI adreste (şablon: `del` yeni adreste `null`). */}
            {draft.id === NEW_ADDRESS_ID ? null : (
              <View style={styles.deleteRow}>
                <TextAction
                  label={t.edit.address.delete}
                  onPress={deleteAddress}
                  tone="terracotta"
                  testID="profile-address-delete"
                />
              </View>
            )}
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['2xl'],
  },
  block: { gap: theme.space.md },
  blockTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors.ink,
  },
  deleteRow: { alignItems: 'center' },
}));
