import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import { OperationsDashedFrame } from './dashed-frame';

/*
  YÜZEY — operasyon mobil v3'ün taşıyıcı kutusu: hub kutucuğu, liste satırı, seçilebilir alan,
  ekleme daveti. Kodda 41 yerde elle çizilmişti; tasarımda ise TEK bir tarifin beş tonu.

  ── TASARIMIN KENDİ KURALI: KUTUYU AİLESİNE BAĞLAYAN ŞEY KENARIDIR ──────────
  Token künyesinde ölçülmüş (`operations-app.ts` §4): dört zeminin üçü `panel`e kanal başına ≤4
  uzaklıkta, yani ekranda ayırt edilemez. Kutuyu "hata", "olumlu" ya da "nötr" yapan şey ZEMİNİ
  değil ÇERÇEVESİ ve metnidir. Bu yüzden tonlar zemin adıyla değil ROLLE anılıyor.

  ── BEŞ TON ─────────────────────────────────────────────────────────────────
  · `panel`  (varsayılan) — sayfanın taşıyıcı kutusu: panel zemin + `sand-300` + kart yarıçapı.
               Tasarımda 30'dan fazla: hub kutucukları, liste satırları, künye kartları.
  · `quiet`  — GÜNLÜK İŞ OLMAYAN satır: krem zemin + `neutral-bg` kenar. Tasarımın ikinci en
               kalabalık yüzeyi (krem zemin 37, sessiz kenarla 21): yazıcı kurulumu, künye
               şeridi, ikincil bilgi. `panel`den ayrı durması gerekiyor çünkü ikisi farklı şey
               söylüyor — `panel` "buraya bak, bu bugünün işi", `quiet` "burada bir ayar var".
  · `card`   — kutunun İÇİNDEKİ satır: beyaz zemin + `sand-300` + kontrol yarıçapı. Daha küçük
               yarıçap kademesi hiyerarşiyi taşır — iç öğe dışını tekrarlamaz.
  · `ink`    — koyu blok ("BUGÜN DEPODA" künyesi). Çerçevesi yok; koyu yüzey kendi kenarıdır.
  · `invite` — KESİKLİ zeytin: "+ Siparişsiz mal geldi", "+ Başka koli boyu". Kesik çizgi
               "burada bir şey YOK ama olabilir" der; düz çerçeve "burada bir şey var" derdi.
  · `blank`  — KESİKLİ kum: henüz yapılmamış iş ("say →", imza alanı). `invite`ten ayrı durur
               çünkü ikisi farklı şey söylüyor: biri DAVET, öteki EKSİK.

  ── NİÇİN OPERASYON KLASÖRÜNDE ──────────────────────────────────────────────
  `panel` yalnız operasyon temasında var; paylaşılan kit Unistyles'ın tema birleşiminden onu
  okuyamaz (gerekçe `theme/unistyles.ts` künyesinde).
*/

type SurfaceTone = 'panel' | 'quiet' | 'card' | 'ink' | 'invite' | 'blank';

/**
 * Kesikli çizilen tonların kenar rengi. Ayrı bir tablo, çünkü çerçeveyi stil sayfası değil SVG
 * çiziyor ve SVG rengi PROP'tan alıyor; öteki tonlar burada YOK ve olmamalı — tablodaki varlık
 * "bu ton kesiklidir" demenin kendisi.
 */
const DASHED_TONES: Partial<Record<SurfaceTone, string>> = {
  invite: operationsTheme.colors['olive-line'],
  blank: operationsTheme.colors['sand-500'],
};

