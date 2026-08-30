import { BlurView } from 'expo-blur';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { PressableSurface } from './pressable-surface';

/*
  ALT SEKME ÇUBUĞU — uygulamanın kabuğu (v3 `tabs`, dört sekme: Vitrin · Katalog · Siparişler ·
  Hesap). Sepet sekme DEĞİLDİR (envanter §4): sepete FAB ve yapışkan barlardan gidilir.

  YÖNLENDİRMEYİ BİLMEZ: girdisi `items` dizisidir (etiket + ikon + seçili mi + basılınca ne
  olacak), yani navigasyon kütüphanesinin şeklinden bağımsızdır. Router'ın kendi tab bar prop'unu
  bu komponente doğrudan geçirmek, kiti expo-router sürümüne bağlardı; çeviri kabuk katmanının
  (`app/(tabs)/_layout.tsx`) işi.

  İKON ARTIK VAR (21.7): tasarımın 23 px'lik çizgi ikonları `react-native-svg` ile, yolları
  şablondan birebir alınarak çiziliyor (`icon-paths.ts` — v3:1745 `IC` sözlüğü). İkon ADI çağırandan
  gelir, çünkü hangi rotanın hangi ikonu taşıdığı navigasyonun bilgisidir, çubuğun değil.

  ROZET YOK: tasarımın `t.badge` yuvası ölü (envanter §8.6 — sayaç sepet sekmesi içindi, o sekme
  de yok). Ölü bir alanı port etmemek envanter §8.13'ün kararı.

  ZEMİN KREM CAM (Token Kararlari #17): %96 krem + `blur(8px)`. Gerekçe ve Android'in
  `BlurTargetView` açığı `AppBar` künyesinde, tek yerde yazılı — aynı yüzey, aynı karar.

  ── İKİ YÜZEY, TEK ÇUBUK (21.9) ─────────────────────────────────────────────
  Operasyon yüzeyinin sekme çubuğu İSKELET olarak bunun AYNISIDIR: krem cam + üst çizgi + eşit
  dört yuva + ikon üstü etiket. Ayrıştığı yer yalnız TON: seçili renk, seçilmeyen renk, üst çizgi,
  etiket kademesi, ikon ölçüsü, seçili ikonun vurgusu ve basılı geri bildirim.
  Bu yüzden ikinci bir çubuk YAZILMADI (CLAUDE §1 — komponent duplikasyonu da duplikasyondur);
  fark tek bir `tone` prop'una indi ve karar KİTİN İÇİNDE kaldı: çağıran renk geçirmez, hangi
  yüzeyde olduğunu söyler.

  ── OPERASYON TONU v3'E ÇEKİLDİ (ölçüldü 30.08) ─────────────────────────────
  Şablonun kendi mantığı (`c.tabDepo = tab === 'depo' ? vurgu : '#a8a191'`) üç şey söylüyor:
  · SEÇİLİ SEKME ARTIK VURGU RENGİ, mürekkep değil — v2'de `#343b41`ti. Karar tek başına değil:
    v3 bölüm üstbaşlıklarını da dört bölümde birden zeytine çevirdi (`section-header.tsx`
    künyesi). Yani renk "hangi bölümdeyim" demeyi bıraktı, "operasyondayım" demeye başladı;
    çubuk da aynı cümleyi kuruyor.
  · Seçilmeyen ton `tab-inactive` durağının YENİ değeri (#a8a191) — token künyesinde ölçüldü.
  · İkon 22 → 20 (`tabIconOperations`), etiket 10,5 → 10 (`badge-sm`), yatay dolgu 8 → 6 (`sm`).
  Krem cam + bulanıklık KORUNDU: v3 çubuğu `#f6f4ec` opak çiziyor ama o değer `cream`e Δ4/4/4
  uzaklıkta, yani `cream-glass`ın %96 opak hâliyle ekranda ayırt edilemez — ölçülemeyen bir fark
  için paylaşılan kitin yapısını (BlurView) bölmek, kazanç olmadan risk almaktı.

  OPERASYON DEĞERLERİ `operationsTheme` SABİTİNDEN okunuyor, `theme` argümanından değil: Unistyles
  geri çağrısındaki tema KAYITLI TEMALARIN BİRLEŞİMİDİR ve TypeScript birleşimde yalnız ortak
  anahtarları okutur — `tab-inactive` yalnız operasyon temasında var. Ölçüm ve elenmiş
  alternatifler `theme/unistyles.ts` künyesinde, tek yerde.
*/

/** Çubuğun hangi yüzeyde durduğu — renk/kademe kararı bu addan türer, çağırandan değil. */
type BottomTabTone = 'customer' | 'operations';

/** Tek sekme — kabuk hangi rotanın seçili olduğunu bilir, çubuk yalnız çizer. */
export interface BottomTabItem {
  /** Rota adı; liste anahtarı ve test kimliği olarak da kullanılır. */
  key: string;
  /** Görünen etiket — i18n üstte çözülür. */
  label: string;
  /** Sekmenin ikonu (`icon-paths.ts` sözlüğünden) — hangi rotanın hangi ikonu, kabuğun bilgisi. */
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}

interface BottomTabBarProps {
  items: BottomTabItem[];
  /** Varsayılan müşteri vitrini; operasyon kabuğu kendi tonunu ister. */
  tone?: BottomTabTone;
  testID?: string;
}

