import { useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { LocalizedCopy } from '@lezzet/i18n';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Note } from '@/components/ui/note';
import { SectionHeader } from '@/components/ui/section-header';
import { TextAction } from '@/components/ui/text-action';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useSheet } from '@/screens/customer-kit/use-sheet.hook';
import messages from './messages.json';
import { useDeliveryZones } from './use-delivery-zones.hook';

/*
  TESLİMAT BÖLGELERİ — "siz nereye gidiyorsunuz?" sorusunun cevabı (kullanıcı kararı 10.08).

  NİYE VAR: bölge dışı müşteri bugüne dek yalnız "buraya gelmiyoruz" cümlesini okuyordu ve
  ölçülen tepki şuydu — *"on posta kodu denedim, hiçbirine gitmiyorsunuz"*. Gittiğimiz yerlerin
  listesi hiçbir ekranda yoktu; müşteri haritayı kod kod deneyerek kendi çıkarmak zorundaydı.
  Sayfanın kapısı bilgi bandındaki "Nerelere gidiyorsunuz?" bağıdır (katalog · paketler).

  ── LİSTE POSTA KODUDUR (kullanıcı düzeltmesi 10.08) ────────────────────────
  ~~Liste şehir ADIYLA okunur ("insanın tanıdığı dil"), kodla değil.~~ Kullanıcı bunu ölçüp
  düzeltti: *"ben senden posta kodlarını göster istedim, veritabanındaki delivery zone name'in
  müşteri için bir anlamı yok ki"*. Haklı — bölge adı OPERASYONUN rota etiketidir ("Strasbourg
  merkez rota 2"); müşterinin elindeki tek anahtar kendi posta kodudur ve sayfaya "benimki var mı"
  diye bakar.

  ── ÖBEK VE SATIR ŞEKLİ İKİ TURDA OTURDU ────────────────────────────────────
  Kullanıcı ÖLÇEĞİ sordu — *"yarın iki yüz posta koduna hizmet veriyorum, ellisi Almanya'da"* — ve
  düz kod listesi orada çöktü: 200 satır okunmaz, Alman kodu Fransız kodunun arasına karışır. Uç
  bu yüzden **ülke → yer → kodlar** diye öbekli döndürüyor (`DeliveryAreaListSchema`).
  ~~Kodlar rozet ızgarası olarak çizilir.~~ İlk deneme cihazda görüldü ve kullanıcı eledi: *"bu
  tasarım çok kötü, aşırı kötü"*. Her komün bir BAŞLIK, her kod bir ROZETTİ; yedi kod ekranı
  dolduruyordu. Şimdi **satır başına tek yer**: `Strasbourg (67000 · 67100 · 67200)` — ad ve
  kodları aynı satırda, parantez içinde (kullanıcının kendi önerisi). 80 komün 80 satırdır, 80
  başlık + 200 rozet değil.

  Müşterinin KENDİ kodunu denemesi ayrı ve tek bir eylemdir: aynı posta kodu çekmecesi
  (`PostalCodeSheet`), vitrin başlığındakinin ta kendisi — ikinci bir alan yazılmadı.

  ── ÜÇ HÂLİN ÜÇÜ DE ÇİZİLİ, VE ÜÇÜ AYRI ŞEY SÖYLER ──────────────────────────
  · yükleniyor — listenin SKELETON'ı (kullanıcı kararı 10.08; eskiden kitin halkasıydı),
  · hata       — kitin hata kutusu (`Note tone="error"`) + tekrar dene. Sayfanın kalanı (giriş
                 cümlesi, kod deneme, kapanış) YERİNDE kalır: liste okunamadı diye "kargoyla
                 gönderiyoruz" bilgisi yanlış olmaz, onu da gizlemek müşteriyi boş bir sayfada
                 bırakırdı.
  · boş liste  — HATA DEĞİL (sözleşmenin açık hükmü): ilan edilmiş tek bir posta kodu bile
                 olmayabilir. Kitin boş durumu kendi cümlesiyle söyler.

  ── TASARIMDA YOK, KİTİN DİLİYLE KURULDU ────────────────────────────────────
  v3'te bu sayfa çizilmemiş. Yeni bir görsel dil üretilmedi: başlık çubuğu · bölüm başlığı ·
  bilgi kutusu · metin eylemi · boş durum — hepsi kitin mevcut komponentleri, tüm ölçü ve renkler
  token'dan. Sapma `design/KARARLAR.md` sonunda kayıtlı.
*/

type Messages = LocalizedCopy<typeof messages>;

