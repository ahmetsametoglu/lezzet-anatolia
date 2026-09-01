import type { AddressKind } from '@lezzet/address-fr';
import { normalizePhone } from '@lezzet/helper';
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

/**
 * Hesabın künyesinden adres varsayılanı (22.08) — DÖRT çağıran aynı kuralı buradan okur.
 *
 * Tek satırlık bir dönüşüm ama dört yere elle yazılsaydı biri mutlaka ayrışırdı (CLAUDE §1);
 * özellikle `phone`un `null` hâli, biri `?? ''` yazmayı unuttuğu gün alanı "null" dizesiyle
 * doldururdu. Kimlik okunmamışsa `undefined` döner: form alanları boş açar ve müşteriden ister —
 * bilinmeyen bir künyeyi boş dizeyle doldurmak, "hesapta ad yok" demek olurdu.
 */
export function addressDefaultsOf(
  profile: { name: string; phone: string | null } | null | undefined,
): { recipient: string; phone: string } | undefined {
  if (profile == null) return undefined;
  return { recipient: profile.name.trim(), phone: profile.phone ?? '' };
}

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
  /**
   * YENİ adreste teslim alacak kişi ve numaranın varsayılanı — hesabın künyesi (22.08).
   *
   * ── NEDEN PROP, NEDEN `useMe()` DEĞİL ───────────────────────────────────────
   * Önce kanca doğrudan buraya takıldı ve TEST anında patladı: `useMe`ye abone olmak ilk aboneyle
   * `getSupabase()` çağırıyor, o da env istiyor (hook künyesinin ölçülmüş uyarısı — 10.08'de aynı
   * bağ kökten sökülmüştü). Form kitte yaşıyor ve dört ekran çağırıyor; buraya oturum bağı koymak
   * o bağı dördüne birden yayardı, üstelik formu kendi başına test edilemez kılardı.
   * Dosyanın kendi ilkesi de bunu söylüyor: **kalıcılık çağıranın, davranış burasının.** Dört
   * çağıranın dördü de profili ZATEN okuyor, yani değeri geçirmek onlara hiçbir yük getirmiyor.
   *
   * Verilmezse alanlar boş açılır ve doğrulama müşteriden ister — varsayılanın yokluğu formu
   * kilitlemez.
   */
  defaults?: { recipient: string; phone: string };
}

