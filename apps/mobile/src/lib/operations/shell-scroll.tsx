import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/*
  KABUĞUN KAYDIRMA DURUMU — yapışkan mikro başlık ve sekme çubuğu gizlemesi tek yerden.

  ── TASARIMIN KURALI (Komponent Envanteri M1b · M1c, 30.08) ─────────────────
  · M1b: *"44px eşiği geçilince iner (translateY + opacity .22s), tepeye dönüşte kalkar."*
  · M1c: *"Aşağı kaydırmada gizlenir, yukarıda döner; kaydırma payı 120px'ten kısaysa gizleme
    kapalıdır."*
  · Kabuk künyesi: *"Tek kaydırıcı vardır; yapışkan başlık, aşağı-çek yenileme ve çubuk gizleme
    hepsi ona bağlıdır, EKRAN BAŞINA TEKRAR YAZILMAZ."*

  Eşikler ve birikim kuralı tasarımın kendi betiğinden birebir alındı (`Operasyon Mobil
  v3.dc.html:3344-3385`), uydurulmadı.

  ── NİÇİN BAĞLAM, NİÇİN KAP DEĞİL ──────────────────────────────────────────
  Tasarımın mimarisinde kaydırıcı KABUKTA tek tanedir; bizde 18 operasyon ekranının her biri
  kendi `ScrollView`/`FlatList`ini kuruyor (ölçüldü 30.08). Kaydırıcıyı kabuğa taşımak 25 ekranı
  birden yeniden yazmak demekti; üstelik `FlatList` kullanan ekranlar bir `ScrollView` kabına
  sarılamaz — sanallaştırma ölür.

  Bunun yerine DURUM yukarı taşındı: ekran yalnız `onScroll` bağlar (tek satır), kararı bağlam
  verir, tüketen iki komponent (mikro başlık · sekme çubuğu) bağlamdan okur. Kural yine tek
  yerde — tasarımın istediği buydu; kaydırıcının kendisinin nerede durduğu ikincil.

  ── NEDEN `Animated.Value` DEĞİL, İKİ BOOLEAN ──────────────────────────────
  Sürekli bir değer (scrollY) taşımak burada işe yaramaz: tasarımın kararı EŞİKLİ ve HİSTEREZLİ
  (birikim < 10 yok sayılır, yön değişince sıfırlanır). Yani ham konumdan değil, biriken YÖNDEN
  hesaplanıyor. Bağlam iki boolean taşır; animasyonu tüketen komponent kendi `Animated`ıyla
  yapar ve `useNativeDriver` ile sürücüye iner — bağlamda `Animated.Value` paylaşsaydık her
  kaydırma karesi React ağacını yeniden çizerdi.

  ── TASARIMIN İKİ WEB DÜZELTMESİ RN'DE GEREKSİZ ────────────────────────────
  Betikte 380 ms'lik bir kilit ve `scrollTop` kırpma düzeltmesi var; gerekçesi künyesinde yazılı:
  *"çubuk kapandığında kap 86px büyür, tarayıcı scrollTop'u kırpar."* RN'de çubuk kaydırıcının
  DIŞINDA ve `translateY` ile gider — kap yüksekliği hiç değişmez, dolayısıyla kırpma da yoktur.
  Envanterin RN notu bunu ayrıca şart koşuyor: *"çubuk gizlemede kap yüksekliğini değiştirme;
  yalnız translateY + contentInset."* Kilit bu yüzden taşınmadı; taşınsaydı olmayan bir sorunun
  makinesi olurdu (CLAUDE §0).
*/

/** Mikro başlığın indiği eşik (px) — tasarım: `if (top <= 44)`. */
const MICRO_THRESHOLD = 44;
/** Yön birikimi bu kadarı geçmeden çubuk kararı değişmez — yavaş kaydırmada titremeyi keser. */
const DIRECTION_MIN = 10;
/** Sekme çubuğunun yüksekliği (M1c: "86px") — kazanılan alan hesabına girer. */
const TAB_BAR_HEIGHT = 86;
/** Kaydırma payı bundan kısaysa gizleme hiç yapılmaz (tasarım: `pay >= 120`). */
const MIN_SCROLLABLE = 120;

