import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

/*
  MÜŞTERİ EKRANLARININ İKON TAMAMLAYICISI — v3'ün müşteri ekranlarında geçen ama paylaşılan kitin
  sözlüğünde (`components/ui/icon-paths.ts`) HENÜZ OLMAYAN geometriler.

  NEDEN BURADA, KİTTE DEĞİL (21.14'ün açık kısıtı): bu etapta `components/ui` YAZIYA KAPALI —
  operasyon ekranları aynı dosyalarda paralel çalışıyor. İhtiyaç yöneticiye raporlandı; sözlük
  kite terfi ettiği gün bu dosya SİLİNİR ve çağıranlar `Icon`a döner (ad kümeleri bilerek
  çakışmıyor: burada yalnız kitte OLMAYAN adlar var, yani terfi bir yeniden adlandırma istemez).

  ÇİZİM DAVRANIŞI kitin `Icon`u ile AYNI kuralları izler (renk çağırandan, çizgi kalınlığı boya
  bağlı, ikon varsayılan olarak sessiz) — o kuralların ikinci bir yorumu YAZILMADI, aynen
  uygulandı. Ham renk yok: varsayılan mürekkep temadan gelir.

  DİKDÖRTGEN AYRI ALAN: şablon zarf/kilit/kart ikonlarının gövdesini `<rect rx>` ile çiziyor.
  Elle bir `d` yoluna çevirmek geometriyi YENİDEN YAZMAK olurdu — köşe yayları bizim
  türetmemiz olur, tasarımın söylediği şey olmazdı (kitteki `circles` alanının gerekçesiyle aynı).
*/

interface CustomerIconGeometry {
  /** `<path d="…">` dizeleri — şablondan birebir. */
  paths?: readonly string[];
  /** `<circle cx cy r>` üçlüleri. */
  circles?: readonly (readonly [cx: number, cy: number, r: number])[];
  /** `<rect x y width height rx>` beşlileri. */
  rects?: readonly (readonly [x: number, y: number, width: number, height: number, rx: number])[];
  /** Şablonun kendi çizim kutusu; kare değilse genişlik bundan türer. */
  viewBox?: string;
  /** 34 dp ve üstünde çizilen ikon — çizgisi incelir (kitin `large` bayrağıyla aynı kural). */
  large?: true;
}

/** Ad → geometri. Adlar İngilizce (CLAUDE §2); hepsi v3 müşteri ekranlarından birebir alındı. */
export const CUSTOMER_ICON_PATHS = {
  /** Sepet — alt sekme yanındaki yüzen düğme, boş sepet bloğu (v3:1304, 402). */
  cart: { paths: ['M4 9h16l-1.5 11h-13zM8 9c0-4.5 8-4.5 8 0'] },
  /** Kupon etiketi — sepet kupon satırı, hesap kupon listesi (v3:453, 459, 835). */
  coupon: { paths: ['M3 9V6h18v3a2 2 0 0 0 0 6v3H3v-3a2 2 0 0 0 0-6z'] },
  /** Zarf — "E-posta ile devam et", "Bize yazın" (v3:770, 853). */
  mail: { paths: ['m4 7.5 8 6 8-6'], rects: [[3, 5.5, 18, 13, 2]] },
  /** Kamyon — canlı sipariş bandı, teslimat satırı, zaman çizgisi (v3:63, 854). */
  truck: {
    paths: ['M1 1h13v12H1zM14 5h5l4 4v4h-9'],
    circles: [
      [6, 16, 2.2],
      [18, 16, 2.2],
    ],
    viewBox: '0 0 24 19',
  },
  /** Kilit — ödeme ekranının "GÜVENLİ" künyesi (v3:569, 592). */
  lock: { paths: ['M8 10V7a4 4 0 0 1 8 0v3'], rects: [[4, 10, 16, 10, 2]] },
  /** Banka kartı — "Kartla öde" (v3:587). */
  card: { paths: ['M2 10h20'], rects: [[2, 5, 20, 14, 2.5]] },
  /** Onay — sipariş zaman çizgisinin ilk durağı (v3:1971 `TICONS[0]`). */
  check: { paths: ['M20 6 9 17l-5-5'] },
  /** Koli — zaman çizgisinin "Hazırlanıyor" durağı (v3:1971 `TICONS[1]`). */
  box: { paths: ['M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8'] },
  /** Yıldız — bildirim listesi ve "Ürünleri değerlendir" (v3:1789 `NIC.star`). */
  star: { paths: ['M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7z'] },
} as const satisfies Record<string, CustomerIconGeometry>;

// Dışarıya İHRAÇ EDİLMEZ (knip): bugün tek tüketen bu dosyanın props'u; ilk dış çağıran çıkınca açılır.
type CustomerIconName = keyof typeof CUSTOMER_ICON_PATHS;

/** Kitin varsayılan çizim kutusuyla aynı. */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/** `"0 0 24 19"` → `24/19`. Kare olmayan kutuda genişliği yükseklikten türetir. */
function viewBoxRatio(viewBox: string): number {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return width === undefined || height === undefined || height === 0 ? 1 : width / height;
}

interface CustomerIconProps {
  name: CustomerIconName;
  /** Kenar uzunluğu (dp) — kare olmayan ikonda YÜKSEKLİK. */
  size: number;
  /** Tema renk token'ının değeri; verilmezse mürekkep. */
  color?: string;
  testID?: string;
}

export function CustomerIcon({ name, size, color, testID }: CustomerIconProps) {
  const { theme } = useUnistyles();
  const geometry: (typeof CUSTOMER_ICON_PATHS)[CustomerIconName] = CUSTOMER_ICON_PATHS[name];
  const viewBox = 'viewBox' in geometry && geometry.viewBox !== undefined ? geometry.viewBox : DEFAULT_VIEW_BOX;

  return (
    <Svg
      width={size * viewBoxRatio(viewBox)}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color ?? theme.colors.ink}
      strokeWidth={'large' in geometry ? theme.border.iconStrokeLarge : theme.border.iconStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID}
      // İkon SESSİZDİR: yanındaki metin ya da düğmenin kendi etiketi konuşur (kitin kuralı).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Daralma `in` ile: sözlük SABİT olduğu için her ad kendi alanlarını taşır ve isteğe bağlı
          alanlar birleşimin yalnız bazı üyelerinde vardır (kitteki `Icon`un `large` kalıbı). */}
      {'paths' in geometry
        ? geometry.paths.map((d) => <Path key={d} d={d} />)
        : null}
      {'circles' in geometry
        ? geometry.circles.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)
        : null}
      {'rects' in geometry
        ? geometry.rects.map(([x, y, width, height, rx]) => (
            <Rect key={`${x}-${y}-${width}-${height}`} x={x} y={y} width={width} height={height} rx={rx} />
          ))
        : null}
    </Svg>
  );
}
