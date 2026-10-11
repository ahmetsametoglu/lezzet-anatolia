import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';

/*
  Eylemsiz bölüm sayfalarının başlığı, PWA `FunnelHeader`ının ikizi: geri satırı kaydırma alanının dışında sabit durur, büyük başlık
  içerikle akar. Başlık satırın altına girince satırda küçük adı belirir, ki aynı kelime ekranda iki kez durmasın.
*/

/** Küçük adın beliriş süresi (ms), web ikiziyle aynı. */
const FADE_MS = 150;

/** Büyük başlığın kaydırmadaki yeri; başlık listenin ilk öğesi olduğu için kendi alt kenarı içerikteki alt kenarıdır. */
export function usePageHeader() {
  const [collapsed, setCollapsed] = useState(false);
  const titleBottom = useRef(Number.POSITIVE_INFINITY);

  const onTitleLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    titleBottom.current = y + height;
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y >= titleBottom.current;
    setCollapsed((previous) => (previous === next ? previous : next));
  }, []);

  return { collapsed, onTitleLayout, onScroll };
}

interface PageHeaderBarProps {
  title: string;
  /** Büyük başlık görünmez olduğunda doğru; `usePageHeader`dan gelir, kaydırmasız dallarda verilmez. */
  collapsed?: boolean;
  backLabel: string;
  onBack: () => void;
  testID?: string;
}

export function PageHeaderBar({ title, collapsed = false, backLabel, onBack, testID }: PageHeaderBarProps) {
  const titleStyle = useAnimatedStyle(() => ({ opacity: withTiming(collapsed ? 1 : 0, { duration: FADE_MS }) }), [collapsed]);

  return (
    <View style={styles.bar}>
      <View style={styles.back}>
        <BackButton onPress={onBack} accessibilityLabel={backLabel} testID={testID} />
      </View>
      {/* Büyük başlık görünürken ekran okuyucu adı iki kez duymasın. */}
      <Animated.Text
        style={[styles.compactTitle, titleStyle]}
        numberOfLines={1}
        accessibilityElementsHidden={!collapsed}
        importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
      >
        {title}
      </Animated.Text>
    </View>
  );
}

interface PageHeaderHeroProps {
  /** Büyük harfe çevrilmiş üst satır (`upperIn`). */
  eyebrow: string;
  title: string;
  onTitleLayout?: (event: LayoutChangeEvent) => void;
  /** Başlığın altındaki künye (bakiye, toplu eylem). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PageHeaderHero({ eyebrow, title, onTitleLayout, children, style }: PageHeaderHeroProps) {
  return (
    <View style={[styles.hero, style]}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title} accessibilityRole="header" onLayout={onTitleLayout}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingTop: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
  },
  /** Glif başlıkla hizalanır: daire 40 dp ve glif ortalı olduğu için −16 glifin sol kenarını başlığın sol kenarına oturtur. */
  back: {
    marginLeft: -theme.space['3xl'],
  },
  compactTitle: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
  hero: {
    gap: theme.space.xs,
    paddingTop: theme.space.xs,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
  },
}));
