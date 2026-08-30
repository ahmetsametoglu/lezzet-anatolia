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
  const progress = useRef(new Animated.Value(0)).current;
  /* Yükseklik STATE, ref DEĞİL: `marginBottom` çizimde hesaplanıyor ve ölçüm gelince yeniden
     çizilmesi gerekiyor. Aynı değer tekrar yazılmaz — `marginBottom` yüksekliği değiştirmediği
     için ikinci bir ölçüm gelse de döngü doğmaz. */
  const [height, setHeight] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: tabBarHidden ? 1 : 0,
      duration: SLIDE_MS,
      /* Yerel sürücü DEĞİL: kayan şey yalnız çizim değil, çubuğun kapladığı YER. `marginBottom`
         bir layout özelliği ve yerel sürücüye inmez. Bedeli tek bir 240 ms'lik geçişte JS
         köprüsünün çalışması; karşılığı ekranın altında boş krem bir şeridin kalmaması. */
      useNativeDriver: false,
    }).start();
  }, [tabBarHidden, progress]);

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          /* NEGATİF ALT KENAR = KAZANILAN ALAN (kullanıcı bulgusu 30.08, iki cihazda ölçüldü).
             Eskiden yalnız `translateY` vardı: çubuk görsel olarak aşağı kayıyor ama layout'ta
             yerini KORUYORDU — ekranın altında çubuk boyunda boş bir krem alan kalıyordu ve
             içerik oraya uzamıyordu. Kabın alt sınırını yukarı çeken `marginBottom`, hem çubuğu
             ekran dışına taşır hem de kardeşi olan sahneye o alanı bırakır. */
          marginBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -height] }),
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
