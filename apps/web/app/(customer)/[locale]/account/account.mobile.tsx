import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { statusPillClass } from '@/components/customer/ui/badge';
import { Card } from '@/components/customer/ui/card';
import { CardHead, ConsentSwitch, InviteCard, PointsCard, Row, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { setConsentAction } from './actions';
import { AddressesCard } from './components/addresses-card';
import { addressDefaultsOf } from '@/components/customer/delivery/address-form';
import { CouponsCard } from './components/coupons-card';
import { DeleteAccount } from './components/delete-account';
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
      {/* Sayfa başlığı YOK: mobilde `accountChrome` zaten "Hesabım"ı başlık satırında taşıyor —
          h1 buradayken ekranda iki kez alt alta yazılıyordu (kullanıcı bulgusu 20.08). Tasarım tek
          satır çiziyor: "Hesabım … Çıkış". Masaüstünde başlık sekmelerde, orada h1 sorunu yok. */}
      {account.points && <PointsCard t={t} locale={locale} points={account.points} compact={compact} />}
      {account.points && <InviteCard t={t} points={account.points} compact={compact} />}

      {/* KUPONLARIM MOBİLDE TASARIMDA YOK ama "Kupona çevir" düğmesi VAR (17.5, sapma
          `design/BACKLOG`ta). Çizim eylemi mobilde veriyor, sonucunu göstermiyor: çeviren müşteri
          "kupon Kuponlarım'da görünür" cümlesini okuyup gidecek bir yer bulamazdı — mobil menüde
          yaşanan çıkmazın aynısı. Kutu YALNIZ kupon varken çiziliyor: boşken çizmek, tasarımın
          bilerek sade tuttuğu ekrana kullanılmayan bir blok eklemek olurdu. */}
      {account.coupons.length > 0 && (
        <Card compact={compact}>
          <CardHead title={t.couponsTitle} compact={compact} />
          <CouponsCard t={t} locale={locale} coupons={account.coupons} />
        </Card>
      )}

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

      <ProfileCard t={t} locale={locale} profile={account.profile} whatsappNumbers={account.whatsappNumbers} compact={compact} />

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

      <AddressesCard
        t={t}
        locale={locale}
        addresses={account.addresses}
        defaults={addressDefaultsOf(account.profile)}
        compact={compact}
      />

      <Card compact={compact}>
        <CardHead title={t.savedTitle} compact={compact} action={<SavedAddAll label={t.savedAddAll} saved={account.saved} />} />
        <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />
        <ZoneNoticeList t={t} notices={account.zoneNotices} />
      </Card>

      <Card compact={compact}>
        <CardHead title={t.consentTitle} compact={compact} />
        {/* `bind` gerekçesi masaüstü ikizinde yazılı: sunucu bileşeninden istemciye ancak server
            action geçer, yerinde yazılmış ok fonksiyonu geçmez. */}
        <ConsentSwitch label={t.consentEmail} on={account.consent.email} onLabel={t.consentOn} offLabel={t.consentOff} onToggle={setConsentAction.bind(null, 'email')} />
        <ConsentSwitch label={t.consentWhatsapp} on={account.consent.whatsapp} onLabel={t.consentOn} offLabel={t.consentOff} onToggle={setConsentAction.bind(null, 'whatsapp')} />
      </Card>

      {/* Veri notu mobilde KART DEĞİL, sayfanın altındaki ince satır (tasarım). Gizlilik bağı
          08.8 ile açıldı; masaüstündeki kartla aynı hedef, buradaki kabuğu ince satır. */}
      <span className="px-1 font-sans text-micro leading-relaxed text-muted">{t.dataBody}</span>
      <Link href="/legal/privacy" className="px-1 font-sans text-micro font-bold text-olive transition-colors hover:text-olive-dark">
        {t.dataLink}
      </Link>
      {/* Mobilde de veri satırının hemen altında — aynı bağlam, kabuğu ince (08.21). */}
      <span className="px-1">
        <DeleteAccount t={t} />
      </span>
    </div>
  );
}
