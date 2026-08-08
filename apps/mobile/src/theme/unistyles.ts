import {
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
  customerColors,
  customerRadius,
  customerText,
  operationsAppColors,
  operationsAppGradient,
  operationsAppRadius,
  operationsAppShadow,
  operationsAppText,
  operationsBrand,
} from '@lezzet/design-tokens';
import { StyleSheet } from 'react-native-unistyles';

import { appFont } from './fonts';
import { parseLinearGradient } from './gradient';
import { appMetrics } from './metrics';
import { mapTokens } from './parse';

/*
  Unistyles teması — HER değer @lezzet/design-tokens'tan gelir; ham renk/ölçü buraya YAZILMAZ
  (envanter §0 kuralı mobilde de aynen geçerli, ölçü katmanının gerekçesi `metrics.ts`te).

  KOMPOZİSYON (02-mimari §3.6, kullanıcı kararı 07.08): tema "ortak taban + uygulama farkları"
  birleşimidir ve AYNI ADDAKİ ANAHTARDA UYGULAMA KAZANIR. Ayrım sonekle değil DOSYAYLA kurulu
  olduğu için burada tek bir yayma (spread) yeter; hangi değerin nereden geldiği paketin dosya
  sınırından okunur. Web'e sıfır etki: `customerApp*` ihraçlarını web hiç görmez.

  Müşteri vitrini TEK temalıdır (karanlık mod yalnız OPERASYON evreninde) — o yüzden yalnız
  `light` var. Operasyon yüzeyi (21.9) İKİNCİ temayı ekliyor; karanlık mod ona da GELMİYOR
  (`operations-app.ts`: operasyonun karanlık teması MASAÜSTÜ yüzeyinindir).
*/

/** 5 fark + 14 uygulamaya-yeni renk tabanın üstüne biner (`sand-300`, `star`, `error`, `scrim`…). */
const colors = { ...customerColors, ...customerAppColors } as const;

/** Uygulama kademeleri tabana eklenir; `eyebrow` üç alt-anahtarıyla birlikte uygulamadan gelir. */
const text = mapTokens({ ...customerText, ...customerAppText });

/** Resmî 4'lü set (rozet 12 · kontrol 16 · kart 20 · hap 22) tabanın `card`/`pill`ini ezer. */
const radius = mapTokens({ ...customerRadius, ...customerAppRadius });

/*
  GÖLGE — token dizgesi AYNEN tüketilir, ayrıştırılmaz. RN 0.76'dan beri `boxShadow` stil
  özelliği CSS söz dizimini iki platformda da (yeni mimari) aynı biçimde kabul ediyor; sert
  gölge (`3px 3px 0 ink`) böylece iOS'ta ve Android'de birebir aynı çiziliyor.

  `elevation` BİLEREK KULLANILMADI: Android'in elevation'ı gölgeyi BULANIKLAŞTIRIR, ofset ve
  renk almaz — v3'ün imzası olan kaydırılmış-keskin gölge onunla temsil edilemez (bulanık bir
  yaklaşıklık, tasarımın söylediği şey değildir). iOS'un `shadowOffset` + `shadowRadius:0`
  üçlüsü de tercih edilmedi: aynı görünümü ikinci bir dille ikinci kez tarif etmek olurdu ve
  Android tarafı yine açıkta kalırdı.
*/
const shadow = customerAppShadow;

/** CSS gradyan dizgesi → expo-linear-gradient prop'ları; çeviri `gradient.ts`te, tek yerde. */
const gradient = {
  photoTop: parseLinearGradient(customerAppGradient['photo-top']),
  photoBottom: parseLinearGradient(customerAppGradient['photo-bottom']),
} as const;

/*
  FONT AİLELERİ — token paketinin BİLİNÇLİ boşluğu: `customer.ts` "fontlar bilerek dışarıda…
  RN tarafı fontlarını kendi yükleyicisiyle kurar" diyor. Aile adları ve yüklenen varlıklar
  `fonts.ts`te, TEK yerde; burada yalnız temaya bağlanır. Seam AĞIRLIKLA indekslenir
  (`font.body[700]`) çünkü RN'de ağırlık ailenin ADININ İÇİNDEDİR — gerekçe `fonts.ts` başlığında.
*/
const font = appFont;

/** Test tarafı bağlantı kanıtı için de ihraç edilir (`unistyles.test.ts`). */
export const lightTheme = {
  colors,
  text,
  radius,
  shadow,
  gradient,
  font,
  ...appMetrics,
} as const;

