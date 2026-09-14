import { useLocalSearchParams } from 'expo-router';

import { SocialConversationScreen } from '@/screens/management/social-conversation-screen';

/*
  SOSYAL SOHBET — `/social/:conversationId` (`delivery/[orderId]` kalıbı): `(sections)` dışında,
  sekme çubuğu olmadan açılır; sistem geri hareketi gelen kutusuna döner. Param ekrana prop geçer —
  adres bilgisi rotanın işi, ekranın değil.
*/
export default function SocialConversationRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <SocialConversationScreen conversationId={conversationId} />;
}
