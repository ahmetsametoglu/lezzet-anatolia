import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { statusPillClass } from '@/components/customer/ui/badge';
import { Card } from '@/components/customer/ui/card';
import { CardHead, ConsentSwitch, InviteCard, PointsCard, Row, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { AddressesCard } from './components/addresses-card';
import { CouponsCard } from './components/coupons-card';
import { DeleteAccount } from './components/delete-account';
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
                action={<span className={statusPillClass('sm', 'bg-olive-bg text-olive')}>{t.companyApproved}</span>}
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
            {/* Bağ 08.8 ile AÇILDI: metin bir süredir "gizlilik politikasında bulabilirsiniz"
                diyordu ama gidilecek sayfa yoktu; şimdi var.
                **E-posta adresi 08.21'de DÜŞTÜ** (ekranda görülerek bulundu): metin "silmek için
                bize yazın" diyordu ve tam altında çalışan bir silme düğmesi duruyordu. Politika
                metni düğme yazıldığında güncellenmişti, bu kart unutulmuştu — müşteriye aynı
                ekranda iki farklı yol anlatılıyordu. */}
            <span className="font-sans text-note leading-relaxed text-body">{t.dataBody}</span>
            <Link href="/legal/privacy" className="cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark">
              {t.dataLink}
            </Link>
            {/* Silme BU kartın içinde: veri kartı "verilerinize ne oluyor" sorusunun evi ve
                silme o sorunun en uç cevabı. Ayrı bir kart olsaydı sayfada kendi başına bir
                bölüm gibi durur, hesabın normal işlerinden biri gibi okunurdu (08.21). */}
            <DeleteAccount t={t} />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {account.points && <PointsCard t={t} locale={locale} points={account.points} compact={compact} />}
          {account.points && <InviteCard t={t} points={account.points} compact={compact} />}

          <Card compact={compact}>
            <CardHead title={t.savedTitle} compact={compact} action={<SavedAddAll label={t.savedAddAll} saved={account.saved} />} />
            <span className="font-sans text-micro leading-relaxed text-muted">{t.savedNote}</span>
            <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />

            {/* Bölge haberi, kaydedilenlerin ALT BLOĞU (tasarım) — ayrı kart değil: ikisi de
                "bugün alamadığım şey" başlığı altında yaşıyor. Bekleyen kayıt yoksa hiç çizilmez. */}
            <ZoneNoticeList t={t} notices={account.zoneNotices} />
          </Card>

          {/* Kişisel kuponlar — puanın varış noktası. 17.5 ile doldu; kart o güne kadar boş ama
              YERİNDE durmuştu ki puan zincirinin nereye çıktığı görünsün. */}
          <Card compact={compact}>
            <CardHead title={t.couponsTitle} compact={compact} />
            <CouponsCard t={t} locale={locale} coupons={account.coupons} />
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

