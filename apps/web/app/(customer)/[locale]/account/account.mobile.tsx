'use client';

import { useCallback, useState } from 'react';
import { formatCompactEuro } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import accountMessages from '@lezzet/i18n/customer/account';
import { SignOutLink } from '@/components/customer/account/sign-out-link';
import { addressDefaultsOf } from '@/components/customer/delivery/address-form';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { NavRow } from '@/components/customer/phone-kit/nav-row';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { DASHED_TOP, SettingsCard } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { NewsStrip } from '@/components/customer/ui/toast';
import type { AccountView } from '@/lib/account/read';
import { useShareLink } from '@/lib/use-share-link.hook';
import { setConsentAction } from './actions';
import type { AccountCopy, AccountViewProps, Messages } from './account-types';
import { ConsentSwitch, SavedAddAll, SavedList, ZoneNoticeList } from './components/account-cards';
import { AddressesCard } from './components/addresses-card';
import { LanguageCard } from './components/language-card';
import { LegalDirectory } from './components/legal-directory';
import { ChannelsCard, ChatLinkNoticeBanner } from './components/channels-card';
import { PhoneCouponList } from './components/phone-coupon-list';
import { PhoneDeleteAccount } from './components/phone-delete-account';
import { PhonePointsEarnList, type PhoneEarnActions } from './components/phone-points-earn-list';
import { PhoneProfileSheet } from './components/phone-profile-sheet';
import { useRedeemPoints } from './use-redeem-points.hook';

/**
 * Hesabım'ın telefon görünümü, native hesap ekranının ikizi; web'e özgü bloklar aynı kum kartla araya girer. Sonraya kaydedilenler
 * ve bölge haberleri yalnız içerik varken çizilir, çünkü boş kart olmayan bir özelliği varmış gibi gösterir.
 */
export function AccountMobile({ t, locale, account, chatNotice, legal }: AccountViewProps) {
  const copy = accountMessages[locale];
  const { points, company } = account;
  const identifiers = company && companyIdentifiers(company, copy.company.identifiers);
  return (
    <div className="flex flex-col gap-3.5 px-4.5 pt-3.5 pb-5">
      {/* Sohbet bağlantısının sonucu girişten döner dönmez okunmalı; bu yüzden en üstte. */}
      {chatNotice && <ChatLinkNoticeBanner t={t} notice={chatNotice} />}

      <ProfileSection t={t} copy={copy} account={account} />

      {company && (
        <section className="flex flex-col gap-1 rounded-control bg-ink p-4">
          <span className="font-sans text-eyebrow-xs font-semibold tracking-normal text-olive-light uppercase">{copy.company.eyebrow}</span>
          <span className="font-sans text-button text-sand-50">{company.legalName}</span>
          {identifiers && <span className="font-sans text-helper text-neutral-400">{identifiers}</span>}
          <p className="mt-1 font-sans text-body-sm text-neutral-400">{copy.company.note}</p>
        </section>
      )}

      {/* Puan B2B'de yok: okuma B2B hesapta `points`i hiç doldurmaz. */}
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

      <ChannelsCard t={t} locale={locale} channels={account.channels} compact />

      <SettingsCard title={copy.marketing.title}>
        {/* Kanal burada bağlanır, çünkü anahtar hangi kapıya yazdığını bilmez. */}
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
        {/* Silme dolgusuz metin eylemi: dolgulu düğme sayfanın en güçlü çağrısı olur ve silmeye davet ederdi. */}
        <PhoneDeleteAccount copy={copy.deleteAccount} locale={locale} />
      </section>

      {/* Telefon görünümünde altbilgi yok; belgelerin kalıcı kapısı burası. */}
      <LegalDirectory directory={legal} />
      <div className="flex justify-center py-2">
        <SignOutLink locale={locale} variant="text" />
      </div>
    </div>
  );
}

/** Native "SIRET · KDV" kalıbı; ikisinden biri eksikse yalnız olan yazılır. */
function companyIdentifiers(company: NonNullable<AccountView['company']>, template: string): string | null {
  const { siret, vatNumber } = company;
  if (siret && vatNumber) return template.replace('{siret}', siret).replace('{vat}', vatNumber);
  return siret || vatNumber || null;
}

interface ProfileSectionProps {
  t: Messages;
  copy: AccountCopy;
  account: AccountView;
}

