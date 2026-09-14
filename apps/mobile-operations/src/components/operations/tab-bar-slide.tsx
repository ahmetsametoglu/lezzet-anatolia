import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';

import { useOperationsShellScroll } from '@/lib/operations/shell-scroll';

/*
  SEKME ÇUBUĞUNUN KAYMASI (Komponent Envanteri M1c) — *"Aşağı kaydırmada gizlenir, yukarıda döner;
  kaydırma payı 120px'ten kısaysa gizleme kapalıdır."*

  Kararın kendisi burada DEĞİL: eşik, yön birikimi ve 120px payı `lib/operations/shell-scroll`ta,
  yani mikro başlıkla aynı yerde. Bu dosya yalnız kararı harekete çeviriyor — ikisi ayrı yerde
  hesaplansaydı çubuk ve başlık farklı anlarda tepki verir, kullanıcı da bunu "takılma" diye
  görürdü.

  ── ENVANTERİN BİÇİMİ VE ONDAN SAPMA (ölçümle, 30.08) ──────────────────────
  Envanter şunu diyordu: *"Çubuk gizlemede KAP YÜKSEKLİĞİNİ DEĞİŞTİRME: yalnız translateY +
  contentInset."* Cümlenin ilk yarısı web'in derdinden geliyor — kap büyüyünce tarayıcı
  `scrollTop`u kırpıyor ve aç-kapa titremesi doğuyor. **İkinci yarısı (`contentInset`) ilk turda
  hiç yapılmadı** ve ortaya kullanıcının bulduğu arıza çıktı: çubuk kayıyor, yeri boş kalıyor.

  RN'de `contentInset`in karşılığı burada `marginBottom`tur — çubuk kaydırıcının İÇİNDE değil
  KARDEŞİ, dolayısıyla kazanılacak alan kaydırıcıya değil layout'a bırakılır. Kırpma sorunu
  RN'de yok (kaydırma konumu içerik uzarken korunur), yani sakınılan şeyin bedeli de yok.

  Yükseklik ÖLÇÜLEREK alınıyor (`onLayout`), sabit yazılmıyor: çubuğun boyu cihazın alt güvenli
  alanına göre değişiyor ve 86px'lik tasarım değeri jestli telefonlarda eksik kalırdı — çubuk
  tam gizlenmez, bir şerit ekranda asılı kalırdı.
*/

export function OperationsTabBarSlide({ children }: { children: ReactNode }) {
  const { tabBarHidden } = useOperationsShellScroll();
  /** Çubuğun eski yerinden yenisine kayması — yalnız ÇİZİM, yerel sürücüde. */
  const offset = useRef(new Animated.Value(0)).current;
  /** İlk ölçüm animasyon başlatmaz. */
  const first = useRef(true);
  /* Yükseklik STATE, ref DEĞİL: `marginBottom` çizimde hesaplanıyor ve ölçüm gelince yeniden
     çizilmesi gerekiyor. Aynı değer tekrar yazılmaz — `marginBottom` yüksekliği değiştirmediği
     için ikinci bir ölçüm gelse de döngü doğmaz. */
  const [height, setHeight] = useState(0);

  useEffect(() => {
    /* İLK ÖLÇÜMDE ANİMASYON YOK: `height` bağımlılıkta çünkü kayma mesafesi ondan türüyor, ama
       ölçüm ilk geldiğinde çubuk zaten yerinde — oynatmak açılışta sebepsiz bir hareket olurdu. */
    if (first.current) {
      first.current = false;
      return;
    }
    /* LAYOUT ANİ, KAYMA ANİMASYONLU (kullanıcı bulgusu 30.08 — hızlı kaydırmada titreme).
       `marginBottom` çizimde doğrudan yeni değerine geçer: kaydırıcının boyu TEK karede değişir.
       Sonra çubuk eski yerinden yenisine `translateY` ile kayar — bu yerel sürücüye iner, JS
       köprüsüne hiç uğramaz ve layout'a dokunmaz.

       Öncesi şöyleydi ve titremenin sebebi oydu: `marginBottom`un KENDİSİ animasyonlanıyordu,
       yani 240 ms boyunca her karede kaydırıcının boyu değişiyor ve her değişim yeni bir
       `onScroll` üretiyordu. Tasarım bunu yaşamıyor çünkü orada `max-height` geçişini tarayıcı
       tek reflow'da yürütüyor; JS'e her karede bir olay dönmüyor. */
    offset.setValue(tabBarHidden ? -height : height);
    Animated.timing(offset, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start();
  }, [tabBarHidden, height, offset]);

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          /* NEGATİF ALT KENAR = KAZANILAN ALAN (kullanıcı bulgusu 30.08, iki cihazda ölçüldü).
             Eskiden yalnız `translateY` vardı: çubuk görsel olarak aşağı kayıyor ama layout'ta
             yerini KORUYORDU — ekranın altında çubuk boyunda boş bir krem alan kalıyordu ve
             içerik oraya uzamıyordu. Kabın alt sınırını yukarı çeken `marginBottom`, hem çubuğu
             ekran dışına taşır hem de kardeşi olan sahneye o alanı bırakır.

             DEĞER ANİ, ARA DEĞER YOK: animasyonu `translateY` taşıyor (yukarıdaki künye). */
          marginBottom: tabBarHidden ? -height : 0,
          transform: [{ translateY: offset }],
        },
      ]}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.height;
        if (measured > 0 && measured !== height) setHeight(measured);
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Kayma süresi — envanterin kabuk geçişleri için verdiği aralık (.22-.24s). */
const SLIDE_MS = 240;

const styles = StyleSheet.create<{ bar: ViewStyle }>({
  /* Çubuk kendi yerinde durur; yalnız çizim kayar. `overflow` kırpması gerekmiyor çünkü aşağı
     kayan bir öğe ekranın dışına çıkıyor. */
  bar: { position: 'relative' },
});
