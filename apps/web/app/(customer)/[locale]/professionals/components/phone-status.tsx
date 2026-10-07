import type { B2bApplicationStatus } from '@lezzet/domain-core';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { ProfessionalsCopy } from '../professionals-types';

interface PhoneStatusProps {
  copy: ProfessionalsCopy;
  status: Exclude<B2bApplicationStatus, 'none'>;
  rejection: { reason: string; translated: boolean } | null;
  onReapply: () => void;
}

/**
 * Başvurusu olan adayın durum bloğu: form gösterilmez, çünkü aynı kuyruğu ikinci kez meşgul ederdi; reddedilen aday "Yeniden başvur"la
 * formu açar. Gerekçe yalnız retle çizilir, çünkü sebebini bilmeyen aday aynı eksikle yeniden başvurur.
 */
export function PhoneStatus({ copy, status, rejection, onReapply }: PhoneStatusProps) {
  const rejected = status === 'rejected';
  const title = status === 'pending' ? copy.status.pendingTitle : status === 'approved' ? copy.status.approvedTitle : copy.status.rejectedTitle;
  const body = status === 'pending' ? copy.status.pending : status === 'approved' ? copy.status.approved : copy.status.rejected;

  return (
    <div className="flex flex-col gap-4 p-4.5 pb-7.5">
      <EmptyState
        icon={<MobileIcon name="mail" size={80} className="text-olive-dark" />}
        title={title}
        description={body}
        action={
          rejected ? (
            <PrimaryButton label={copy.status.reapply} onClick={onReapply} />
          ) : (
            <PrimaryButton label={copy.status.toCatalog} href="/catalog" />
          )
        }
      />
      {rejected && rejection !== null && (
        <div className="flex flex-col gap-2">
          <p className="font-sans text-note font-semibold text-ink">{copy.status.reasonTitle}</p>
          <Note tone="terracotta" description={rejection.reason} />
          {rejection.translated && <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.status.translated}</p>}
        </div>
      )}
    </div>
  );
}
