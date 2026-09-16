import { useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { z } from 'zod';
import type { PlaceNoticeBodySchema } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';

import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { submitPlaceNotice } from '@/lib/api/places';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { toastError, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
// Metin yer ailesinin ortak sözlüğünde: bandı iki liste birden çiziyor (katalog · paketler), web'in
// telefon görünümü de aynısını — cümle tek nüsha durmalı.
import messages from '@lezzet/i18n/customer/place';
import { rememberPlaceNotice, usePlaceNoticeRecord } from '@/lib/places/place-notice-store';
import { PlaceNoticeSheet } from './place-notice-sheet';
import { ToggleSwitch } from './toggle-switch';
import { PostalCodeSheet } from './postal-code-sheet';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { useSheet } from './use-sheet.hook';

/*
  BÖLGE DIŞI BİLGİ BANDI — müşteri listelerinin BAŞINDA tek blok: "kamyonumuz buraya gelmiyor,
  gönderebildiklerimiz kargoyla gelir". Kart başına tekrarlanan "Kargoyla gelir" işareti bu yüzden
  kalktı; kartta kalan tek yer işareti gönderemediğimiz ürünün şeridi (o da solmayla birlikte).

  İKİ LİSTE ÇİZER (katalog · paketler): paketler sekmesine alt çubuktan doğrudan gelinebiliyor ve
  katalogdan geçmeyen müşteri, adresinin gerçeğini hiç okumadan bir listeye bakıyordu. Bandın ikinci
  nüshası yazılmadı — ekranın adı bir prop oldu (`source`).

  KUTU KİTİN, DÜZEN TASARIMIN: tasarım bandı artık kendisi çiziyor (kod satırı · başlık + cümle ·
  kesik çizgiyle ayrılmış anahtar satırı). Kutu için yeni bileşen yazılmadı — kitin bilgi kutusunun
  terracotta tonu tasarımın zemini ve çerçevesiyle aynı değerleri taşıyor.

  BANT TEK BLOKTUR: eylem de anahtar da kutunun İÇİNDE durur, çünkü kutunun altına taşan parçalar
  ürün kartlarını ekranın yarısına itiyordu (ölçülmüş arıza). Eylem yuvası bu iş için kite eklendi;
  banda tek kullanımlık ikinci bir kutu çizilmedi, kitin öteki çağıranları değişmedi.

  BANDIN İKİ EYLEMİ: kod hapı yanlış kodu bandın gördüğü yerde düzelttirir (`PostalCodeSheet`, vitrin
  başlığındaki çekmecenin ta kendisi), "Buraya da gelin" ise bölgeyi talep olarak kaydeder — girişlide
  tek dokunuş, misafirde kendi çekmecesi (e-posta + kodla doğrulanmış hesap).

  KAYIT ALINDIĞINDA DÜĞME KALKAR: alınmış kaydı ikinci kez isteten düğme "sayılmadım mı?" sorusunu
  doğururdu. Hafıza bandın kendi örneğinde değil depoda (`lib/places/place-notice-store`), çünkü iki
  liste iki ayrı örnektir: katalogda kaydını bırakan müşteri paketler sekmesinde düğmeyi yeniden görürdü.
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
   * Kodun ŞEHRİ — hapta kodun yanında, vitrin başlığındaki biçimle ("75001 PARIS ▾"). `null` olabilir
   * (tanınan bir kodun adı bilinmeyebilir) ve o hâlde yalnız kod yazılır; uydurma şehir basılmaz.
   */
  placeName?: string | null;
  /** Talebin hangi listeden bırakıldığı — denetim izi; ekran adı, cümleyi değiştirmez. */
  source: PlaceNoticeSource;
  /**
   * **"Gelemeyenleri gizle" anahtarı** — kutunun en altında, kesik çizginin altında; süzgeç sayfasının
   * içindeyken açık kalıp listeyi ekranda hiçbir iz bırakmadan kısabiliyordu. Değer ile onu değiştiren yol
   * tek nesnede, çünkü biri ötekisiz anlamsız; verilmezse satır hiç çizilmez (paketler listesi).
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
  /* Kayıt alındı mı — `null` = henüz istenmedi ya da tamamlanmadı. Hafıza bandın kendi örneğinde değil
     depoda, çünkü iki liste iki ayrı örnektir: katalogda kaydını bırakan müşteri paketler sekmesinde
     aynı düğmeyi yeniden görürdü. */
  const recorded = usePlaceNoticeRecord(country, postalCode);
  const setRecorded = (record: 'ok' | 'already') => rememberPlaceNotice(country, postalCode, record);
  /** İstek uçuşta: çift dokunuş aynı talebi iki kez göndermesin. */
  const [sending, setSending] = useState(false);

  /* GİRİŞLİ MÜŞTERİ ÇEKMECE GÖRMEZ: e-postasını sormak sunucunun zaten bildiğini sormaktır ve tek
     dokunuşluk işi üçe çıkarırdı. Misafirde çekmece açılır (e-posta → kod → hesap → talep). */
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
   * @param email Yalnız cümle için (haber nereye gidecek); `null` ise adressiz cümle kurulur, boş bir
   *   yer tutucu basılmaz.
   */
  const recordSignedIn = (email: string | null) => {
    setSending(true);
    void submitPlaceNotice(locale, { postalCode, country, source }).then((result) => {
      setSending(false);
      /* Dört hâlin dördü de SÖYLENİR; sessiz geçilen hâl, müşteriye "sayıldım mı?" diye
         sordururdu. Kaydın alındığı iki hâlde eylem de kalkar. */
      if (result.error !== null) {
        toastError(t.placeNotice.failed);
        return;
      }
      if (result.data.status === 'place_unknown') {
        toastError(t.placeNotice.placeUnknown);
        return;
      }
      if (result.data.status === 'email_required') {
        // Oturum varken gelmemeli; sözleşme hâli olduğu için yine de sessiz geçilmez.
        toastError(t.placeNotice.emailRequired);
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
      toastSuccess(line);
    });
  };

  const request = () => {
    if (me === null) {
      noticeSheet.open();
      return;
    }
    recordSignedIn(me.email);
  };

  /* HAPIN ETİKETİ: kod + ŞEHİR, vitrin başlığındaki biçimin aynısı. Şehir büyük harfe dilin kendi
     kuralıyla çevrilir (`upperIn`), çünkü Türkçenin i/İ ayrımını `toUpperCase()` bozar; ad yoksa yalnız
     kod kalır. */
  const postalLabel =
    placeName === undefined || placeName === null ? postalCode : `${postalCode} ${upperIn(placeName, locale)}`;

  /* SÜZGEÇ EN ALTTA: kutunun içindeki sıra bilginin sırasıdır — önce hüküm, sonra yerle ilgili eylem, en
     sonda listeyi daraltan anahtar. Anahtar bilgi değil denetimdir; cümlenin arasına girseydi kutuyu
     okumak eylemle kesilirdi. */
  const filterRow =
    shippableFilter === undefined ? null : (
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t.placeNotice.hideUndeliverable}</Text>
        <ToggleSwitch
          value={shippableFilter.value}
          onToggle={() => shippableFilter.onChange(!shippableFilter.value)}
          accessibilityLabel={t.placeNotice.hideUndeliverable}
          testID={idOf('shippable-toggle')}
        />
      </View>
    );

  /* POSTA KODU KUTUNUN EN ÜSTÜNDE, BAŞLIKTAN ÖNCE: sıra cümlenin mantığıdır — önce "hangi yer için
     konuşuyoruz", sonra o yer hakkındaki hüküm. Hap vitrindekinin ta kendisidir (aynı biçim, aynı
     çekmece); eski "Posta kodunu değiştir" cümlesi ekran okuyucunun adı oldu. */
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

  /* KAYIT ALINDIYSA DÜĞME KOMPLE KALKAR — yerine "kaydınız zaten var" satırı geçmez, çünkü o cümle bilgi
     gibi görünüp yer kaplıyordu ve müşteri kaydını bıraktığını zaten toast'ta okudu. */
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
        tone="warm-accent"
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
  /* Anahtar satırı kutunun içinde KESİK bir çizgiyle ayrılır (tasarım): üstündeki iki satır bilgidir, bu satır
     denetim — ayraç olmadan ikisi tek blok gibi okunuyordu. */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space.lg,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['terracotta-line'],
    borderStyle: 'dashed',
    paddingTop: theme.space.md,
  },
  switchLabel: {
    // Kutunun kendi açıklama kademesiyle aynı aile: satır bir başlık değil, cümlenin devamı.
    flexShrink: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },
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
