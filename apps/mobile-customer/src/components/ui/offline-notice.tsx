import { useUnistyles } from 'react-native-unistyles';

import { EmptyState } from './empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';

/*
  "Sunucuya ulaşılamadı" görünümünün tek yeri; metin çağırandan gelir, çünkü her sayfa neyi getiremediğini kendi cümlesiyle söyler.
  BEKLEYEN(K.74): müşteri ekranlarının çoğu bu görünümü hâlâ elle kuruyor; göç tek turda yapılır.
*/

interface OfflineNoticeProps {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  /** `EmptyState.fill` — kabın içindeki parçalarda `false` geçilir (o bileşenin künyesi). */
  fill?: boolean;
  testID?: string;
}

export function OfflineNotice({ title, description, retryLabel, onRetry, fill, testID }: OfflineNoticeProps) {
  const { theme } = useUnistyles();

  return (
    <EmptyState
      icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
      title={title}
      description={description}
      action={<PrimaryButton label={retryLabel} shape="pill" onPress={onRetry} testID={`${testID ?? 'offline'}-retry`} />}
      fill={fill}
      testID={testID}
    />
  );
}
