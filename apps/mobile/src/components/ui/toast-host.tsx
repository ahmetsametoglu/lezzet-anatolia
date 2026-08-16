import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useToastMessage } from '@/lib/toast/toast-store';

/*
  TOAST HOST — v3'ün toast katmanı (v3:2035-2039): alt-orta, mürekkep zemin üstünde kum metin,
  tab çubuğunun üstünde (`size.toastBottom` + cihaz inset'i). KÖKTE TEK KOPYA çizilir
  (`app/_layout`); ekranlar yalnız `toastSuccess`/`toastError`/`toastInfo` basar.

  `pointerEvents="none"`: mesaj dokunuşu YUTMAZ — şablonun kendi kuralı; toast'ın altındaki
  düğme, mesaj görünürken de basılabilir kalır.

  Giriş animasyonu şablonun `pop .3s`i (hafif büyüme + belirme); yalnız opacity/transform —
  native sürücüde koşar, JS hattını (ve test ortamını) meşgul etmez. Süreli kaybolma depoda
  (2400 ms); çıkışta animasyon yok, şablonda da yok.
*/
export function ToastHost() {
  const message = useToastMessage();
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message === null) return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [message, pop]);

  if (message === null) return null;
  return (
    <View style={styles.frame} pointerEvents="none">
      <Animated.View
        style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}
      >
        <Text style={styles.message} testID="toast-message">
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  frame: {
    position: 'absolute',
    left: theme.space['5xl'],
    right: theme.space['5xl'],
    bottom: rt.insets.bottom + theme.size.toastBottom,
    alignItems: 'center',
    zIndex: 80,
  },
  message: {
    backgroundColor: theme.colors.ink,
    color: theme.colors['sand-50'],
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    textAlign: 'center',
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['5xl'],
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
}));
