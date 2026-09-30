import messages from '@lezzet/i18n/customer/login';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { LoginLegal, LoginSteps } from '@/screens/login/login-steps';
import { useLoginFlow } from '@/screens/login/use-login-flow.hook';

interface LoginSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Sepetin giriş çekmecesi (web ile aynı): müşteri sepetten ayrılmadan giriş yapar, tasarımın ayrı giriş ekranından bilinçli sapma. Google
 * dönüşü de sepete gelir; doğrulanan profil yayınlanınca çekmece kapanır ve sepet hesap kartını çizer.
 */
export function LoginSheet({ visible, onClose }: LoginSheetProps) {
  const t = messages[useAppLocale()];
  const flow = useLoginFlow({ googleReturn: '/cart', onClose });
  return (
    <BottomSheet visible={visible} title={t.title} onClose={onClose} testID="cart-login-sheet">
      <Text style={styles.body}>{t.body}</Text>
      <LoginSteps flow={flow} />
      <LoginLegal privacyHref={{ pathname: '/legal/[page]', params: { page: 'privacy' } }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
}));
