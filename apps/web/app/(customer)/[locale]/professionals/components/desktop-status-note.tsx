import type { B2bApplicationStatus } from '@lezzet/domain-core';
import { TranslationNote } from '@/components/customer/ui/translation-note';
import { Icon, type IconName } from '@/components/customer/ui/icons';
import type { Messages } from '../professionals-types';

/**
 * Masaüstünde başvurunun durum satırı; iç ölçütler (faaliyet kodu, rota) görünmez, onlar operasyonun. Ret gerekçesi görünür, çünkü
 * sebebini bilmeyen aday aynı eksikle yeniden başvurur ve aynı kuyruğu ikinci kez meşgul eder.
 */
interface DesktopStatusNoteProps {
  t: Messages;
  status: B2bApplicationStatus;
  /** Reddin gerekçesi, başvuru sahibinin dilinde; yoksa `null` (bkz. `ProfessionalsViewProps`). */
  rejection: { reason: string; translated: boolean } | null;
}

/** Ton hâle göre; ret için hata rengi değil `closed` ailesi, çünkü sonuçlanmış bir karar arıza değildir. */
const TONE: Record<Exclude<B2bApplicationStatus, 'none'>, string> = {
  pending: 'bg-honey-bg text-honey',
  approved: 'bg-olive-bg text-olive-dark',
  rejected: 'bg-closed-bg text-closed',
};

const MARK: Record<Exclude<B2bApplicationStatus, 'none'>, IconName | null> = {
  pending: 'timer',
  approved: 'check',
  // Reddedilen hâlde işaret yok: ✕ ya da ⚠ suçlayıcı okunur.
  rejected: null,
};

export function DesktopStatusNote({ t, status, rejection }: DesktopStatusNoteProps) {
  if (status === 'none') return null;

  const mark = MARK[status];
  // Gerekçe yalnız ret hâlinde: onaylanmış kayıtta eski gerekçeyi göstermek kapanmış bir tartışmayı yeniden açardı.
  const reason = status === 'rejected' ? rejection : null;

  return (
    <div className={['flex flex-col gap-2 rounded-soft px-4.5 py-3 font-sans text-body-sm leading-relaxed', TONE[status]].join(' ')}>
      <p className="flex items-center gap-1.5 font-semibold">
        {mark && <Icon name={mark} size={15} className="flex-none" />}
        {t.status[status]}
      </p>

      {reason && (
        <>
          {/* Başlık gerekçeyi durum cümlesinden ayırır: bitişik yazılsa operatörün cümlesi bizim metnimizin devamı gibi okunurdu. */}
          <p className="font-semibold opacity-80">{t.rejectReasonTitle}</p>
          <p>{reason.reason}</p>
          {reason.translated && <TranslationNote badge={t.translation.badge} />}
        </>
      )}
    </div>
  );
}
