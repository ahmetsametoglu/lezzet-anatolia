'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { NotificationPreferencesView } from '@lezzet/application';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { CardHead, ConsentSwitch } from '../components/account-cards';
import { cancelZoneNoticesAction, setCampaignConsentAction, setKindConsentAction } from './actions';
import type { Messages } from './notifications-types';

/**
 * Bildirim tercihleri — **iki cihazda AYNI düzen** (tek sütun kart listesi). Fork açılmadı çünkü
 * ayrışan bir yerleşim kararı yok; `md:` de kullanılmıyor (CLAUDE §2, puan sayfasının aynı hükmü).
 *
 * Kartlar hesap sayfasının kendi kabuğunu kullanıyor (`Card` · `CardHead` · `ConsentSwitch`) —
 * ikinci bir görsel dil kurulmadı. Anahtar hesap sayfasındakinin AYNISI: kopyalanmadı,
 * genelleştirildi (yazma eylemi artık dışarıdan geliyor).
 *
 * **"Kapatılamayan bildirimler" kartı bilinçli olarak ANAHTARSIZ.** Bu sayfaya sipariş mailinden
 * gelen müşteri büyük olasılıkla o maili kesmek istiyor ve kesemiyoruz. Kartı hiç çizmemek onu
 * "demek ki kapattım" sanısıyla bırakırdı; pasif bir anahtar çizmek ise dokunulabilir görünen bir
 * ölü denetim olurdu. Doğrusu cümleyle söylemek.
 */
interface NotificationsClientProps {
  t: Messages;
  locale: Locale;
  /** `null` = jeton çözülemedi (eski bağ, silinmiş kimlik ya da hiç var olmamış dize). */
  view: NotificationPreferencesView | null;
  token: string | null;
}

export function NotificationsClient({ t, locale, view, token }: NotificationsClientProps) {
  const [zoneBusy, setZoneBusy] = useState(false);
  const [zoneGone, setZoneGone] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!view) {
    /* Geçersiz jeton GİRİŞE YÖNLENDİRİLMEZ: mailden gelen kişiye kendi tercihini değiştirmeye
       çalışırken bir giriş duvarı göstermek, bağın var oluş sebebini boşa çıkarırdı. Sebep de
       söylenmez (eski mi, silinmiş mi) — ayırt etmek "bu adres bizde kayıtlı" bilgisini sızdırır. */
    return (
      <div className="flex flex-col gap-4 py-2">
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

  const cancelZone = async () => {
    setZoneBusy(true);
    setFailed(false);
    const { errorKey } = await cancelZoneNoticesAction(token);
    setZoneBusy(false);
    if (errorKey) setFailed(true);
    else setZoneGone(true);
  };

  // Sunucu tazelenmesi bir tur sürüyor; iptal edilen kayıtları o tura kadar yerelde düşürüyoruz.
  const zoneNotices = zoneGone ? [] : view.zoneNotices;

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="font-sans text-body-sm leading-relaxed text-body">{t.intro}</p>

      {/* Ziyaretçi (jetonu bölge kaydından gelen) kampanya ve davet satırlarını GÖRMEZ: ikisi de
          hesaba bağlı ve kaydı olmayan birinin kapatabileceği bir şey değil. */}
      {!view.visitorOnly && (
        <>
          <Card compact={false}>
            <CardHead title={t.campaignTitle} compact={false} />
            <ConsentSwitch
              label={t.campaignEmail}
              on={view.marketing.email}
              onLabel={t.on}
              offLabel={t.off}
              onToggle={(next) => setCampaignConsentAction('email', next, token)}
            />
            <ConsentSwitch
              label={t.campaignWhatsapp}
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
            {/* Vazgeçmek bir izni kapatmak DEĞİL, verilmiş bir isteği geri almaktır — o yüzden
                anahtar değil düğme. Ziyaretçi de yapabilir: kaydı olan tek şey bu. */}
            <Button variant="secondary" size="sm" disabled={zoneBusy} onClick={() => void cancelZone()}>
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
