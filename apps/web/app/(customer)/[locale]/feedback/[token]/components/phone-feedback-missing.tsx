import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import type { FeedbackCopy } from '../feedback-types';

interface PhoneFeedbackMissingProps {
  copy: FeedbackCopy;
}

/** Eskimiş ya da bozuk bağlantının telefon hâli: native gibi kendi ekranı, genel 404 değil, çünkü müşteri e-postasındaki bağlantıyla geldi. */
export function PhoneFeedbackMissing({ copy }: PhoneFeedbackMissingProps) {
  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={copy.title} left={<BackButton label={copy.back} fallback="/" />} />
      <EmptyState fill title={copy.notFound.title} description={copy.notFound.body} action={<PrimaryButton label={copy.notFound.cta} href="/" />} />
    </div>
  );
}
