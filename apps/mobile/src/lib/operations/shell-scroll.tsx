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

  ── TASARIMIN KİLİDİ RN'DE DE GEREKLİ (yanlış teori, ölçümle çürütüldü 30.08) ──
  İlk turda şöyle yazmıştım: *"betikteki 380 ms'lik kilit web'in `scrollTop` kırpma sorunu içindir;
  RN'de çubuk `translateY` ile gider, kap yüksekliği değişmez, kilit taşınmazsa olmayan bir sorunun
  makinesi kurulmuş olur."* İki yarısı da yanlış çıktı:

  · Çubuk gizlenince kap yüksekliği **değişmek ZORUNDA** — değişmezse kazanılan alan boş krem bir
    şerit olarak kalıyor (kullanıcı bulgusu, iki cihazda ölçüldü). Tasarımın kendi betiği de
    `max-height`i daraltıyor (`v3.dc.html:3107`); "yüksekliğe dokunma" notu betikle çelişiyordu.
  · Yükseklik değişince sistem kaydırma konumunu **RN'de de kırpıyor** ve kırpma ters yönlü sahte
    bir fark üretiyor: kullanıcı dibe yaslandığında çubuk çıkıp yeniden gizleniyordu — tasarımın
    künyesinde adı konmuş olan aç-kapa döngüsünün ta kendisi.

  Kilit bu yüzden artık burada, tasarımdaki süresiyle (380 ms) ve aynı yerde: mikro başlık
  kararından SONRA, çubuk kararından ÖNCE.
*/

/** Mikro başlığın indiği eşik (px) — tasarım: `if (top <= 44)`. */
const MICRO_THRESHOLD = 44;
/** Yön birikimi bu kadarı geçmeden çubuk kararı değişmez — yavaş kaydırmada titremeyi keser. */
const DIRECTION_MIN = 10;
/** Sekme çubuğunun yüksekliği (M1c: "86px") — kazanılan alan hesabına girer. */
const TAB_BAR_HEIGHT = 86;
/** Kaydırma payı bundan kısaysa gizleme hiç yapılmaz (tasarım: `pay >= 120`). */
const MIN_SCROLLABLE = 120;
/** Karar değiştikten sonra yeni karar alınmayan pencere (tasarım: `Date.now() + 380`). */
const LOCK_MS = 380;
/** Tavana bu kadar yaklaşmış konum "dipte" sayılır — ölçüm ondalıklı gelir, tam eşitlik tutmaz. */
const OVERSCROLL_EPSILON = 1;

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
  /** Çubuk kararının ref kopyası — kilit ve pay hesabı `setState` dışında yapılıyor. */
  const hidden = useRef(false);
  /** Kilidin bittiği an (ms); 0 = kilit yok. */
  const lockUntil = useRef(0);

  const reset = useCallback(() => {
    lastOffset.current = 0;
    drift.current = 0;
    hidden.current = false;
    lockUntil.current = 0;
    setState((prev) => (prev.microVisible || prev.tabBarHidden ? { microVisible: false, tabBarHidden: false } : prev));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const top = contentOffset.y;
    const delta = top - lastOffset.current;
    lastOffset.current = top;

    /* TEPEYE DÖNÜŞ HER KOŞULDA SIFIRLAR — eşik de birikim de KİLİT de burada geçersiz (tasarım
       kuralı). Aşırı kaydırmada (bounce) `top` negatife düşer; `<=` onu da kapsar. */
    if (top <= MICRO_THRESHOLD) {
      drift.current = 0;
      lockUntil.current = 0;
      setState((prev) => (prev.microVisible || prev.tabBarHidden ? { microVisible: false, tabBarHidden: false } : prev));
      return;
    }

    // Eşik geçildiği ANDA açılır — birikim de kilit de beklemez (tasarımda da kilitten önce).
    setState((prev) => (prev.microVisible ? prev : { ...prev, microVisible: true }));

    /* GEÇİŞ KİLİDİ (tasarımın `_kilit`i, birebir) — çubuk kararı değiştiği anda kap yüksekliği
       değişir, sistem kaydırma konumunu kırpar ve kırpma SAHTE bir ters yön farkı üretir: çubuk
       geri gelir, kap küçülür, fark yine döner ve ortaya aç-kapa döngüsü çıkar. Kilit penceresinde
       gelen olaylar yalnız referansı tazeler, karar vermez. */
    if (Date.now() < lockUntil.current) {
      drift.current = 0;
      return;
    }

    /* DİP YAYLANMASI KARAR VERMEZ (kullanıcı bulgusu 30.08, iki ekranda ölçüldü).
       Native kaydırıcı dipte tavanı AŞAR: parmak sayfayı yukarı çeker, bırakınca geri iner. O geri
       inişte `delta` negatiftir ve ham hâliyle "yukarı kaydırılıyor" diye okunur — çubuk kullanıcı
       hiçbir şey yapmadan geri gelirdi. Tasarımda bu hâl YOK: tarayıcıda `scrollTop` tavanı hiç
       aşmaz, dolayısıyla betiğinde de bir karşılığı yok. Tavanın üstündeki bölge yalnız referansı
       tazeler; karar, kullanıcı gerçekten yukarı kaydırıp tavanın ALTINA indiğinde alınır. */
    const maxOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
    if (top >= maxOffset - OVERSCROLL_EPSILON) {
      drift.current = 0;
      return;
    }

    if (delta === 0) return;
    // Yön değiştiyse birikim sıfırlanır: "aşağı 40, sonra yukarı 12" kararı hemen çevirmemeli.
    if (drift.current * delta < 0) drift.current = 0;
    drift.current += delta;
    if (Math.abs(drift.current) < DIRECTION_MIN) return;

    /* Çubuk gizliyken kap 86px daha uzunmuş gibi ölçülür: kazanılacak alan yoksa gizleme
       kapalı kalır, yoksa kısa ekranlarda (Para, Karar kutusu) aç-kapa titremesi olur. */
    const scrollable = maxOffset + (hidden.current ? TAB_BAR_HEIGHT : 0);
    const tabBarHidden = scrollable >= MIN_SCROLLABLE ? drift.current > 0 : false;
    if (tabBarHidden === hidden.current) return;

    /* Karar REF'te de tutuluyor: kilidi ve payı `setState` güncelleyicisinin DIŞINDA hesaplamak
       gerekiyor — güncelleyici saf olmalı, kilit yazmak orada bir yan etkidir ve React onu iki
       kez çağırdığında pencere iki kez kurulurdu. */
    hidden.current = tabBarHidden;
    lockUntil.current = Date.now() + LOCK_MS;
    drift.current = 0;
    setState((prev) => ({ ...prev, tabBarHidden }));
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
