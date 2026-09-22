'use client';

import { brand } from '@lezzet/brand';
import type { Locale } from '@lezzet/i18n';
import accountMessages from '@lezzet/i18n/customer/account';
import type { MeLinkedChannel } from '@lezzet/types';
import type { ChatLinkNotice } from '@/lib/identity/cart-link-landing';
import { errorText } from '@/lib/customer-error-text';
import { formatOrderDate } from '@/lib/storefront/format';
import { Card } from '@/components/customer/ui/card';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { SettingsCard, SettingsDivider } from '@/components/customer/phone-kit/settings-card';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { Note } from '@/components/customer/phone-kit/note';
import { CardHead } from './account-cards';
import { useWhatsappLink } from '../use-whatsapp-link.hook';
import type { Messages } from '../account-types';

/** Sohbet başlatma bağlantısı; Messenger ve Instagram'da bağı biz göndeririz, müşterinin tek işi yazmaktır. */
const WRITE_URL: Record<MeLinkedChannel['source'], string | null> = {
  whatsapp: null,
  messenger: brand.contact.messengerUrl,
  instagram: brand.contact.instagramUrl,
};

interface ChannelsCardProps {
  t: Messages;
  locale: Locale;
  channels: MeLinkedChannel[];
  compact: boolean;
}

/** Bağlı kanallar, native kanal kartının ikizi: satırlar salt okunur, çünkü bağı çözmek bir birleştirme kararıdır ve insana aittir. */
export function ChannelsCard({ t, locale, channels, compact }: ChannelsCardProps) {
  const copy = accountMessages[locale].channels;
  const whatsappNumbers = channels.find((channel) => channel.source === 'whatsapp')?.numbers ?? [];
  const { busy, errorKey, start } = useWhatsappLink(copy.message, whatsappNumbers);
  const chatUnlinked = channels.some((channel) => channel.source !== 'whatsapp' && !channel.linked);
  const statusOf = (channel: MeLinkedChannel) =>
    !channel.linked
      ? copy.notLinked
      : channel.since === null
        ? copy.linked
        : copy.since.replace('{date}', formatOrderDate(channel.since, locale, true));

  const actionOf = (channel: MeLinkedChannel) => {
    if (channel.source === 'whatsapp') {
      if (channel.linked) {
        return (
          <span className="self-start">
            <TextAction label={busy ? copy.busy : copy.relink} onClick={() => void start()} disabled={busy} />
          </span>
        );
      }
      return (
        <>
          <span className="self-start">
            <SecondaryButton label={busy ? copy.busy : copy.cta} tone="olive" shape="pill" onClick={() => void start()} disabled={busy} />
          </span>
          <p className="font-sans text-helper text-muted">{copy.hint}</p>
        </>
      );
    }
    const url = WRITE_URL[channel.source];
    return !channel.linked && url !== null ? (
      <span className="self-start">
        <TextAction label={copy.write} externalHref={url} />
      </span>
    ) : null;
  };

  const rows = channels.map((channel) => (
    <SettingsDivider key={channel.source}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="font-sans text-note font-bold text-ink">{copy.source[channel.source]}</span>
          <span className={['font-sans text-helper', channel.linked ? 'font-bold text-olive-dark' : 'text-muted'].join(' ')}>
            {statusOf(channel)}
          </span>
        </div>
        {channel.numbers.map((number) => (
          <span key={number} className="font-sans text-note font-bold text-ink">
            {number}
          </span>
        ))}
        {actionOf(channel)}
      </div>
    </SettingsDivider>
  ));
  const footer = (
    <>
      {chatUnlinked && <p className="font-sans text-helper text-muted">{copy.chatHint}</p>}
      {errorKey !== null && <Note tone="terracotta" description={errorText(t.errors, errorKey)} />}
    </>
  );

  if (compact) {
    return (
      <SettingsCard title={copy.title}>
        <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.body}</p>
        {rows}
        {footer}
      </SettingsCard>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead title={copy.title} compact={compact} />
      <span className="font-sans text-note leading-relaxed text-muted">{copy.body}</span>
      <div className="flex flex-col gap-2.5">{rows}</div>
      {footer}
    </Card>
  );
}

/**
 * Bağlanma sonucunun tek cümlesi — girişten hemen sonra, sayfanın en üstünde, kısa ömürlü.
 *
 * Ton sonucun kendisidir: bağlandı/zaten bağlı olumlu (zeytin), başka hesaba bağlı ya da geçersiz
 * bağlantı "bekleyen durum" (bal) — hata değil, çünkü müşteri yanlış bir şey yapmadı; kırmızı
 * yalnız onun hatasına ayrılır (sepet ekranının aynı kuralı).
 */
export function ChatLinkNoticeBanner({ t, notice }: { t: Messages; notice: ChatLinkNotice }) {
  const calm = notice === 'linked' || notice === 'own';
  return (
    <div
      role="status"
      className={[
        'rounded-soft border px-4 py-3 font-sans text-body-sm leading-relaxed',
        calm ? 'border-olive bg-olive-bg text-ink' : 'border-honey-line bg-honey-bg text-ink',
      ].join(' ')}
    >
      {t.chatNotice[notice]}
    </div>
  );
}
