'use client';

import { useState } from 'react';
import { formatCompactEuro } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import accountMessages from '@lezzet/i18n/customer/account';
import { SignOutLink } from '@/components/customer/account/sign-out-link';
import { addressDefaultsOf } from '@/components/customer/delivery/address-form';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { NavRow } from '@/components/customer/phone-kit/nav-row';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { DASHED_TOP, SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { AccountView } from '@/lib/account/read';
import { useShareLink } from '@/lib/use-share-link.hook';
import { setConsentAction } from './actions';
import type { AccountCopy, AccountViewProps, Messages } from './account-types';
import { ConsentSwitch, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { AddressesCard } from './components/addresses-card';
import { CouponsCard } from './components/coupons-card';
import { DeleteAccount } from './components/delete-account';
import { LanguageCard } from './components/language-card';
import { LegalDirectory } from './components/legal-directory';
import { ChatLinkNoticeBanner, LinkedChatsCard } from './components/linked-chats-card';
import { ProfileEditForm, WhatsappRow } from './components/profile-card';
import { RedeemPoints } from './components/redeem-points';

/**
 * Hesabım'ın telefon görünümü, native hesap ekranının web ikizi: sıra native'in, metin ortak sözlükten
 * (`@lezzet/i18n/customer/account`), web'e özgü bloklar kum kartın kabuğuyla araya yerleşir; yazı boyutu kartı yok, çünkü tarayıcının
 * kendi yakınlaştırması var. Sonraya kaydedilenler ve bölge haberleri yalnız içerik varken çizilir, çünkü boş kart olmayan bir özelliği
 * varmış gibi gösterir.
 */
export function AccountMobile({ t, locale, account, chatNotice, legal }: AccountViewProps) {
  const copy = accountMessages[locale];
  const { points, company } = account;
  return (
    <div className="flex flex-col gap-3.5 px-4.5 pt-3.5 pb-5">
      {/* Sohbet bağlantısının sonucu girişten hemen sonra, en üstte, bir kez. */}
      {chatNotice && <ChatLinkNoticeBanner t={t} notice={chatNotice} />}

      <ProfileSection t={t} copy={copy} account={account} />

      {company && (
        <section className="flex flex-col gap-1 rounded-control bg-ink p-4">
          <span className="font-sans text-eyebrow-xs font-semibold tracking-normal text-olive-light uppercase">{copy.company.eyebrow}</span>
          <span className="font-sans text-button text-sand-50">{company.legalName}</span>
          {/* Native "SIRET · KDV" yazıyor; web künyesi KDV numarasını taşımıyor (`CompanyInfoSchema`). */}
          {company.siret && <span className="font-sans text-helper text-neutral-400">{company.siret}</span>}
          <p className="mt-1 font-sans text-body-sm text-neutral-400">{copy.company.note}</p>
        </section>
      )}

      {/* Puan bölümü B2B'de hiç çizilmez (DOMAIN §14) — koşulu okumanın kendisi taşıyor (`points` null). */}
      {points && <PointsSection t={t} copy={copy} locale={locale} points={points} coupons={account.coupons} />}
      {points?.inviteUrl && points.referralCode && (
        <ReferralSection t={t} copy={copy} code={points.referralCode} url={points.inviteUrl} />
      )}

      <nav className="overflow-hidden rounded-card bg-sand-250">
        <NavRow label={copy.menu.orders} href="/orders" icon={<MobileIcon name="orders" size={17} className="text-muted" />} />
        <NavRow label={copy.menu.tickets} href="/support" icon={<MobileIcon name="whatsapp" size={17} className="text-muted" />} divider />
        <NavRow label={copy.menu.write} href="/support/new" icon={<MobileIcon name="mail" size={17} className="text-muted" />} divider />
        <NavRow label={copy.menu.delivery} href="/legal/delivery" icon={<MobileIcon name="truck" size={17} className="text-muted" />} divider />
      </nav>

      {/* Bağlı sohbetler menünün hemen altında; salt okunur, gerekçesi kartta. */}
      <LinkedChatsCard t={t} locale={locale} chats={account.chats} compact />

      <AddressesCard
        t={t}
        locale={locale}
        addresses={account.addresses}
        defaults={addressDefaultsOf(account.profile)}
        compact
        billing={company !== null}
        phoneCopy={copy.addresses}
      />

      {(account.saved.length > 0 || account.zoneNotices.length > 0) && (
        <SettingsCard title={t.savedTitle} aside={<SavedAddAll label={t.savedAddAll} saved={account.saved} />}>
          <SavedList t={t} locale={locale} saved={account.saved} compact />
          <ZoneNoticeList t={t} notices={account.zoneNotices} />
        </SettingsCard>
      )}

      <LanguageCard copy={copy.language} locale={locale} stored={account.profile.preferredLanguage} />

      <SettingsCard title={copy.marketing.title}>
        {/* `bind`: kanal sabit, anahtar hangi kapıya yazdığını bilmez (`ConsentSwitch` künyesi). */}
        <ConsentSwitch
          compact
          label={copy.marketing.email}
          on={account.consent.email}
          onLabel={t.consentOn}
          offLabel={t.consentOff}
          failedText={copy.marketing.saveFailed}
          onToggle={setConsentAction.bind(null, 'email')}
        />
        <div className={DASHED_TOP}>
          <ConsentSwitch
            compact
            label={copy.marketing.whatsapp}
            on={account.consent.whatsapp}
            onLabel={t.consentOn}
            offLabel={t.consentOff}
            failedText={copy.marketing.saveFailed}
            onToggle={setConsentAction.bind(null, 'whatsapp')}
          />
        </div>
        <p className="font-sans text-body-sm leading-[1.6] text-sand-600">{copy.marketing.note}</p>
      </SettingsCard>

      <section className="flex flex-col gap-1 rounded-control bg-sand-150 p-3.5">
        <h2 className="font-sans text-body-sm font-bold text-ink">{copy.data.title}</h2>
        <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.data.body}</p>
        <span className="self-start">
          <TextAction href="/legal/privacy" label={copy.data.privacy} />
        </span>
        {/* Silme kartın EN ALTINDA ve terracotta metin — dolgulu düğme sayfanın en güçlü çağrısı olur (native · web). */}
        <DeleteAccount t={t} compact />
      </section>

      {/* Bilgi ve koşullar — native'in çıkıştan hemen önceki bilgi kapısı; telefon görünümünde footer yok. */}
      <LegalDirectory directory={legal} />
      <div className="flex justify-center py-2">
        <SignOutLink locale={locale} variant="text" />
      </div>
    </div>
  );
}

interface ProfileSectionProps {
  t: Messages;
  copy: AccountCopy;
  account: AccountView;
}

/**
 * Profil kartı (native `profileCard`): "Düzenle" formu çekmecede açar, form masaüstü kartıyla aynı bileşen (`ProfileEditForm`);
 * WhatsApp kimlik bağı çekmecede formun altında.
 */
function ProfileSection({ t, copy, account }: ProfileSectionProps) {
  const [editing, setEditing] = useState(false);
  const { profile } = account;
  // Büyük satır ya adı söyler ya adın eksik olduğunu; e-posta künye satırında.
  const nameMissing = profile.name.trim() === '';
  // Avatar harfi KİMLİKTEN: ad yoksa e-postanın ilk harfi (native'in kuralı).
  const avatarSource = nameMissing ? (profile.email ?? '') : profile.name;

  return (
    <>
      <section className="flex items-center gap-3.5 rounded-card bg-sand-250 p-4">
        <CirclePhoto image={null} initial={avatarSource.slice(0, 1)} size={56} emptyClassName="bg-olive-bg" initialClassName="text-h2-sm text-olive-dark" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-sans text-step-sm text-ink">{nameMissing ? copy.profile.addName : profile.name}</span>
          {profile.email && <span className="truncate font-sans text-helper text-muted">{profile.email}</span>}
          {/* Telefon girilmemişse satır çizilmez (native). */}
          {profile.phone && <span className="font-sans text-helper text-muted">{profile.phone}</span>}
        </div>
        <TextAction label={copy.profile.edit} ariaLabel={copy.profile.editLabel} onClick={() => setEditing(true)} />
      </section>

      {editing && (
        <Dialog title={copy.edit.title} closeLabel={t.cancel} onClose={() => setEditing(false)} placement="sheet">
          <div className="flex flex-col gap-4">
            <ProfileEditForm t={t} profile={profile} onDone={() => setEditing(false)} />
            <div className="border-t border-sand-200 pt-3">
              <WhatsappRow t={t} numbers={account.whatsappNumbers} stacked />
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

interface PointsSectionProps {
  t: Messages;
  copy: AccountCopy;
  locale: Locale;
  points: NonNullable<AccountView['points']>;
  coupons: AccountView['coupons'];
}

/**
 * Puan kartı (native `pointsCard`): eşik ve karşılık ayardan gelir (`redeem`), ekran sayı uydurmaz. Çevirme düğmesi eşiğin altında
 * pasif ve kalan puan yazılı, çünkü pasif bir düğmenin sebebi görünmeli.
 */
function PointsSection({ t, copy, locale, points, coupons }: PointsSectionProps) {
  const { minimumPoints, valueCents } = points.redeem;
  const enough = points.balance >= minimumPoints;
  const fill = (text: string) => text.replace('{threshold}', String(minimumPoints)).replace('{value}', formatCompactEuro(valueCents, locale));

  return (
    <SettingsCard
      title={copy.points.title}
      aside={<span className="font-sans text-h2-sm font-bold text-olive-dark">{copy.points.value.replace('{n}', String(points.balance))}</span>}
    >
      <p className="font-sans text-body-sm leading-[1.6] text-body">{fill(copy.points.body)}</p>
      {!enough && <p className="font-sans text-helper font-semibold text-muted">{copy.points.gap.replace('{n}', String(minimumPoints - points.balance))}</p>}
      <RedeemPoints
        t={t}
        locale={locale}
        redeem={points.redeem}
        enough={enough}
        compact
        renderTrigger={(open) => <PrimaryButton shape="block" label={fill(copy.points.convert)} onClick={open} disabled={!enough} />}
      />
      {/* Tam döküm ayrı sayfada (`/account/points`) — kazanma yolları da orada. */}
      <span className="self-start">
        <TextAction href="/account/points" label={copy.points.history} />
      </span>
      {/* Kuponlar puan kartının içinde: ikisi aynı cüzdanın iki yüzü (kazanılan ↔ harcanabilir). */}
      <CouponsCard t={t} locale={locale} coupons={coupons} phoneCopy={copy.points} />
    </SettingsCard>
  );
}

interface ReferralSectionProps {
  t: Messages;
  copy: AccountCopy;
  code: string;
  url: string;
}

/**
 * Davet kartı (native `referral`) — kod görünür (telefonda okunur, söylenir), paylaşılan şey bağlantıdır; adresi
 * ekran kurmaz, okuma verir (`inviteUrl`). Paylaşım sistem menüsü, yoksa panoya kopyalama (`useShareLink`).
 */
function ReferralSection({ t, copy, code, url }: ReferralSectionProps) {
  const { share, copied } = useShareLink();
  return (
    <SettingsCard title={copy.referral.title}>
      <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.referral.body}</p>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-control border-[1.5px] border-dashed border-sand-500 bg-card px-3.5 py-3 text-center font-sans text-body-sm font-bold tracking-[0.06em] text-ink">
          {code}
        </span>
        <SecondaryButton label={copied ? t.inviteCopied : copy.referral.share} tone="olive" shape="pill" onClick={() => void share(url)} />
      </div>
    </SettingsCard>
  );
}
