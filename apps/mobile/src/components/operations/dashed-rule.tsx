import Svg, { Line } from 'react-native-svg';

import { operationsTheme } from '@/theme/unistyles';

/*
  KESİKLİ AYRAÇ — kartın İÇİNDEKİ satırları ayıran hat (hesap bakiyeleri, gün sonu dökümü, sefer
  kapanışının kasa satırları). Tasarımda `border-bottom:1.5px dashed`.

  ── NİÇİN `borderStyle: 'dashed'` DEĞİL (ölçüldü 30.08, kullanıcı bulgusu) ───
  RN'in `dashed`i tasarımın `dashed`iyle AYNI deseni çizmiyor. İki görüntü de 1080 px genişlikte
  alınıp piksel piksel tarandı (tasarım: `.design-shots/operasyon-mobil-v3/23-…png` · cihaz:
  OPPO CPH1907, Android):

      tasarım (Chrome)     kesik 9,0 px · boşluk 5,9 px · tekrar 14,9 px · doluluk %60
      cihaz  (RN Android)  kesik 11,9   · boşluk 12,0   · tekrar 23,9   · doluluk %51

  Yani aynı bildirim Android'de **%60 daha seyrek** bir desene dönüşüyor: tasarımda sık ve
  neredeyse sürekli okunan hat, cihazda ayrı ayrı noktalara ayrılıyor. Kullanıcı cihazda tam
  bunu gördü ("kesikli noktalar falan var, tasarım bariz farklı").

  `borderStyle: 'dashed'` desen parametresi ALMIYOR — RN'de dash uzunluğunu ayarlayan bir API yok.
  Bir ara çözüm olarak ayraç düz çizgiye çevrildi (görsel ağırlık eşitti: 1,5 px × %60 ≈ 0,9 px
  mürekkep) ama o da tasarımın kesikli hattını siliyordu; kullanıcı kararı desenin KENDİSİNİ
  istedi.

  ── DEĞERLER ÖLÇÜMDEN TÜRÜYOR, TAHMİNDEN DEĞİL ──────────────────────────────
  Tasarım tuvali 390 CSS px genişliğinde ve görüntüsü 1080 px, yani ölçek 2,769:
      kesik   9,0 / 2,769 = 3,25 dp
      boşluk  5,9 / 2,769 = 2,13 dp
  `react-native-svg` zaten kurulu ve kitin çizim kapısı (`ui/icon.tsx` onunla çiziyor); ikinci bir
  bağımlılık gelmiyor.

  ── NİÇİN KOMPONENT ─────────────────────────────────────────────────────────
  Aynı ayraç operasyon yüzeyinde 20'den çok ekranda geçiyor. Deseni her ekranın kendi SVG'siyle
  yazması, bir gün birinin 3,25 yerine 3 yazması ve iki kartın sessizce ayrışması demekti — görsel
  ayrışma teste düşmez, yalnız gözle görülür (CLAUDE §1).
*/

/**
 * Ölçülen desen (dp): kesik · boşluk. Tasarımın kendi hattı — yuvarlanmadı.
 *
 * DIŞA AÇIK çünkü kesikli ÇERÇEVE de (`dashed-frame.tsx`) aynı deseni çiziyor: ayraç ile çerçeve
 * aynı tasarım dilinin iki kullanımı ve iki sabit bir gün ayrışırdı (CLAUDE §1).
 */
export const DASH_PATTERN = '3.25 2.13';

interface OperationsDashedRuleProps {
  /**
   * Hattın rengi. Varsayılan `neutral-bg` — tasarımın kart içi ayracı (#e2ddcc buraya bağlı,
   * token künyesi §"yeni durak eşiği"). Koyu yüzeyde çağıran kendi tonunu verir.
   */
  color?: string;
  testID?: string;
}

export function OperationsDashedRule({
  color = operationsTheme.colors['neutral-bg'],
  testID,
}: OperationsDashedRuleProps) {
  const width = operationsTheme.border.base;
  return (
    /* Yükseklik çizgi kalınlığı kadar: SVG kutusu satır aralığına fazladan boşluk EKLEMEZ; dikey
       nefes ayracın değil, satırların dolgusunun işi. `y` kutunun ortası, yoksa 1,5 dp'lik hat
       kutunun üst kenarında kırpılır. */
    <Svg height={width} width="100%" testID={testID}>
      <Line
        x1="0"
        y1={width / 2}
        x2="100%"
        y2={width / 2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={DASH_PATTERN}
        testID={testID === undefined ? undefined : `${testID}-line`}
      />
    </Svg>
  );
}
