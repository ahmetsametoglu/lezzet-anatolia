'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { CardHead, ConsentSwitch } from '../components/account-cards';
import { setCampaignConsentAction, setKindConsentAction } from './actions';
import type { PreferencesViewProps } from './preferences-types';

/**
 * Masaüstünde hesap kartlarının dilinde, puan dökümüyle aynı dar ve ortalı sütun. "Kapatılamayan bildirimler" kartı anahtarsızdır;
 * hiç çizilmese müşteri kapattığını sanır, pasif anahtar ise dokunulabilir görünen ölü bir denetim olurdu.
 */
export function PreferencesDesktop({ t, locale, view, token, zoneNotices, zoneBusy, failed, onCancelZone }: PreferencesViewProps) {
  if (!view) {
    /* Geçersiz jeton girişe yönlendirilmez, çünkü mailden gelen kişiye giriş duvarı bağın var oluş sebebini boşa çıkarırdı. Sebep
       de söylenmez: eski mi silinmiş mi ayırt etmek "bu adres bizde kayıtlı" bilgisini sızdırır. */
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
        <Card compact={false}>
          <CardHead title={t.invalidTitle} compact={false} />
          <p className="font-sans text-body-sm leading-relaxed text-body">{t.invalidBody}</p>
          <Link href="/account" locale={locale} className="w-max">
            <Button variant="secondary" size="sm">
              {t.invalidAction}
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <p className="font-sans text-body-sm leading-relaxed text-body">{t.intro}</p>

      {/* Ziyaretçi kampanya ve davet satırlarını görmez: ikisi de hesaba bağlı, kaydı olmayan birinin kapatabileceği bir şey değil. */}
      {!view.visitorOnly && (
        <>
          <Card compact={false}>
            <CardHead title={t.campaignTitle} compact={false} />
            <ConsentSwitch
              label={t.campaignEmail}
              icon={<Icon name="mail" size={17} />}
              on={view.marketing.email}
              onLabel={t.on}
              offLabel={t.off}
              onToggle={(next) => setCampaignConsentAction('email', next, token)}
            />
            <ConsentSwitch
              label={t.campaignWhatsapp}
              icon={<Icon name="chat" size={17} />}
              on={view.marketing.whatsapp}
              onLabel={t.on}
              offLabel={t.off}
              onToggle={(next) => setCampaignConsentAction('whatsapp', next, token)}
            />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.campaignNote}</span>
          </Card>

          <Card compact={false}>
            <CardHead title={t.reviewTitle} compact={false} />
            <ConsentSwitch
              label={t.reviewLabel}
              on={view.kinds.feedbackInvite}
              onLabel={t.on}
              offLabel={t.off}
              onToggle={(next) => setKindConsentAction('feedbackInvite', next, token)}
            />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.reviewNote}</span>
          </Card>
        </>
      )}

      <Card compact={false}>
        <CardHead title={t.zoneTitle} compact={false} />
        {zoneNotices.length === 0 ? (
          <span className="font-sans text-body-sm text-muted">{t.zoneEmpty}</span>
        ) : (
          <>
            {zoneNotices.map((notice) => (
              <span key={notice.id} className="font-sans text-body-sm text-ink">
                {t.zoneWaiting.replace('{code}', notice.placeName ?? notice.postalCode)}
              </span>
            ))}
            {/* Vazgeçmek bir izni kapatmak değil verilmiş bir isteği geri almaktır, o yüzden anahtar değil düğme. */}
            <Button variant="secondary" size="sm" disabled={zoneBusy} onClick={onCancelZone}>
              {t.zoneCancel}
            </Button>
          </>
        )}
        {view.visitorOnly && <span className="font-sans text-micro leading-relaxed text-muted">{t.visitorNote}</span>}
      </Card>

      <Card compact={false}>
        <CardHead title={t.alwaysTitle} compact={false} />
        <p className="font-sans text-body-sm leading-relaxed text-body">{t.alwaysNote}</p>
      </Card>

      {failed && <span className="font-sans text-note font-semibold text-terracotta">{t.saveFailed}</span>}
    </div>
  );
}
