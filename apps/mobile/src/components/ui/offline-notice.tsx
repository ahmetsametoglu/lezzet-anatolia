import { useUnistyles } from 'react-native-unistyles';

import { EmptyState } from './empty-state';
import { Icon } from './icon';
import { PrimaryButton } from './primary-button';

/*
  SUNUCUYA ULAŞILAMADI — tek görünüm, tek yerde.

  NEDEN AYRI BİR BİLEŞEN: bu kalıp (ikon `connection-off` → başlık → açıklama → "Tekrar dene")
  uygulamada 13 ekranda ELLE tekrar ediyordu ve künyeleri onu zaten bir sözleşme gibi anlatıyor
  ("aynı arıza üç ekranda üç ayrı görünüme sahip olmasın" — `orders-screen`). Sözleşme varsa
  bileşeni de olmalı: ikon boyu, rengi ve düğme biçimi 13 yerde ayrı ayrı yazıldığı sürece biri
  bir gün ötekinden ayrı düşer.

  METİN DIŞARIDAN GELİR, İÇERİDE DURMAZ: her sayfanın kendi `messages.json`u var (CLAUDE §2) ve
  "paketleri getiremedik" ile "vitrini getiremedik" aynı cümle değildir. Ortak olan GÖRÜNÜM,
  ortak olan metin değil.

  BEKLEYEN(21.91): mevcut 13 çağrı henüz göç etmedi — bu bileşen yeni iki yerde (vitrin · hesap)
  kullanılıyor, ötekiler hâlâ kalıbı elle kuruyor. Göç tek turda yapılmalı ki ikisi bir arada
  yaşadığı süre kısa olsun.
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
