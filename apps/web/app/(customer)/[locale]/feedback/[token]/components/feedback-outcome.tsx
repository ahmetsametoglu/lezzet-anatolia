'use client';

import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import type { FeedbackCompletion } from '@/lib/feedback/invite';
import type { Messages } from '../feedback-types';

/**
 * Akışın sonu (17.6) — memnuniyete göre DALLANIR ve dallanmayı motor belirler.
 *
 * **Memnun olmayana dış değerlendirme daveti ASLA gösterilmez** (tasarım §6, ekranın üstünde de
 * yazılı: "Google daveti bu ekranda gösterilmez"). Sebebi ticari değil ahlaki: memnuniyetsiz
 * müşteriyi halka açık bir değerlendirmeye yollamak ya onu istemediği bir yere iter ya da
 * işletmeye zarar verir — ikisi de yanlış. Onun yolu talep girişidir.
 *
 * **Karar İSTEMCİDE verilmiyor:** `outcome` motordan geliyor (`feedbackOutcomeOf` — beğeni ORANINA
 * bakan parametrik bir eşik). Burada beğeni sayılsaydı iki yerde iki farklı "memnun" tanımı olurdu.
 *
 * **Puan rozeti her iki dalda da var** ve bu bilinçli: ödül tamamlamaya bağlıdır, beğeniye değil
 * (DOMAIN §14). Memnun olmayan müşteri de puanını alır ve bunu görür — aksi, arayüzün "olumlu
 * yorum yaparsan ödül" dediği anlamına gelirdi.
 */
interface FeedbackOutcomeProps {
  t: Messages;
  completion: FeedbackCompletion;
  customerName: string | null;
  compact?: boolean;
}

export function FeedbackOutcome({ t, completion, customerName, compact = false }: FeedbackOutcomeProps) {
  const happy = completion.outcome === 'review_invite';
  const unhappy = completion.outcome === 'report_issue';

  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <span className={compact ? 'text-[40px] leading-none' : 'text-[36px] leading-none'}>🙏</span>

      <span className={`font-serif ${compact ? 'text-h2-sm' : 'text-card-title'} text-ink`}>
        {unhappy ? t.doneTitleUnhappy : customerName ? t.doneTitle.replace('{name}', customerName) : t.doneTitleNoName}
      </span>

      {/* Puan rozeti YALNIZ bu turda puan kazanıldıysa: ikinci kez açılan davette 0 döner ve
          "+0 puan" yazmak müşteriye anlamsız bir rozet göstermek olurdu. */}
      {completion.pointsAwarded > 0 && (
        <span className="rounded-pill bg-olive px-4.5 py-2 font-sans text-body-sm font-bold text-white">
          {t.pointsBadge.replace('{n}', String(completion.pointsAwarded))}
        </span>
      )}
      <span className="font-sans text-note leading-relaxed text-body">{t.pointsNote}</span>

      {happy && completion.reviewUrl && (
        <div className="flex w-full flex-col gap-2 rounded-card border border-sand-200 bg-card px-4 py-4">
          <span className="font-serif text-body font-semibold leading-snug text-ink">
            {t.reviewInviteTitle.replace('{platform}', completion.reviewPlatform ?? '')}
          </span>
          <span className="font-sans text-micro leading-relaxed text-body">{t.reviewInviteBody}</span>
          {/* Dış bağlantı: yeni sekme + `noopener`. `Link` DEĞİL — o iç rotalar için, dile göre
              yol çeviriyor; buradaki adres ayardan gelen ham bir dış URL. */}
          <a
            href={completion.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'outlineOlive', size: 'sm', compact, fullWidth: true })}
          >
            {t.reviewInviteCta.replace('{platform}', completion.reviewPlatform ?? '')}
          </a>
        </div>
      )}

      {unhappy && (
        <>
          <span className="font-sans text-note leading-relaxed text-body">{t.unhappyBody}</span>
          {/* Talep formuna gidiyor — geri bildirim şikâyet kanalının yerini tutmaz ama kapıyı
              gösterir (içerik envanteri §2). */}
          <Link href="/support/new" className={buttonClass({ size: 'md', compact, fullWidth: true })}>
            {t.reportIssue}
          </Link>
        </>
      )}

      <Link href="/catalog" className="cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark">
        {t.toCatalog}
      </Link>
    </div>
  );
}
