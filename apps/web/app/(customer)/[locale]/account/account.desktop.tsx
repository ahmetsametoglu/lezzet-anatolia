import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { Card, CardHead, ConsentSwitch, PointsCard, Row, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { AddressesCard } from './components/addresses-card';
import { ProfileCard } from './components/profile-card';

/**
 * Hesabım — masaüstü (tasarım: `Musteri - Hesap.dc.html`, "Hesap Web").
 *
 * Düzen tasarımın kendisi: **iki eşit sütun**. Solda kimliğe ve tercihe ait olan (profil, adresler,
 * izinler, veri notu), sağda hesabın kendisine ait olan (puan, kaydedilenler, gezinme). Ayrım
 * keyfi değil — sol sütun "ben kimim", sağ sütun "hesabımda ne var" sorusunu cevaplıyor.
 */
export function AccountDesktop({ t, locale, account }: AccountViewProps) {
  const compact = false;
  return (
    <div className="flex flex-col gap-5 px-12 pt-8 pb-12">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>

      <div className="grid grid-cols-2 items-start gap-5">
        <div className="flex flex-col gap-5">
          <ProfileCard t={t} locale={locale} profile={account.profile} compact={compact} />

          {account.company && (
            <Card compact={compact}>
              <CardHead
                title={t.companyTitle}
                compact={compact}
                action={<span className="rounded-pill bg-olive-bg px-2.5 py-0.5 font-sans text-micro font-bold text-olive">{t.companyApproved}</span>}
              />
              <Row label={t.companyLegalName} value={account.company.legalName} />
              {account.company.siret && <Row label={t.companySiret} value={account.company.siret} />}
              <span className="font-sans text-micro leading-relaxed text-muted">{t.companyNote}</span>
            </Card>
          )}

          <AddressesCard t={t} locale={locale} addresses={account.addresses} compact={compact} />

          <Card compact={compact}>
            <CardHead title={t.consentTitle} compact={compact} />
            <ConsentSwitch channel="email" label={t.consentEmail} on={account.consent.email} onLabel={t.consentOn} offLabel={t.consentOff} />
            <ConsentSwitch channel="whatsapp" label={t.consentWhatsapp} on={account.consent.whatsapp} onLabel={t.consentOn} offLabel={t.consentOff} />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.consentNote}</span>
          </Card>

          <Card compact={compact}>
            <CardHead title={t.dataTitle} compact={compact} />
            {/* BEKLEYEN(08.8): gizlilik politikası sayfası — bağ VERİLMEZ, ölü link 404'e düşerdi. */}
            <span className="font-sans text-note leading-relaxed text-body">{t.dataBody.replace('{email}', CONTACT_EMAIL)}</span>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {account.points && <PointsCard t={t} locale={locale} points={account.points} compact={compact} />}

          <Card compact={compact}>
            <CardHead title={t.savedTitle} compact={compact} action={<SavedAddAll label={t.savedAddAll} saved={account.saved} />} />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.savedNote}</span>
            <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />

            {/* Bölge haberi, kaydedilenlerin ALT BLOĞU (tasarım) — ayrı kart değil: ikisi de
                "bugün alamadığım şey" başlığı altında yaşıyor. Bekleyen kayıt yoksa hiç çizilmez. */}
            <ZoneNoticeList t={t} notices={account.zoneNotices} />
          </Card>

          {/* BEKLEYEN(17.5): kişisel kuponlar — puanın varış noktası burası; çevirme akışıyla
              birlikte dolacak. Kart YERİNDE durur ki puan zincirinin nereye çıktığı görünsün. */}
          <Card compact={compact}>
            <CardHead title={t.couponsTitle} compact={compact} />
            <span className="font-sans text-note text-muted">{t.couponsEmpty}</span>
          </Card>

          <Card compact={compact}>
            <CardHead title={t.linksTitle} compact={compact} />
            <Link href="/orders" className="flex items-center justify-between gap-3 border-b border-sand-100 pb-2.5 font-sans text-body-sm font-bold text-ink transition-colors hover:text-olive">
              <span>{t.linkOrders}</span>
              <span className="text-olive">→</span>
            </Link>
            <Link href="/support" className="flex items-center justify-between gap-3 font-sans text-body-sm font-bold text-ink transition-colors hover:text-olive">
              <span>{t.linkSupport}</span>
              <span className="text-olive">→</span>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Veri talebi adresi. `@lezzet/brand`'de böyle bir sabit YOK ve oraya eklemek bu işin kapsamı
 * değil; metne gömmek yerine tek yerde durur — marka paketine taşındığında tek satır değişir.
 */
const CONTACT_EMAIL = 'bonjour@lezzetanatolie.com';
