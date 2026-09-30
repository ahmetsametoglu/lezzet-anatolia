/*
  Telefon iskeletinin bloğu, native `Skeleton`ın web ikizi: üç ton ve köşe kademesi oradan. Ton yalnız bitişik blokları
  birbirinden ayırmak için değişir; boy ve genişlik çağıranın sınıfıdır, çünkü her blok sayfanın kendi ölçüsünü taklit eder.
*/

type PhoneSkeletonTone = 'soft' | 'default' | 'deep';
type PhoneSkeletonRadius = 'full' | 'card' | 'control' | 'none';

const TONE: Record<PhoneSkeletonTone, string> = {
  soft: 'bg-sand-250',
  default: 'bg-sand-300',
  deep: 'bg-sand-400',
};

const RADIUS: Record<PhoneSkeletonRadius, string> = {
  full: 'rounded-full',
  card: 'rounded-card',
  control: 'rounded-control',
  none: '',
};

interface PhoneSkeletonProps {
  tone?: PhoneSkeletonTone;
  radius?: PhoneSkeletonRadius;
  /** Boy, genişlik ve konum — sayfadaki öğenin ölçüsü. */
  className?: string;
}

export function PhoneSkeleton({ tone = 'default', radius = 'full', className = '' }: PhoneSkeletonProps) {
  return <span aria-hidden className={['block animate-pulse', TONE[tone], RADIUS[radius], className].filter(Boolean).join(' ')} />;
}