interface SurfaceBaseProps {
  children: ReactNode;
  tone?: SurfaceTone;
  /** İç dolgu: `md` 12/14 (tasarım 13/14) · `lg` 14/16 (tasarım 15/16) · `none` çağıran çözer. */
  padding?: 'md' | 'lg' | 'none';
  /** Sağ kenardaki yön oku — tasarımda tıklanır satırların çoğunda var, statiklerde hiç yok. */
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/*
  DOKUNULABİLİRLİK VE AD BİRLİKTE GELİR (ayrık birleşim): `onPress` veren çağıran
  `accessibilityLabel` de vermek ZORUNDA. İkisi ayrı isteğe bağlı prop olsaydı adsız bir tıklanır
  satır yazmak mümkün olurdu — ekran okuyucuda o satır "düğme" diye okunur ve NE OLDUĞU söylenmez.
*/
type OperationsSurfaceProps = SurfaceBaseProps &
  (
    | { onPress: () => void; accessibilityLabel: string; accessibilityHint?: string; disabled?: boolean }
    | { onPress?: undefined; accessibilityLabel?: undefined; accessibilityHint?: undefined; disabled?: undefined }
  );

export function OperationsSurface({
  children,
  tone = 'panel',
  padding = 'lg',
  chevron = false,
  style,
  testID,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: OperationsSurfaceProps) {
  const box = [styles.base, styles[tone], padding === 'none' ? null : styles[padding], style];
  /* KESİKLİ TONLARIN ÇERÇEVESİ SVG'DEN ÇİZİLİR (ölçüldü 30.08 — künyesi `dashed-frame.tsx`):
     RN'in `borderStyle: 'dashed'`i cihazda ~1:10 bir desen çiziyor (tasarım ~1:1) ve çerçeve
     kesikli değil noktalı görünüyor. Kabın kenarlığı saydam olarak DURUYOR: yerleşim kaymasın. */
  const dashed = DASHED_TONES[tone];
  const body = (
    <>
      {dashed === undefined ? null : (
        <OperationsDashedFrame
          color={dashed}
          radius={tone === 'invite' ? operationsTheme.radius.card : operationsTheme.radius.control}
          testID={testID === undefined ? undefined : `${testID}-frame`}
        />
      )}
      {chevron ? (
        <View style={styles.row}>
          <View style={styles.grow}>{children}</View>
          <Text style={styles.chevron}>›</Text>
        </View>
      ) : (
        children
      )}
    </>
  );

  if (onPress === undefined) {
    return (
      <View style={box} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      /* v3'te yüzeylerin gölgesi YOK (ölçüldü: v2'de 3 sert gölge, v3'te sıfır), o yüzden basılı
         geri bildirim kayma değil KÜÇÜLMEDİR — tasarımın kendi `style-active`i de öyle diyor. */
      feedback="scale"
      style={box}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {body}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: operationsTheme.radius.card,
  },
  md: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  lg: {
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
  },
  panel: {
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
  },
  /* SESSİZ satır: zemin bir kademe daha sıcak (krem), kenar `sand-300` yerine `neutral-bg` —
     yani kenarlık zeminden neredeyse ayrışmıyor. Kutu görünür ama çağırmaz; tasarımın "bu bir
     ayar, bugünün işi değil" demesinin yolu budur. */
  quiet: {
    backgroundColor: operationsTheme.colors.cream,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  // İÇ satır: beyaz zemin + BİR KADEME KÜÇÜK yarıçap. Aynı yarıçapta olsaydı iç kutu dış kutunun
  // kopyası gibi durur ve hangisinin hangisini taşıdığı okunamazdı.
  card: {
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
  },
  ink: {
    backgroundColor: operationsTheme.colors.ink,
  },
  /* İki kesikli ton: kenarlık DURUYOR ama SAYDAM — kutunun ölçüsünü o veriyor, kesikleri
     `OperationsDashedFrame` çiziyor (yukarıdaki künye). Renkleri `DASHED_TONES`ta, çünkü SVG
     stil sayfasından değil prop'tan renk alıyor. */
  invite: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderWidth: operationsTheme.border.base,
    borderColor: 'transparent',
  },
  blank: {
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: 'transparent',
    borderRadius: operationsTheme.radius.control,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  grow: { flex: 1, minWidth: 0 },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors['sand-600'],
    lineHeight: operationsTheme.text['screen-title'],
  },
});
