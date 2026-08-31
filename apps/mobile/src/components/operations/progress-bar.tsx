import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  İLERLEME ÇUBUĞU — operasyonun "ne kadarı bitti" çizgisi (30.08).

  NEDEN PAYLAŞILAN: aynı çubuk kuryenin gün başlığında (`courier-day-screen`, 21.10) ve depo
  toplama kuyruğunun her satırında (v3:263) duruyor. İkisi de aynı geometriyi ve aynı iki rengi
  kullanıyordu; iki kopya, birinin bir gün ötekinden ayrılması demekti (CLAUDE §1 — hiçbir türde
  duplication yok).

  RENK ÇAĞIRANDAN: kuryede çubuk hep zeytindir (tek bir gün ilerler), depoda satırın DURUMUNU
  taşır — yarım kalan iş terracotta, tamamlanan zeytin, başlanmamış gri. Rengi komponente gömmek,
  depo satırının durumunu anlatmasını engellerdi. Varsayılan zeytin: renk vermeyen çağıran da
  paletin içinde kalır.

  ORAN 0–1 ARASINA KIRPILIR: `pickedLineCount > lineCount` gibi bir veri tutarsızlığı çubuğu
  kutusunun dışına taşırmasın. Kırpma SESSİZDİR ve olması gereken de budur — ekran veriyi
  düzeltmez, yalnız çizemeyeceği bir şeyi çizmeye kalkışmaz.
*/

interface OperationsProgressBarProps {
  /** Tamamlanan oran, 0–1. Aralık dışı değerler kırpılır. */
  value: number;
  /** Dolgunun rengi — tema token'ı; verilmezse zeytin. */
  tone?: string;
  /**
   * Çubuğun KOYU bir kartın içinde olup olmadığı (30.08).
   *
   * İz açık zemin için seçilmişti (`neutral-bg`) ve koyu kartın üstünde o iz zeminden AÇIK kalıyor
   * — çubuk "dolu" görünüyordu, oysa boştu. Tasarım koyu kartlarda izi `#464e55` çiziyor
   * (`on-ink-line`, Δ4/3/2). İki koyu çağıran var ve ikisi de kuryede: günün özet kartı (v3:14)
   * ve araca yüklemenin sayaç kartı (v3:1412).
   *
   * PROP, ayrı bir komponent değil: değişen tek şey izin rengi — geometri, kırpma ve dolgu aynı.
   */
  onInk?: boolean;
  /**
   * **İKİNCİ PAY** — birincinin hemen ardına çizilen, ayrı renkli dilim (30.08).
   *
   * Kuryenin gün çubuğu tasarımda İKİ paylıdır (v3:14): zeytin teslim edilenler, kırmızı takılı
   * duraklar. Tek paylı çubuk o günü olduğundan iyi gösteriyordu — ulaşılamayan durak çubukta hiç
   * görünmüyor, kalan boşluğun içinde "henüz sırası gelmemiş" gibi duruyordu.
   *
   * Toplamla birlikte 1'i aşarsa kırpılır: iki payın toplamı çubuğun boyunu geçemez.
   * Verilmezse çubuk tek paylı kalır — depo toplama kuyruğunun çağrısı değişmedi.
   */
  secondary?: { value: number; tone: string };
  testID?: string;
}

export function OperationsProgressBar({ value, tone, onInk = false, secondary, testID }: OperationsProgressBarProps) {
  const ratio = clampRatio(value);
  /* İkinci pay birincinin ARDINA yerleşir, yani kalan yerden fazlasını alamaz — ikisi toplamda
     çubuğu taşırsaydı hangisinin doğru olduğu belirsiz kalırdı. */
  const secondRatio = secondary === undefined ? 0 : Math.min(clampRatio(secondary.value), 1 - ratio);

  return (
    <View style={[styles.track, onInk ? styles.trackOnInk : null]} testID={testID}>
      <View
        style={[
          styles.fill,
          { width: `${Math.round(ratio * 100)}%`, backgroundColor: tone ?? operationsTheme.colors.olive },
        ]}
      />
      {secondary === undefined || secondRatio <= 0 ? null : (
        <View style={[styles.fill, { width: `${Math.round(secondRatio * 100)}%`, backgroundColor: secondary.tone }]} />
      )}
    </View>
  );
}

/** Oranı 0–1'e kırpar; `NaN`/`Infinity` sıfır sayılır (bozuk veri çubuğu taşırmaz). */
function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    flexDirection: 'row',
    height: operationsTheme.space.sm,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    overflow: 'hidden',
  },
  /** Koyu kartın izi — açık iz koyu zeminde çubuğu dolu gösteriyordu. */
  trackOnInk: {
    backgroundColor: operationsTheme.colors['on-ink-line'],
  },
  /* Dolgunun KENDİ yarıçapı YOK — uçları kabın `overflow:hidden`ı yuvarlıyor. İki pay yan yana
     çizildiğinde kendi yarıçapları aralarında bir çentik bırakırdı (tasarımda da dolgular düz,
     yarıçap kapta). */
  fill: {
    height: '100%',
  },
});