export function DeliveryZonesScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const zones = useDeliveryZones();

  const zipSheet = useSheet();
  /* Çekmecenin başlangıç değeri cihazda SAKLI koddur — sayfa kendi başına bir kod tutmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);

  const list =
    zones.status === 'loading' ? (
      /* Halka yerine LİSTENİN KENDİSİ bekler (kullanıcı kararı 10.08): burada bekleyen şey bir
         işlem değil bir YERLEŞİM — ülke başlığı ve altında yer satırları. Halka o yerleşimi
         tutmuyordu ve liste gelince sayfa bir anda uzuyordu. Ölçüler sayfanın kendi stillerinden;
         iki öbek ve dörder satır "en az makul" (fazlası veri gelince kaybolur, azı eklenir). */
      <View
        style={styles.groups}
        testID="zones-loading"
        accessible
        accessibilityRole="progressbar"
        /* Ekran okuyucuya TEK ses: rol + ad + meşgul. Ad korundu çünkü halkanın yerini alan bu
           blok, ekranda yazılı hiçbir şey taşımıyor — "ilerleme çubuğu" tek başına neyin
           beklendiğini söylemezdi. */
        accessibilityLabel={t.loading}
        accessibilityState={{ busy: true }}
      >
        {[0, 1].map((group) => (
          <View key={group} style={styles.group}>
            <Skeleton width="38%" height={theme.text.h2 * theme.text['h1--line-height']} tone="deep" />
            {[0, 1, 2, 3].map((row) => (
              <Skeleton
                key={row}
                width={row % 2 === 0 ? '86%' : '72%'}
                height={theme.text.body * theme.text['lead--line-height']}
              />
            ))}
          </View>
        ))}
      </View>
    ) : zones.status === 'error' ? (
      <View style={styles.errorBlock}>
        <Note tone="error" description={t.errorBody} testID="zones-error" />
        <TextAction label={t.retry} onPress={zones.retry} testID="zones-retry" />
      </View>
    ) : zones.areas.length === 0 ? (
      /* `fill={false}`: kaydırma kabının içinde bir gövde parçası — üstünde başlık, altında açıklama
         blokları var; ortalama onları aşağı iterdi. */
      <EmptyState
        fill={false}
        icon={<CustomerIcon name="truck" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
        title={t.empty.title}
        description={t.empty.body}
        testID="zones-empty"
      />
    ) : (
      <View style={styles.groups} testID="zones-list">
        {zones.areas.map((area) => (
          <View key={area.country} style={styles.group}>
            {/* Ülke adı EKRANIN sözlüğünden: sunucu ülke KODU gönderiyor (`FR`) — cümleyi kuran
                taraf her zaman ekran (uç biçimli metin göndermez, katalog kartının kuralı). */}
            <Text style={styles.country}>{t.countries[area.country]}</Text>
            {area.places.map((place, index) => (
              /* SATIR BAŞINA TEK YER: ad + parantez içinde kodları (kullanıcı kararı 10.08).
                 Önceki hâlde her komün bir BAŞLIK, her kod bir ROZETTİ ve yedi kod ekranı
                 dolduruyordu — 80 komünde okunamaz bir duvar olurdu. Kullanıcının sözü: *"bu
                 tasarım çok kötü… isminin yanına parantez içerisinde posta kodlarını yazabiliriz"*.
                 Anahtar ada + SIRAYA bağlı: adsız öbek `null` taşır ve iki ülke aynı yer adını
                 taşıyabilir — çıplak ad anahtarı o gün çakışırdı. */
              <Text key={`${place.name ?? ''}-${index}`} style={styles.placeLine} testID={`zones-place-${index}`}>
                {/* Adı olmayan öbek YALNIZ kodlarıyla çizilir (sözleşmenin `name: null` hâli):
                    yer kaydı yok diye kodu gizlemek, gittiğimiz bir yeri saklamak olurdu. */}
                {place.name === null ? place.codes.join(' · ') : `${place.name} (${place.codes.join(' · ')})`}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="zones-back" />}
        testID="zones-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="zones-scroll">
        <Text style={styles.intro}>{t.intro}</Text>
        <SectionHeader eyebrow={t.listEyebrow} testID="zones-section" />
        {list}
        {/* Kod denemesi listenin ALTINDA: önce "nerelere gidiyoruz" cevaplanır, sonra "peki ben
            neredeyim" sorulur. Üstte dursaydı sayfa, cevabını verdiği soruyu geri sorardı. */}
        <TextAction
          label={t.tryCode}
          onPress={zipSheet.open}
          accessibilityHint={t.tryCodeHint}
          testID="zones-try-code"
        />
        {/* KAPANIŞ CÜMLESİ: liste bir kapı değil bir haritadır — "burada yoksanız satmıyoruz"
            diye okunmasın diye sayfanın sonunda kargo yolu açıkça söylenir. */}
        <Note tone="warm" description={t.closing} testID="zones-closing" />
      </ScrollView>

      {/* Çekmece İLK AÇILIŞTA kurulur (bandın aynı kararı) — gerekçe `use-sheet.hook`ta. */}
      {zipSheet.mounted ? (
        <PostalCodeSheet
          visible={zipSheet.visible}
          code={onboarding?.postalCode ?? null}
          onClose={zipSheet.close}
          // Bağlantı ÇİZİLMEZ: müşteri zaten o sayfada — kendine götüren bir kapı ölü kapıdır.
          showZonesLink={false}
          testID="zones-zip"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space['4xl'],
    paddingBottom: theme.space['9xl'],
    gap: theme.space['3xl'],
  },
  intro: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  /** Saran rozet ızgarası — kodlar aynı boyda, göz bir bakışta tarar. */
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space.lg,
    rowGap: theme.space.lg,
  },
  /** Ülke öbekleri — aralarındaki nefes, satır aralığından BÜYÜK: hiyerarşi boşlukla okunur. */
  groups: { gap: theme.space['4xl'] },
  group: { gap: theme.space.md },
  country: {
    fontFamily: theme.font.display[theme.text['h2--font-weight']],
    fontSize: theme.text.h2,
    color: theme.colors.ink,
    marginBottom: theme.space['2xs'],
  },
  /** Tek satır: "Strasbourg (67000 · 67100 · 67200)". Sarabilir; sarınca da tek blok kalır. */
  placeLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  errorBlock: {
    gap: theme.space.lg,
    alignItems: 'flex-start',
  },
}));
