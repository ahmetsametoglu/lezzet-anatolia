import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';

import { useOperationsShellScroll } from '@/lib/operations/shell-scroll';

/*
  SEKME ÇUBUĞUNUN KAYMASI (Komponent Envanteri M1c) — *"Aşağı kaydırmada gizlenir, yukarıda döner;
  kaydırma payı 120px'ten kısaysa gizleme kapalıdır."*

  Kararın kendisi burada DEĞİL: eşik, yön birikimi ve 120px payı `lib/operations/shell-scroll`ta,
  yani mikro başlıkla aynı yerde. Bu dosya yalnız kararı harekete çeviriyor — ikisi ayrı yerde
  hesaplansaydı çubuk ve başlık farklı anlarda tepki verir, kullanıcı da bunu "takılma" diye
  görürdü.

  ── ENVANTERİN ŞART KOŞTUĞU BİÇİM ──────────────────────────────────────────
  *"Çubuk gizlemede KAP YÜKSEKLİĞİNİ DEĞİŞTİRME: yalnız translateY + contentInset."* Sebebi
  tasarımın kendi betiğinde ölçülü — web'de kap büyüyünce tarayıcı `scrollTop`u kırpıyor ve
  aç-kapa titremesi doğuyor. Burada çubuk zaten kaydırıcının kardeşi (mutlak konumlu değil, ama
  ölçüsü sabit): yalnız `translateY` ile aşağı kayar, layout'a dokunulmaz.

  Yükseklik ÖLÇÜLEREK alınıyor (`onLayout`), sabit yazılmıyor: çubuğun boyu cihazın alt güvenli
  alanına göre değişiyor ve 86px'lik tasarım değeri jestli telefonlarda eksik kalırdı — çubuk
  tam gizlenmez, bir şerit ekranda asılı kalırdı.
*/

export function OperationsTabBarSlide({ children }: { children: ReactNode }) {
  const { tabBarHidden } = useOperationsShellScroll();
  const offset = useRef(new Animated.Value(0)).current;
  const height = useRef(0);

  useEffect(() => {
    Animated.timing(offset, {
      toValue: tabBarHidden ? height.current : 0,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [tabBarHidden, offset]);

  return (
    <Animated.View
      style={[styles.bar, { transform: [{ translateY: offset }] }]}
      onLayout={(event) => {
        height.current = event.nativeEvent.layout.height;
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