export function BottomTabBar({ items, tone = 'customer', testID }: BottomTabBarProps) {
  const { theme } = useUnistyles();

  /* İkon ve etiket TEK kaynaktan boyanır (şablon ikonu `currentColor` ile boyuyor). Renk STİL
     DEĞİL PROP olarak da gerektiği için (`Icon`ın `color`u) stil sayfasında değil burada durur —
     iki yerde yazılsaydı ikon ile etiketin rengi bir gün ayrışırdı. */
  const stateColors =
    tone === 'operations'
      ? { selected: operationsTheme.colors.olive, idle: operationsTheme.colors['tab-inactive'] }
      : { selected: theme.colors.terracotta, idle: theme.colors.muted };

  /* İkon ölçüsü de tondan: iki yüzeyin durağı v3'te ayrıldı (künye üstte, ölçüm `metrics.ts`te). */
  const iconSize = tone === 'operations' ? operationsTheme.size.tabIconOperations : theme.size.tabIcon;

  return (
    <BlurView
      intensity={theme.glassBlurIntensity}
      tint="light"
      style={[styles.bar, styles[`${tone}Bar`]]}
      testID={testID}
      accessibilityRole="tablist"
    >
      <View style={styles.glass} pointerEvents="none" testID={testID === undefined ? undefined : `${testID}-glass`} />
      {items.map((item) => (
        // Genişliği YUVA dağıtır: `PressableSurface`in stili iç yüzeydedir, dış `Pressable`a
        // `flex: 1` geçirilemez — dördü eşit paylaşsın diye sarmalayıcı burada.
        <View key={item.key} style={styles.slot}>
          <PressableSurface
            onPress={item.onPress}
            /* Müşteri şablonu sekmede opaklık kullanıyor, operasyon v2 küçültme (`scale(.94)` —
               kitin `scale` durağına, .97'ye çekildi; .9'a olan uzaklık daha büyük). */
            feedback={tone === 'operations' ? 'scale' : 'opacity'}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            selected={item.selected}
            /* Görsel yüksekliği (etiket + dolgu) 44 dp'nin altında: dokunma payı ekleniyor. */
            compact
            style={styles.item}
            testID={testID === undefined ? undefined : `${testID}-${item.key}`}
          >
            {/* İkonun rengi etiketle AYNI kaynaktan: şablon ikonu `currentColor` ile boyuyor,
                yani ikon ile etiket tek bir durum rengini paylaşıyor. RN renk mirası vermediği
                için değer açıkça geçiliyor — ama seçim yine tek koşuldan okunuyor.

                DÖNÜŞÜM SARMALAYICIDA, ikonun kendisinde değil: `Icon` bir SVG çizer ve stil
                prop'u YOKTUR (renk/boy dışında bir görünüm kararı ikona ait değildir). Şablon da
                dönüşümü ikonun kutusuna uyguluyor. */}
            <View style={item.selected && tone === 'customer' ? styles.selectedIcon : undefined}>
              <Icon
                name={item.icon}
                size={iconSize}
                color={item.selected ? stateColors.selected : stateColors.idle}
              />
            </View>
            <Text
              style={[
                styles.label,
                styles[`${tone}Label`],
                { color: item.selected ? stateColors.selected : stateColors.idle },
              ]}
            >
              {item.label}
            </Text>
          </PressableSurface>
        </View>
      ))}
    </BlurView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    borderTopWidth: theme.border.base,
    paddingTop: theme.space.md,
    paddingHorizontal: theme.space.md,
  },
  /** Müşteri: mürekkep üst çizgi + tasarımın 6 px alt dolgusu (v3). */
  customerBar: {
    borderTopColor: theme.colors.ink,
    /* Alt güvenli alan çubuğun İÇİNDE ama tasarım dolgusuyla TOPLANMAZ — ikisinin büyüğü yeter
       (kullanıcı ölçümü 08.08: Android'de -inset 0- yükseklik idealdi, iOS'ta toplam çubuğu
       tasarımdan belirgin yükseltiyordu). Home indicator alanı zaten dolgu görevi görür. */
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  /** Operasyon: kum ayracı (`#ddd6c4` → `sand-300`) + 10 px alt, 6 px yan dolgu (v3). */
  operationsBar: {
    borderTopColor: operationsTheme.colors['sand-300'],
    // Aynı kural: inset ile dolgunun büyüğü (gerekçe üstte).
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    // v3 `padding:8px 6px 10px` — yatay nefes müşterininkinden 2 dp dar (dört yuva daha geniş).
    paddingHorizontal: theme.space.sm,
  },
  /** Bulanıklığın üstündeki krem katman — gerekçesi `AppBar`da, aynı yüzeyin ikizi. */
  glass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
  slot: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    gap: theme.space['2xs'],
    paddingVertical: theme.space.sm,
  },
  /**
   * Seçili sekmenin ikonu bir tık yukarı kalkar ve büyür — MÜŞTERİ tasarımının durum vurgusu.
   * Operasyon v2'de bu vurgu YOK: orada seçili olma yalnız RENKLE söyleniyor (mürekkep ↔
   * `tab-inactive`). Vurguyu oraya da taşımak, tasarımın vermediği bir kararı uydurmak olurdu.
   */
  selectedIcon: {
    transform: [{ translateY: theme.tabSelected.lift }, { scale: theme.tabSelected.scale }],
  },
  label: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
  },
  /* Müşteri tasarımı 10,5/700; ölçekte o durak yok (envanter §3b'nin bilinen açığı). Boy `micro`
     (11,5), ağırlık üstbaşlık kademesinden (700) — `eyebrow` (10) sayıca daha yakın ama harf
     aralığı .18em'dir ve büyük harf içindir; sekme etiketi cümle biçimlidir. */
  customerLabel: { fontSize: theme.text.micro },
  /* Operasyon v3 etiketi TAM 10 px — yuvarlama gerekmiyor, `badge-sm` o ölçünün kendisi.
     `meta` (10,5) durağı yerinde kalıyor: v3'te 42 kullanımı var, yalnız artık bu satır değil. */
  operationsLabel: { fontSize: operationsTheme.text['badge-sm'] },
}));
