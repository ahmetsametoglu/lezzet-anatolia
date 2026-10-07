'use client';

import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { DASHED_TOP, SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { ConsentSwitch } from '../components/account-cards';
import { setCampaignConsentAction, setKindConsentAction } from './actions';
import type { PreferencesViewProps } from './preferences-types';

/**
 * Telefonda Hesabım'ın kum kartları ve kenar boşluğu; native'de karşılığı yok, çünkü sayfa yalnız maildeki bağdan açılır.
 * Geçersiz jetonda da giriş istenmez: mailden gelen kişiye giriş duvarı bağın var oluş sebebini boşa çıkarırdı.
 */
export function PreferencesMobile({ t, view, token, zoneNotices, zoneBusy, failed, onCancelZone }: PreferencesViewProps) {
  if (!view) {
    return (
      <div className="flex flex-col gap-3.5 px-4.5 pt-3.5 pb-5">
        <SettingsCard title={t.invalidTitle}>
          <p className="font-sans text-body-sm leading-[1.6] text-body">{t.invalidBody}</p>
          <SecondaryButton label={t.invalidAction} href="/account" />
        </SettingsCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 px-4.5 pt-3.5 pb-5">
      <p className="font-sans text-body-sm leading-[1.6] text-body">{t.intro}</p>

      {!view.visitorOnly && (
        <>
          <SettingsCard title={t.campaignTitle}>
            <ConsentSwitch
              compact
              label={t.campaignEmail}
              on={view.marketing.email}
              onLabel={t.on}
              offLabel={t.off}
              failedText={t.saveFailed}
              onToggle={(next) => setCampaignConsentAction('email', next, token)}
            />
            <div className={DASHED_TOP}>
              <ConsentSwitch
                compact
                label={t.campaignWhatsapp}
                on={view.marketing.whatsapp}
                onLabel={t.on}
                offLabel={t.off}
                failedText={t.saveFailed}
                onToggle={(next) => setCampaignConsentAction('whatsapp', next, token)}
              />
            </div>
            <p className="font-sans text-body-sm leading-[1.6] text-body">{t.campaignNote}</p>
          </SettingsCard>

          <SettingsCard title={t.reviewTitle}>
            <ConsentSwitch
              compact
              label={t.reviewLabel}
              on={view.kinds.feedbackInvite}
              onLabel={t.on}
              offLabel={t.off}
              failedText={t.saveFailed}
              onToggle={(next) => setKindConsentAction('feedbackInvite', next, token)}
            />
            <p className="font-sans text-body-sm leading-[1.6] text-body">{t.reviewNote}</p>
          </SettingsCard>
        </>
      )}

      <SettingsCard title={t.zoneTitle}>
        {zoneNotices.length === 0 ? (
          <p className="font-sans text-body-sm text-body">{t.zoneEmpty}</p>
        ) : (
          <>
            {zoneNotices.map((notice) => (
              <p key={notice.id} className="font-sans text-body-sm leading-[1.6] text-ink">
                {t.zoneWaiting.replace('{code}', notice.placeName ?? notice.postalCode)}
              </p>
            ))}
            <SecondaryButton label={t.zoneCancel} onClick={onCancelZone} disabled={zoneBusy} />
          </>
        )}
        {view.visitorOnly && <p className="font-sans text-body-sm leading-[1.6] text-body">{t.visitorNote}</p>}
      </SettingsCard>

      <SettingsCard title={t.alwaysTitle}>
        <p className="font-sans text-body-sm leading-[1.6] text-body">{t.alwaysNote}</p>
      </SettingsCard>

      {failed && <p className="font-sans text-note font-semibold text-terracotta">{t.saveFailed}</p>}
    </div>
  );
}