/*
  ── OPERASYON TEMASI (21.9) ─────────────────────────────────────────────────
  ÜÇ KATMAN, aynı addaki anahtarda EN SON katman kazanır — birleştirmenin TÜKETİCİNİN işi olduğu
  `operations-app.ts` başlığında yazılı, burası o tüketici. Müşteri teması DEĞİŞMEDİ: `lightTheme`
  yukarıda olduğu gibi duruyor, operasyon farkı yalnız bu nesnede yaşıyor.

  MARKA anahtarı (`operationsBrand`) da yayılıyor: WhatsApp'ın koyultulmuş ikon yeşili
  (`brand-whatsapp` #128c4b) tasarımda kullanılıyor ve token paketinde ZATEN var — ikinci kez
  yazmak yerine oradan geliyor (o dosyanın açık hükmü). Müşterinin `brand-whatsapp-pure`ıyla
  çakışmaz: iki ayrı ad, iki ayrı bağlam.

  ── UNISTYLES'IN TİP SÖZLEŞMESİ: `theme` BİR BİRLEŞİMDİR (ÖLÇÜLDÜ) ──────────
  `UnistylesTheme = UnistylesThemes[keyof UnistylesThemes]`, yani `StyleSheet.create((theme) => …)`
  geri çağrısına gelen değer KAYITLI TÜM TEMALARIN BİRLEŞİMİDİR. TypeScript bir birleşimde ancak
  HER ÜYEDE bulunan anahtarı okutur. Ölçüldü (tsc probu, 08.08): iki tema kaydedilip
  `theme.colors.panel` okunduğunda `TS2339: Property 'panel' does not exist on type '… | …'`.
  Yani operasyona-ÖZGÜ duraklar (`panel`, `neutral-bg`, `ink-inset`, `warehouse`, `tab-inactive`,
  `meta`, `tag`, `tight`, `hard-on-ink`, `sticky-fade`) Unistyles'ın `theme` argümanından
  OKUNAMAZ. Unistyles'ın kendi dokümanı da aynı şeyi söylüyor: *"It's not recommended to use themes
  with different shapes"* (unistyl.es/v3/guides/theming).

  ÇÖZÜM — operasyon komponentleri token'larını BU SABİTTEN okur (`operationsTheme.colors.panel`).
  Bu bir kaçamak değil, tam olarak doğru olan: operasyon ekranları YALNIZ bu temanın altında
  çizilir, dolayısıyla sabit ile etkin tema aynı nesnedir. Alternatifler ÖLÇÜLDÜ ve elendi:
  · müşteri temasına operasyon anahtarlarını eklemek → şekli eşitler ama müşteri temasını
    değiştirir ve `panel`/`warehouse` müşteri vitrininde ANLAMSIZDIR (bir tonun iki evrende iki
    anlamı olurdu);
  · `theme` üstünde daraltıcı bir kapı (`asOperationsTheme`) → expo-router rota ağacını AÇILIŞTA
    topluca `require` eder, yani operasyon stil sayfaları müşteri teması etkinken de bir kez
    değerlendirilir; kapı o anda patlardı (sessiz düşmek de yasak — CLAUDE §1);
  · `ScopedTheme` sarmalayıcısı → tip birleşimini zaten çözmüyor, üstelik Unistyles'ın Jest
    mock'unda `() => null` olarak duruyor: operasyon ağacının TAMAMI testte kaybolurdu.

  KAYIT NEYE YARIYOR: PAYLAŞILAN kit (`PressableSurface`, `Icon`, `LoadingState`…) etkin temayı
  okur; `UnistylesRuntime.setTheme('operations')` çağrıldığında bu komponentler operasyon
  değerlerini görür. Bugün bu FARK İKİ DEĞERDİR (`cream` ve `olive-bg` — tek fark onlar), yani
  kayıt bugün görsel olarak az şey değiştiriyor; ama dikişin doğru yeri burası ve operasyon
  ekranları paylaşılan kitten öğe kullandıkça karşılığını verecek.
*/
export const operationsTheme = {
  colors: { ...customerColors, ...customerAppColors, ...operationsAppColors, ...operationsBrand },
  text: mapTokens({ ...customerText, ...customerAppText, ...operationsAppText }),
  radius: mapTokens({ ...customerRadius, ...customerAppRadius, ...operationsAppRadius }),
  shadow: { ...customerAppShadow, ...operationsAppShadow },
  /** Fotoğraf gradyanları tabandan aynen gelir; operasyonun kendi durağı yapışkan CTA solmasıdır. */
  gradient: { ...gradient, stickyFade: parseLinearGradient(operationsAppGradient['sticky-fade']) },
  font,
  ...appMetrics,
} as const;

const appThemes = {
  light: lightTheme,
  operations: operationsTheme,
} as const;

type AppThemes = typeof appThemes;

declare module 'react-native-unistyles' {
  // Unistyles'ın tip sözleşmesi: tema haritası module augmentation ile bildirilir (unistyl.es/v3).
  // Gövdesiz interface bilinçli — üyeler AppThemes'ten gelir, elle tekrar yazılmaz (CLAUDE §1).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  themes: appThemes,
  settings: {
    /* AÇILIŞ MÜŞTERİ TEMASIYLA: "oturumsuz kullanım = müşteri gezinmesi" (02-mimari §4, kullanıcı
       kararı 07.08) — uygulama giriş kapısıyla değil vitrinle açılır. Operasyon teması, operasyon
       kabuğu bağlandığında `UnistylesRuntime.setTheme` ile devralır (`(operations)/_layout.tsx`).
       `adaptiveThemes` AÇILMADI: iki tema aydınlık/karanlık çifti değil, iki AYRI YÜZEY. */
    initialTheme: 'light',
  },
});
