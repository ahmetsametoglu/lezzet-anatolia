import { Link } from '@/i18n/navigation';
import type { AccountViewProps } from './account-types';
import { Stub } from './account.desktop';
import { Card, CardHead, ConsentSwitch, PointsCard, Row, SavedList } from './components/account-cards';

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
        {/* BEKLEYEN(16.1): talep/şikâyet ekranı. */}
        <span className="flex items-center justify-between gap-3 font-sans text-body-sm font-bold text-muted">
          <span>{t.linkSupport}</span>
          <span className="font-normal">{t.soon}</span>
        </span>
      </Card>

      <Card compact={compact}>
        {/* BEKLEYEN(08.5): profil düzenleme (satır içi form). */}
        <CardHead title={t.profileTitle} compact={compact} action={<Stub label={t.soon} />} />
        <Row label={t.name} value={account.profile.name || '—'} />
        <Row label={t.email} value={account.profile.email ?? '—'} />
        <Row label={t.phone} value={account.profile.phone ?? t.noPhone} />
        <Row
          label={t.language}
          value={<span className="rounded-pill border-[1.5px] border-sand-400 px-3 py-1 font-sans text-micro">{LANGUAGE_LABEL[account.profile.preferredLanguage]}</span>}
        />
      </Card>

      {account.company && (
        <Card compact={compact}>
          <CardHead
            title={t.companyTitle}
            compact={compact}
            action={<span className="rounded-pill bg-olive-bg px-2.5 py-0.5 font-sans text-micro font-bold text-olive">{t.companyApproved}</span>}
          />
          <Row label={t.companyLegalName} value={account.company.legalName} />
          {account.company.siret && <Row label={t.companySiret} value={account.company.siret} />}
        </Card>
      )}

      <Card compact={compact}>
        {/* BEKLEYEN(08.5): adres ekleme/düzenleme/silme. */}
        <CardHead title={t.addressesTitle} compact={compact} action={<Stub label={t.soon} />} />
        {account.addresses.length === 0 && <span className="font-sans text-note text-muted">{t.addressEmpty}</span>}
        {account.addresses.map((address) => (
          <div
            key={address.id}
            className={[
              'flex flex-col gap-0.5 rounded-soft px-3.5 py-2.5',
              address.isDefault ? 'border-[1.5px] border-olive bg-olive-bg' : 'border border-sand-200 bg-card',
            ].join(' ')}
          >
            <span className="truncate font-sans text-note font-bold text-ink">
              {address.label || address.city}
              {address.isDefault && ` · ${t.addressDefault}`}
            </span>
            <span className="truncate font-sans text-micro text-body">
              {address.line1}, {address.city}
            </span>
          </div>
        ))}
      </Card>

      <Card compact={compact}>
        <CardHead title={t.savedTitle} compact={compact} />
        <SavedList t={t} locale={locale} saved={account.saved} compact={compact} />
      </Card>

      <Card compact={compact}>
        <CardHead title={t.consentTitle} compact={compact} />
        <ConsentSwitch label={t.consentEmail} on={account.consent.email} />
        <ConsentSwitch label={t.consentWhatsapp} on={account.consent.whatsapp} />
      </Card>

      {/* Veri notu mobilde KART DEĞİL, sayfanın altındaki ince satır (tasarım). */}
      <span className="px-1 font-sans text-micro leading-relaxed text-muted">{t.dataBody.replace('{email}', CONTACT_EMAIL)}</span>
    </div>
  );
}

const LANGUAGE_LABEL: Record<string, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/**
 * Veri talebi adresi. `@lezzet/brand`'de böyle bir sabit YOK ve oraya eklemek bu işin kapsamı
 * değil; metne gömmek yerine tek yerde durur — marka paketine taşındığında tek satır değişir.
 */
const CONTACT_EMAIL = 'bonjour@lezzetanatolie.com';
