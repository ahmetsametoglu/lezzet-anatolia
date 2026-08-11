import { useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { submitPlaceNotice } from '@/lib/api/places';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { publishToast } from '@/lib/toast/toast-store';
// Metin YER AİLESİNİN yanında (`place-view.ts` künyesinin kendi kuralı): bandı iki liste birden
// çiziyor (katalog · paketler) ve cümle tek nüsha durmalı.
import messages from '@/lib/places/messages.json';
import { rememberPlaceNotice, usePlaceNoticeRecord } from '@/lib/places/place-notice-store';
import { shippableChipLabel } from '@/lib/places/place-view';
import { PlaceNoticeSheet } from './place-notice-sheet';
import { ToggleSwitch } from './toggle-switch';
import { PostalCodeSheet } from './postal-code-sheet';
import { useMe } from './use-me.hook';
import { useSheet } from './use-sheet.hook';

/*
  BÖLGE DIŞI BİLGİ BANDI (kullanıcı kararı 10.08) — müşteri listelerinin BAŞINDA tek bir blok.

  NEDEN VAR: kart başına tekrarlanan "Kargoyla gelir" işareti kaldırıldı çünkü rota dışı
  müşterinin kartlarının neredeyse tamamı onu taşıyordu — her kartta yazan bir bilgi, bilgi
  olmaktan çıkıp gürültü olur. Aynı cümle buraya, TEK yere taşındı: "kendi aracımız buraya
  gitmiyor, gönderebildiklerimiz kargoyla gelir". Kartlarda kalan tek yer işareti, GÖNDEREMEDİĞİMİZ
  ürünün notudur (o da solmayla birlikte).

  KATALOGDAN KİTE TAŞINDI (10.08): ikinci çağıranı doğdu — paketler sekmesi. O sekmeye alt
  çubuktan DOĞRUDAN gelinebiliyor, yani katalogdan geçmeyen bir müşteri adresinin gerçeğini hiç
  okumadan bir paket listesine bakıyordu. Bandın ikinci nüshası yazılmadı; ekranın adı bir prop
  oldu (`source`) ve kaydın hangi listeden geldiği yine izlenebiliyor.

  TASARIMDA YOK, KİTİN DİLİYLE KURULDU: v3'te bölge dışı katalog bandı çizilmemiş. Yeni bir görsel
  dil üretilmedi — kitin bilgi kutusu (`Note`) kullanıldı; sıcak nötr ton (`warm`) çünkü bu bir
  hata da bir fırsat da değil, adresin gerçeği. Sapma `design/KARARLAR.md` sonunda kayıtlı.

  ── BANT TEK BLOKTUR: EYLEMLER KUTUNUN İÇİNDE (kullanıcı kararı 10.08, ölçüm sonrası) ───────
  Eylemler önce kutunun ALTINA konmuştu ve cihazda şu çıktı: kutu bitiyor, altında yan yana iki
  yeşil bağlantı, onların da altında açılan bir e-posta formu — ürün kartları ekranın yarısına
  iniyordu (kullanıcının sözü: "üç metin butonu alt alta, gerçekten kötü görünüyor"). Şimdi bandın
  altına taşan hiçbir parça yok: kutunun içinde cümle ve İKİ metin eylemi var, o kadar.

  İKİ EŞİT SÜTUN, İÇERİKLERİ ORTALANMIŞ (kullanıcının seçtiği yerleşim): "Buraya da gelin" ·
  "Posta kodunu değiştir". Birincil düğme KULLANILMADI — ikisi de aynı ağırlıkta birer öneri;
  biri düğme olsaydı bant, bilgi levhası olmaktan çıkıp bir çağrıya dönerdi. Etiket dar ekranda
  iki satıra sarabilir, sütun hizası bozulmaz (`TextAction align="center"`).

  Kutunun eylem yuvası bu iş için KİTE eklendi (`Note action`), banda tek kullanımlık ikinci bir
  kutu çizilmedi — kitin öteki on çağıranı değişmedi.

  Cümle de KISALDI: iki cümlelik açıklama tek cümleye indi. Başlık zaten "aracımız gitmiyor"
  diyor; aynı bilgiyi gövdede tekrar etmek, altındaki eylemleri okunmaz hâle getiren bir metin
  duvarı kuruyordu.

  ── İKİ EYLEMİN İKİSİ DE BİR SORUYA CEVAP ───────────────────────────────────
  Bant eskiden yalnız kapıyı kapatıyordu ("aracımız gelmiyor") ve müşterinin elinde tek hareket
  kalıyordu: talep bırakmak. Ölçülen şikâyet şuydu — *"on posta kodu denedim, hiçbirine
  gitmiyorsunuz; siz nereye gidiyorsunuz?"*.
    · **Posta kodunu değiştir** — aynı çekmece (`PostalCodeSheet`), vitrin başlığındakinin TA
      KENDİSİ; 10.08'de kite taşındı, ikinci nüsha yazılmadı. Yanlış kod girmiş müşteri bandı
      gördüğü yerde düzeltir, vitrine geri dönmez. *"Nerelere gidiyorsunuz?"* bağlantısı da
      BANTTAN ORAYA taşındı (kullanıcı kararı): kendi kodunu denemekle "siz nereye gidiyorsunuz"
      aynı sorunun iki yüzü, ikisi aynı yerde durur — bantta üçüncü bir eylem kalmadı.
    · **Buraya da gelin** — talebi bırakma akışı. İKİ DALI VAR (kullanıcı kararı 10.08):
      **girişli** müşteride hiçbir katman açılmaz, talep tek dokunuşta bırakılır ve sonuç toast'la
      söylenir (e-posta cümlede geçer: haber nereye gidecek); **misafirde** kendi çekmecesi
      (`PlaceNoticeSheet`) açılır ve e-posta + tek kullanımlık kodla DOĞRULANMIŞ hesap kurulur.
      Girişliye e-posta sormak, sunucunun ZATEN bildiği bir şeyi sormaktır — çekmece açıp tek
      düğmeye bastırmak da tek dokunuşluk işi üç dokunuşa çıkarırdı. Çekmecenin kendi kararları o
      dosyanın künyesinde.

  KAYIT ALINDIĞINDA DÜĞME KALKAR: alınmış bir kaydı ikinci kez isteten düğme, "sayılmadım mı?"
  sorusunu doğururdu — yerine sonucun tek satırı geçer. **Bu söz 11.08'e kadar YALNIZ bandın kendi
  örneği içinde tutuluyordu** (`useState`) ve iki liste iki ayrı örnek olduğu için katalogda kaydını
  bırakan müşteri paketler sekmesinde aynı düğmeyi yeniden görüyordu; hafıza `lib/places/
  place-notice-store`a taşındı — cümle de, kararı da tek nüsha.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Gövde tipi SÖZLEŞMEDEN türer; `country` için elle bir birleşim yazılmaz (02-mimari §3.2). */
type NoticeBody = z.input<typeof PlaceNoticeBodySchema>;

/**
 * Kaydın hangi ekrandan geldiği — denetim izi (sözleşme: enum değil, serbest kısa dizge).
 *
 * DIŞA VERİLMEZ: çağıran değeri satır içinde yazıyor (`source="app-packages"`) ve tipi adıyla
 * anan kimse yok — kullanılmayan bir dışa verim `knip`in ölü listesine düşer.
 */
type PlaceNoticeSource = 'app-catalog' | 'app-packages';

interface PlaceNoticeBandProps {
  /** Çözülmüş yerin ülkesi — bant yalnız çözülmüş VE rota dışı yerde çiziliyor (çağıranın kapısı). */
  country: NoticeBody['country'];
  /** Normalize posta kodu (çözümden gelir, müşterinin yazdığı ham metin değil). */
  postalCode: string;
  /**
   * Kodun ŞEHRİ — kutudaki hapta kodun yanında yazılır (kullanıcı isteği 11.08), vitrin
   * başlığındaki gibi: *"75001 PARIS ▾"*. Çözümden gelir ve `null` OLABİLİR (sözleşme öyle diyor:
   * tanınan bir kodun adı bilinmeyebilir); o hâlde yalnız kod yazılır — boş bir yer tutucu ya da
   * uydurma bir şehir basmak, müşteriye olmayan bir yeri göstermek olurdu.
   */
  placeName?: string | null;
  /** Talebin hangi listeden bırakıldığı — denetim izi; ekran adı, cümleyi değiştirmez. */
  source: PlaceNoticeSource;
  /**
   * **"Adresime gönderilebilir" süzgeci** — verilirse bandın içinde bir anahtar satırı çizilir.
   *
   * Süzgeç 11.08'e kadar "Sırala & filtrele" sayfasının içindeydi ve kullanıcı onu oradan aldı:
   * *"zaten bu ancak teslimat noktalarımızın dışında çıkan bir filtreleme özelliği, bu sebepten
   * doğrudan katalog sayfasının içine, uyarı kartının içerisine koyabiliriz."* Karar yalnız
   * yerleşim değil, bir DOĞRULUK düzeltmesi: anahtar kapalı bir sayfanın içinde dururken açık
   * kalıp listeyi ekranda hiçbir iz bırakmadan kısabiliyordu.
   *
   * **KOŞULU YOK, ÇÜNKÜ BANDIN KOŞULUYLA AYNI:** süzgeç yalnız rota dışında anlamlı
   * (`shippableChipVisible` → `mode === 'shipping'`) ve bant da tam o hâlde çiziliyor (çağıranın
   * kapısı: çözülmüş + rota dışı). İki ayrı kapı yazmak, bir gün birinin ötekinden ayrılması
   * demekti — burada tek kapı var ve o çağıranın kapısıdır.
   *
   * Tek nesne, iki ayrı prop DEĞİL: değer ile onu değiştiren yol birbirsiz anlamsızdır; ikiye
   * bölünseydi yalnız birini geçen bir çağıran derlenir ve anahtar sessizce ölü kalırdı.
   * Verilmezse satır hiç çizilmez — paketler listesinde süzülecek bir şey yok.
   */
  shippableFilter?: { value: boolean; onChange: (next: boolean) => void };
  /** Alt öğelerin test kimlikleri bundan TÜREtilir — iki liste aynı bandı çiziyor, id'ler ayrışmalı. */
  testID?: string;
}

export function PlaceNoticeBand({
  country,
  postalCode,
  placeName,
  source,
  shippableFilter,
  testID,
}: PlaceNoticeBandProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  const zipSheet = useSheet();
  const noticeSheet = useSheet();
  /* Kayıt alındı mı — `null` = henüz istenmedi ya da tamamlanmadı.

     HAFIZA BANTTA DEĞİL DEPODA (kullanıcı bulgusu 11.08): bu bilgi iki listenin ORTAK gerçeği ve
     `useState` bileşene aittir — katalogda kaydını bırakan müşteri paketler sekmesinde aynı düğmeyi
     yeniden görüyordu, aşağıdaki "kayıt alındığında düğme kalkar" sözü tam da orada bozuluyordu.
     Anahtarın neden YER olduğu ve neden diske yazılmadığı deponun künyesinde. */
  const recorded = usePlaceNoticeRecord(country, postalCode);
  const setRecorded = (record: 'ok' | 'already') => rememberPlaceNotice(country, postalCode, record);
  /** İstek uçuşta: çift dokunuş aynı talebi iki kez göndermesin. */
  const [sending, setSending] = useState(false);

  /* GİRİŞLİ MÜŞTERİ ÇEKMECE GÖRMEZ (kullanıcı kararı 10.08): e-postasını sormak, sunucunun ZATEN
     bildiği bir şeyi sormaktır — ve bir çekmece açıp tek düğmeye bastırmak, tek dokunuşluk bir işi
     üç dokunuşa çıkarır. Girişlide talep DOĞRUDAN bırakılır, sonuç toast'la söylenir; e-posta
     cümlede geçer ki müşteri haberin nereye gideceğini bilsin. Misafirde akış değişmedi:
     çekmece açılır (e-posta → kod → hesap → talep). */
  const meState = useMe();
  const me = meState.status === 'ready' ? meState.me : null;

  /* Çekmecenin başlangıç değeri SAKLI koddur, bandın gösterdiği çözülmüş kod değil: ikisi bugün
     aynı olsa da kaynakları farklı (biri cihazın kaydı, öteki sunucunun cevabı) ve çekmece
     "kayıtlı olan ne" sorusunu sorar. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);

  /* Alt kimlikler bandın kendi kimliğinden TÜRER: iki liste aynı bandı çiziyor ve sabit
     "catalog-…" önekleri paketler sekmesinde yalan söylerdi. */
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  /**
   * Girişli müşterinin tek dokunuşu — e-posta GÖVDEYE KONMAZ, sunucu Bearer'dan çözer.
   *
   * @param email Yalnız CÜMLE için (haber nereye gidecek). `null` olabilir (profilde adres
   *   yoksa) ve o zaman adressiz cümle kurulur — boş bir yer tutucu basmak, müşteriye var
   *   olmayan bir adresi göstermek olurdu.
   */
  const recordSignedIn = (email: string | null) => {
    setSending(true);
    void submitPlaceNotice(locale, { postalCode, country, source }).then((result) => {
      setSending(false);
      /* Dört hâlin dördü de SÖYLENİR; sessiz geçilen hâl, müşteriye "sayıldım mı?" diye
         sordururdu. Kaydın alındığı iki hâlde eylem de kalkar. */
      if (result.error !== null) {
        publishToast(t.placeNotice.failed);
        return;
      }
      if (result.data.status === 'place_unknown') {
        publishToast(t.placeNotice.placeUnknown);
        return;
      }
      if (result.data.status === 'email_required') {
        // Oturum varken gelmemeli; sözleşme hâli olduğu için yine de sessiz geçilmez.
        publishToast(t.placeNotice.emailRequired);
        return;
      }
      setRecorded(result.data.status);
      const ok = result.data.status === 'ok';
      const line =
        email === null
          ? ok
            ? t.placeNotice.recorded
            : t.placeNotice.alreadyRecorded
          : (ok ? t.placeNotice.toastRecorded : t.placeNotice.toastAlready).replace('{email}', email);
      publishToast(line);
    });
  };

  const request = () => {
    if (me === null) {
      noticeSheet.open();
      return;
    }
    recordSignedIn(me.email);
  };

  /* HAPIN ETİKETİ: kod + ŞEHİR, vitrin başlığındaki biçimin aynısı (`{postal} {ŞEHİR} ▾`). Şehir
     BÜYÜK HARFE dilin kendi kuralıyla çevrilir (`toLocaleUpperCase(locale)`) — Türkçenin i/İ ayrımı
     `toUpperCase()` ile bozulur ve vitrin başlığı da bunu böyle yapıyor. Ad yoksa yalnız kod kalır. */
  const postalLabel =
    placeName === undefined || placeName === null ? postalCode : `${postalCode} ${placeName.toLocaleUpperCase(locale)}`;

  /* SÜZGEÇ EN ALTTA (kullanıcı kararı 11.08): kutunun içindeki sıra bilginin sırasıdır — önce
     "aracımız gelmiyor" (başlık + cümle), sonra yerle ilgili iki eylem, EN SONDA listeyi daraltan
     anahtar. Anahtar bir bilgi değil bir denetimdir; cümlenin arasına girseydi kutuyu okumak
     eylemle kesilirdi. Etiket kendi sözlüğünden gelir (`shippableChipLabel`), banda ikinci bir
     metin yazılmadı. */
  const filterRow =
    shippableFilter === undefined ? null : (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{shippableChipLabel(locale)}</Text>
        <ToggleSwitch
          value={shippableFilter.value}
          onToggle={() => shippableFilter.onChange(!shippableFilter.value)}
          accessibilityLabel={shippableChipLabel(locale)}
          testID={idOf('shippable-toggle')}
        />
      </View>
    );

  /* POSTA KODU KUTUNUN EN ÜSTÜNDE, BAŞLIKTAN ÖNCE (kullanıcı kararı 11.08, ikinci tur). Sıra
     cümlenin mantığı: önce "hangi yer için konuşuyoruz", sonra o yer hakkındaki hüküm ("bu bölgeye
     aracımız gitmiyor"). Hap eylem yuvasındayken hükümden SONRA geliyordu ve kartı okuyan, hangi
     kodun konuşulduğunu ancak sonda öğreniyordu.

     Hap VİTRİNDEKİNİN TA KENDİSİ (aynı biçim, aynı ton, aynı çekmece — ikinci nüsha yazılmadı):
     *"tıpkı vitrinde olduğu gibi posta kodu yazarız, daha anlaşılır ve görsel olur."* Eski "Posta
     kodunu değiştir" cümlesi silinmedi, ekran okuyucunun adı oldu — dokunulan şeyin ne yaptığı
     yine söyleniyor. */
  const codeChip = (
    <PressableSurface
      onPress={zipSheet.open}
      feedback="opacity"
      compact
      accessibilityLabel={t.placeNotice.changeCode}
      testID={idOf('change-zip')}
    >
      <Text style={styles.code}>{t.placeNotice.code.replace('{postal}', postalLabel)}</Text>
    </PressableSurface>
  );

  /* KAYIT ALINDIYSA DÜĞME KOMPLE KALKAR (kullanıcı kararı 11.08) — yerine "kaydınız zaten var"
     satırı GEÇMEZ. O cümle bir bilgi gibi görünüp yer kaplıyordu; müşteri kaydını bıraktığını zaten
     toast'ta okudu. Cümlenin kendisi sözlükte duruyor: toast'ın metni odur. */
  const cta =
    recorded !== null ? null : (
      <TextAction
        label={t.placeNotice.cta}
        onPress={request}
        disabled={sending}
        accessibilityHint={t.placeNotice.ctaHint}
        testID={idOf('cta')}
      />
    );

  /* Yuva BOŞSA HİÇ VERİLMEZ (paketler listesinde kayıt alınmışken tam da bu olur): boş bir
     sarmalayıcı, kutunun altına sebepsiz bir nefes eklerdi. */
  const actions =
    cta === null && filterRow === null ? undefined : (
      <View style={styles.stack}>
        {cta}
        {filterRow}
      </View>
    );

  return (
    <View style={styles.band} testID={testID}>
      <Note
        tone="warm"
        header={codeChip}
        title={t.placeNotice.title}
        description={t.placeNotice.body}
        action={actions}
      />

      {/* Çekmeceler İLK AÇILIŞTA kurulur ve kapanınca sökülMEZ — gerekçe `use-sheet.hook`ta. */}
      {zipSheet.mounted ? (
        <PostalCodeSheet
          visible={zipSheet.visible}
          code={onboarding?.postalCode ?? null}
          onClose={zipSheet.close}
          // Bant listenin başında: "nerelere gidiyorsunuz" sorusunun cevabı burada yok, sayfası var.
          showZonesLink
          testID={idOf('zip')}
        />
      ) : null}

      {noticeSheet.mounted ? (
        <PlaceNoticeSheet
          visible={noticeSheet.visible}
          country={country}
          postalCode={postalCode}
          source={source}
          onClose={noticeSheet.close}
          onRecorded={setRecorded}
          testID={idOf('notice')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  band: {
    // Izgaranın üst nefesi kartlar için; bant listenin başında kendi payını taşır.
    paddingBottom: theme.space.md,
  },
  /** Eylem yuvasının dikey yığını — "Buraya da gelin" (varsa) + süzgeç satırı. Yuvanın sola
      yaslamasını EZER (`alignSelf`) ki süzgeç satırı kutunun enini kaplasın ve anahtar sağ kenara
      otursun; yaslama kalsaydı satır yalnız etiketi kadar daralırdı. */
  stack: {
    alignSelf: 'stretch',
    rowGap: theme.space.lg,
  },
  /** Süzgeç satırı: etiket solda, anahtar sağda — süzgeç sayfasındaki satırın ta kendisi, oradan
      taşındı (ikinci bir yerleşim uydurulmadı). */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space.lg,
  },
  switchLabel: {
    // Kutunun kendi açıklama kademesiyle aynı aile: satır bir başlık değil, cümlenin devamı.
    flexShrink: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },
  /* İKİ EŞİT SÜTUN KALKTI (11.08): hap kutunun üst yuvasına, "Buraya da gelin" tek başına yığına
     geçti — yan yana iki eylem kalmayınca satırı bölecek bir şey de kalmadı. Sola yaslama artık
     kutunun kendi hizasından geliyor (`Note` yuvaları `flex-start`), ayrı bir sütun stiline gerek
     yok. */
  /** Posta kodu hapı — vitrin başlığındaki `location` stilinin BİREBİR aynısı (aynı görsel dil:
      vurgu tonu, kalın, hafif harf aralığı, sonunda açılır işareti). Kademe orada `micro`; burada
      kutunun içinde tek başına duran bir denetim olduğu için `body-sm`e çıkıyor — müşterinin
      dokunacağı şey, üstündeki cümleden küçük olmamalı. */
  code: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    letterSpacing: theme.text['body-sm'] * 0.08,
    color: theme.colors.terracotta,
  },
}));
