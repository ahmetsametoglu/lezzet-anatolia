import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { statusPillClass } from '@/components/customer/ui/badge';
import { Card } from '@/components/customer/ui/card';
import { CardHead, ConsentSwitch, PointsCard, Row, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { AddressesCard } from './components/addresses-card';
import { ProfileCard } from './components/profile-card';

/**
 * Hesabım — mobil (tasarım: "Hesap Mobil").
 *
 * **Sıra masaüstünden FARKLI ve bu tasarımın kararı:** puan kartı en üstte, hemen ardından gezinme
 * (Siparişlerim · Taleplerim), sonra profil ve adresler. Dar ekranda müşteri sayfayı taramaz, ilk
 * ekranda ne varsa onu görür — oraya en çok bakılan iki şey konur.
 *
 * Kartlar masaüstüyle AYNI parçalar, yalnız `compact`. Ayrı bir mobil kart ailesi yazmak aynı
 * bölümün iki görünümü demekti; biri değiştiğinde öbürü eskirdi.
 */
export function AccountMobile({ t, locale, account }: AccountViewProps) {
  const compact = true;
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <h1 className="font-serif text-page-title-sm leading-tight text-ink">{t.title}</h1>

      {account.points && <PointsCard t={t} locale={locale} points={account.points} compact={compact} />}

      <Card compact={compact}>
        <Link href="/orders" className="flex items-center justify-between gap-3 border-b border-sand-100 pb-2.5 font-sans text-body-sm font-bold text-ink">
          <span>{t.linkOrders}</span>
          <span className="text-olive">→</span>
        </Link>
        <Link href="/support" className="flex items-center justify-between gap-3 font-sans text-body-sm font-bold text-ink">
          <span>{t.linkSupport}</span>
          <span className="text-olive">→</span>
        </Link>
      </Card>

      <ProfileCard t={t} locale={locale} profile={account.profile} compact={compact} />

      {account.company && (
        <Card compact={compact}>
          <CardHead
            title={t.companyTitle}
            compact={compact}
            action={<span className={statusPillClass('sm', 'bg-olive-bg text-olive')}>{t.companyApproved}</span>}
          />
          <Row label={t.companyLegalName} value={account.company.legalName} />
          {account.company.siret && <Row label={t.companySiret} value={account.company.siret} />}
        </Card>
      )}

      <AddressesCard t={t} locale={locale} addresses={account.addresses} compact={compact} />

      <Card compact={compact}>
        <CardHead title={t.savedTitle} compact={compact} action={<SavedAddAll label={t.savedAddAll} saved={account.saved} />} />
        <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />
        <ZoneNoticeList t={t} notices={account.zoneNotices} />
      </Card>

      <Card compact={compact}>
        <CardHead title={t.consentTitle} compact={compact} />
        <ConsentSwitch channel="email" label={t.consentEmail} on={account.consent.email} onLabel={t.consentOn} offLabel={t.consentOff} />
        <ConsentSwitch channel="whatsapp" label={t.consentWhatsapp} on={account.consent.whatsapp} onLabel={t.consentOn} offLabel={t.consentOff} />
      </Card>

      {/* Veri notu mobilde KART DEĞİL, sayfanın altındaki ince satır (tasarım). Gizlilik bağı
          08.8 ile açıldı; masaüstündeki kartla aynı hedef, buradaki kabuğu ince satır. */}
      <span className="px-1 font-sans text-micro leading-relaxed text-muted">{t.dataBody.replace('{email}', CONTACT_EMAIL)}</span>
      <Link href="/legal/privacy" className="px-1 font-sans text-micro font-bold text-olive transition-colors hover:text-olive-dark">
        {t.dataLink}
      </Link>
    </div>
  );
}

/**
 * Veri talebi adresi. `@lezzet/brand`'de böyle bir sabit YOK ve oraya eklemek bu işin kapsamı
 * değil; metne gömmek yerine tek yerde durur — marka paketine taşındığında tek satır değişir.
 */
const CONTACT_EMAIL = 'bonjour@lezzetanatolie.com';