interface ShellScrollState {
  /** Mikro başlık inik mi (eşik geçildi). */
  microVisible: boolean;
  /** Sekme çubuğu gizli mi (aşağı kaydırılıyor ve pay yetiyor). */
  tabBarHidden: boolean;
}

interface ShellScrollValue extends ShellScrollState {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Ekran değişiminde sıfırlanır (M1d ile aynı kural: "ekran değişiminde sıfırlanır"). */
  reset: () => void;
}

const ShellScrollContext = createContext<ShellScrollValue | null>(null);

export function OperationsShellScrollProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<ShellScrollState>({ microVisible: false, tabBarHidden: false });
  /* Kaydırma başına değişen ama ÇİZİMİ etkilemeyen değerler ref'te: her karede setState çağırmak
     listeyi 60 kez yeniden çizerdi. */
  const lastOffset = useRef(0);
  const drift = useRef(0);

  const reset = useCallback(() => {
    lastOffset.current = 0;
    drift.current = 0;
    setState((prev) => (prev.microVisible || prev.tabBarHidden ? { microVisible: false, tabBarHidden: false } : prev));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const top = contentOffset.y;
    const delta = top - lastOffset.current;
    lastOffset.current = top;

    /* TEPEYE DÖNÜŞ HER KOŞULDA SIFIRLAR — eşik de birikim de burada geçersiz (tasarım kuralı).
       Aşırı kaydırmada (bounce) `top` negatife düşer; `<=` onu da kapsar. */
    if (top <= MICRO_THRESHOLD) {
      drift.current = 0;
      setState((prev) => (prev.microVisible || prev.tabBarHidden ? { microVisible: false, tabBarHidden: false } : prev));
      return;
    }

    if (delta === 0) return;
    // Yön değiştiyse birikim sıfırlanır: "aşağı 40, sonra yukarı 12" kararı hemen çevirmemeli.
    if (drift.current * delta < 0) drift.current = 0;
    drift.current += delta;

    setState((prev) => {
      // Eşik geçildiği ANDA açılır — birikim beklemez (tasarım: mikro başlık ayrı kuralda).
      const microVisible = true;
      if (Math.abs(drift.current) < DIRECTION_MIN) {
        return prev.microVisible === microVisible ? prev : { ...prev, microVisible };
      }
      /* Çubuk gizliyken kap 86px daha uzunmuş gibi ölçülür: kazanılacak alan yoksa gizleme
         kapalı kalır, yoksa kısa ekranlarda (Para, Karar kutusu) aç-kapa titremesi olur. */
      const scrollable = contentSize.height - layoutMeasurement.height + (prev.tabBarHidden ? TAB_BAR_HEIGHT : 0);
      const tabBarHidden = scrollable >= MIN_SCROLLABLE ? drift.current > 0 : false;
      if (prev.microVisible === microVisible && prev.tabBarHidden === tabBarHidden) return prev;
      return { microVisible, tabBarHidden };
    });
  }, []);

  const value = useMemo<ShellScrollValue>(() => ({ ...state, onScroll, reset }), [state, onScroll, reset]);

  return <ShellScrollContext.Provider value={value}>{children}</ShellScrollContext.Provider>;
}

/**
 * Kabuğun kaydırma durumu. Sağlayıcı yoksa NÖTR değer döner — komponent kabuk dışında da
 * (testte, müşteri yüzeyinde) çizilebilsin diye: yapışkan davranış sessizce kapalı kalır,
 * hiçbir şey patlamaz.
 */
export function useOperationsShellScroll(): ShellScrollValue {
  return useContext(ShellScrollContext) ?? FALLBACK;
}

const FALLBACK: ShellScrollValue = {
  microVisible: false,
  tabBarHidden: false,
  onScroll: () => undefined,
  reset: () => undefined,
};