export function AddressForm({ editing, addresses, onSaved, saveLabel, active = true, defaults }: AddressFormProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  /*
    ── TESLİM ALACAK KİŞİ VE NUMARA: `null` = "MÜŞTERİ DOKUNMADI" ─────────────
    İki alan taslakta `string | null` tutuluyor ve `null` boş dize DEĞİL: "henüz dokunulmadı"
    demek. Görünen değer o hâlde hesabınkine düşer (`?? hesap`), müşteri yazdığı an dize olur ve
    yedek devreden çıkar — boş bıraktığı hâl bile (`''`) onun kararıdır ve doğrulamaya takılır.

    Neden bir `useEffect` ile doldurulmuyor: çekmece `/me` cevabından ÖNCE açılabiliyor. Efektle
    doldursaydık ya cevap gelene kadar alan boş görünürdü ya da müşteri o aralıkta yazdıysa
    yazdığını ezerdik. Türetilmiş değer ikisini de doğurmaz: cevap geldiği an alan dolar,
    müşterinin yazdığına hiç dokunulmaz.
  */
  const [draft, setDraft] = useState<{
    label: string;
    recipient: string | null;
    phone: string | null;
    line1: string;
    postalCode: string;
    city: string;
  }>({
    label: editing?.label ?? '',
    recipient: editing?.recipient ?? null,
    phone: editing?.phone ?? null,
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

  /* ── NOKTA: ÜLKENİN KARDEŞİ (11.9 · 01.09) ──────────────────────────────────
     BAN önerisi koordinatı zaten cevabında gönderiyor ve bu form onu 01.09'a kadar ATIYORDU:
     adres noktasız kaydediliyor, tarama işi on dakika sonra AYNI soruyu ikinci kez soruyordu.
     Arada kalan pencerede o durak posta kodu merkezine düşer — Strasbourg'da o merkez hiçbir şey
     ayırt etmiyor (ölçüldü 31.08: üç kod da aynı nokta), yani rota sırası keyfîleşiyordu.

     Düzenlemede BOŞ başlar ve bu bilinçli: kayıtlı nokta zaten satırda duruyor ve müşteri adresi
     değiştirmediyse kapı onu KORUYOR (`resolveAddressPoint`). Buraya mevcut noktayı koymak, hiçbir
     şey değişmemişken onu "yeni bir aday" gibi yeniden yazdırırdı — ve `geoAt` damgası her
     etiket düzenlemesinde tazelenirdi. */
  const [point, setPoint] = useState<{ lat: number; lng: number; precision: AddressKind } | null>(null);

  /* ÖNERİ DURUMU ARTIK BURADA DEĞİL (MB-06): BAN araması, posta kodu önerisi, çok yerleşimli
     kodun şehir listesi ve ülke türetimi `address-fields`e taşındı — aynı davranışı profesyonel
     başvurusu da kullanabilsin diye. Bu form yalnız SONUCU alır (`onCountryChange`) ve kaydı yazar.
     Teslimat durumu BİLEREK hiçbir yerde tutulmuyor: adres defterinin hizmet alanımızla ilgisi yok,
     o soru sepetin ve sipariş ekranının (kullanıcı kararı 10.08). */

  const editDraft = (patch: Partial<typeof draft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  /* HESABIN KÜNYESİ VARSAYILANDIR, KURAL DEĞİL (kullanıcı kararı 22.08): *"tamamen yeni adres
     kaydedilirken alanlar dolu gelecek; kullanıcı değiştirecek veya değiştirmeyip kaydedecek"*.
     Hesapta numara yazılı olmayabilir (`user_profiles.phone` nullable) — o hâlde alan boş gelir
     ve doğrulama müşteriden ister; varsayılan bir kolaylıktır, garanti değil. */
  const recipient = draft.recipient ?? defaults?.recipient ?? '';
  const phone = draft.phone ?? defaults?.phone ?? '';

  const save = (): void => {
    const line1 = draft.line1.trim();
    const city = draft.city.trim();
    const receiver = recipient.trim();
    const doorPhone = phone.trim();
    if (!receiver || !doorPhone || !line1 || !city || !POSTAL_CODE.test(draft.postalCode)) {
      setError(t.error);
      return;
    }
    /* `line2` gövdede BİLEREK yok: form göstermiyor; gönderilmeyen alana kapı dokunmaz
       (application patch kuralı) — web'den girilmiş kat/daire satırı burada kaybolmaz.

       `country` yalnız BİLİNİYORSA gönderilir: gönderilmeyen alanı kapı kodun kendisinden çözer.
       `null` iken boş bir değer göndermek, "bilinmiyor"u bir değere çevirmek olurdu. */
    const body: AddressWrite = {
      label: draft.label.trim() || null,
      recipient: receiver,
      /* E.164'e İSTEMCİDE indirgenir, web ile AYNI kapıdan (`normalizePhone`): tek sütunda iki
         biçim biriktirmek (`06 12 …` ile `+336 12 …`) aynı numarayı iki numara gibi gösterirdi.
         İndirgeme başarısızsa yazılan metin OLDUĞU GİBİ gider — adres defteri hiçbir hâlde
         reddetmez (kullanıcı kararı 10.08) ve elde bir numara olması, hiç olmamasından iyidir.
         Ülke posta kodundan türüyor; bilinmiyorsa `FR` (uygulamanın ana pazarı). */
      phone: normalizePhone(doorPhone, country ?? 'FR') ?? doorPhone,
      line1,
      postalCode: draft.postalCode,
      city,
      ...(country === null ? {} : { country }),
      /* Nokta yalnız SEÇİLDİYSE gönderilir. `null` göndermek de zararsız (kapı adayı yok sayar) ama
         gövdeyi anlamsız bir alanla şişirirdi; ülke alanının aynı kuralı. */
      ...(point === null ? {} : { point }),
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
      {/* TESLİM ALACAK KİŞİ + NUMARA — etiketin hemen ardında, sokaktan ÖNCE (22.08).
          Sıra bilinçli: adres "nereye" sorusunun cevabı, bu ikisi "kime" sorusunun; kapıda önce
          kişi sorulur. Altındaki tek cümle alanların NİÇİN sorulduğunu söylüyor — dolu gelen bir
          alanı gerekçesiz görmek, müşteriye "bunu neden benden istiyorlar" dedirtirdi. */}
      <TextField
        value={recipient}
        onChangeText={(value) => editDraft({ recipient: value })}
        accessibilityLabel={t.recipientLabel}
        placeholder={t.recipientPlaceholder}
        /* Kitin kendi kavramı (`content`), ham RN prop'u değil: tek ad üç ayara açılıyor —
           otomatik doldurma, iOS içerik türü ve klavye. Künyesi `text-field.tsx`te. */
        content="name"
        testID="address-recipient"
      />
      <TextField
        value={phone}
        onChangeText={(value) => editDraft({ phone: value })}
        accessibilityLabel={t.phoneLabel}
        placeholder={t.phonePlaceholder}
        content="tel"
        testID="address-phone"
      />
      <Note description={t.recipientHint} testID="address-recipient-hint" />
      {/* ÜÇ ALAN + ÖNERİLERİ ORTAK BLOKTA (MB-06): davranış `address-fields`e taşındı, çünkü aynı
          üç alanı profesyonel başvurusu da çiziyor ve orada hiçbir öneri yoktu. Buradan giden tek
          şey ALANLAR; kaydı (ve silmeyi) bu form yapmaya devam ediyor — ayrımın gerekçesi
          bileşenin künyesinde. Sözcükler yine bu formun sözlüğünden geçiyor. */}
      <AddressFields
        value={{ line1: draft.line1, postalCode: draft.postalCode, city: draft.city }}
        onChange={editDraft}
        onCountryChange={setCountry}
        onPointChange={setPoint}
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