function ProfileSection({ t, copy, account }: ProfileSectionProps) {
  const [editing, setEditing] = useState(false);
  const closeEditing = useCallback(() => setEditing(false), []);
  const { profile } = account;
  // E-posta ad yuvasına yazılmaz: o yuva kısa ad için ve uzun adres ortasından bölünür.
  const nameMissing = profile.name.trim() === '';
  // Ad yoksa harf e-postadan gelir ki avatar boş kalmasın.
  const avatarSource = nameMissing ? (profile.email ?? '') : profile.name;

  return (
    <>
      <section className="flex items-center gap-3.5 rounded-card bg-sand-250 p-4">
        <CirclePhoto image={null} initial={avatarSource.slice(0, 1)} size={56} emptyClassName="bg-olive-bg" initialClassName="text-h2-sm text-olive-dark" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-sans text-step-sm text-ink">{nameMissing ? copy.profile.addName : profile.name}</span>
          {profile.email && <span className="font-sans text-helper break-all text-muted">{profile.email}</span>}
          {/* Boş telefon için satır çizilmez; olmayan bilgiye yer ayırmak gürültüdür. */}
          {profile.phone && <span className="font-sans text-helper text-muted">{profile.phone}</span>}
        </div>
        <TextAction label={copy.profile.edit} ariaLabel={copy.profile.editLabel} onClick={() => setEditing(true)} />
      </section>

      {editing && <PhoneProfileSheet t={t} copy={copy.edit} profile={profile} onClose={closeEditing} />}
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
 * Eşik ve karşılık ayardan gelir, çünkü ekranın eşiği motorunkinden ayrışırsa müşteri reddedilecek düğmeye basar. Eşiğin altında
 * düğme pasif ve kalan puan yazılı, çünkü pasif düğmenin sebebi görünmeli.
 */
function PointsSection({ t, copy, locale, points, coupons }: PointsSectionProps) {
  const { minimumPoints, valueCents } = points.redeem;
  const enough = points.balance >= minimumPoints;
  const fill = (text: string) => text.replace('{threshold}', String(minimumPoints)).replace('{value}', formatCompactEuro(valueCents, locale));
  const redeem = useRedeemPoints();
  const [earnOpen, setEarnOpen] = useState(false);
  const closeEarn = useCallback(() => setEarnOpen(false), []);
  const { share } = useShareLink();
  const inviteUrl = points.inviteUrl;
  // Kazanma yolu müşteriyi o işin yapıldığı yere götürür; davet bağlantısı yoksa paylaşma satırı düğmesiz kalır.
  const earnActions: PhoneEarnActions = {
    referral:
      inviteUrl === null
        ? undefined
        : {
            onClick: () => {
              closeEarn();
              void share(inviteUrl);
            },
          },
    neighbor: { href: '/orders' },
    review: { href: '/orders' },
    feedback_candidate: { href: '/discover' },
  };

  return (
    <SettingsCard
      title={copy.points.title}
      aside={<span className="font-sans text-h2-sm font-bold text-olive-dark">{copy.points.value.replace('{n}', String(points.balance))}</span>}
    >
      <p className="font-sans text-body-sm leading-[1.6] text-body">{fill(copy.points.body)}</p>
      {!enough && (
        <p className="font-sans text-helper font-semibold text-muted">
          {copy.points.gap.replace('{n}', String(minimumPoints - points.balance))}
        </p>
      )}
      <PrimaryButton
        shape="block"
        label={
          redeem.busy
            ? copy.points.converting
            : copy.points.convert
                .replace('{threshold}', String(points.nextRedeem.points))
                .replace('{value}', formatCompactEuro(points.nextRedeem.valueCents, locale))
        }
        onClick={redeem.convert}
        disabled={redeem.busy || !enough}
      />
      {redeem.failed && <Note tone="terracotta" description={copy.points.failed} />}
      {/* Kazanma yolları kartta değil yalnız çekmecede; kart onlara buradan açılır. */}
      <span className="self-start">
        <TextAction label={copy.points.howTo} onClick={() => setEarnOpen(true)} />
      </span>
      {/* Tam döküm ayrı sayfada, çünkü defter veriyle sınırsız büyür. */}
      <span className="self-start">
        <TextAction href="/account/points" label={copy.points.history} />
      </span>
      {/* Kuponlar puan kartının içinde: ikisi aynı cüzdanın iki yüzü (kazanılan ↔ harcanabilir). */}
      <PhoneCouponList copy={copy.points} locale={locale} coupons={coupons} />

      {redeem.converted && <NewsStrip message={copy.points.converted} placement="bottom" compact />}

      {earnOpen && (
        <Dialog title={copy.points.howToTitle} closeLabel={t.cancel} onClose={closeEarn} placement="sheet">
          <PhonePointsEarnList
            locale={locale}
            rules={points}
            visitClaimedToday={points.visitClaimedToday}
            actions={earnActions}
            showRules
          />
        </Dialog>
      )}
    </SettingsCard>
  );
}

interface ReferralSectionProps {
  t: Messages;
  copy: AccountCopy;
  code: string;
  url: string;
}

/** Kod görünür, çünkü telefonda okunur ve söylenir; paylaşılan ise bağlantıdır, çünkü kodun girildiği bir ekran yok. */
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
