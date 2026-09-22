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
import { useChannelLink } from '../use-channel-link.hook';
import type { Messages } from '../account-types';

const CHAT_URL: Partial<Record<MeLinkedChannel['source'], string | null>> = {
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
  const { busy, errorKey, copied, start, copyAgain } = useChannelLink({ whatsapp: copy.message, chat: copy.chatMessage }, channels);
  const statusOf = (channel: MeLinkedChannel) =>
    !channel.linked
      ? copy.notLinked
      : channel.since === null
        ? copy.linked
        : copy.since.replace('{date}', formatOrderDate(channel.since, locale, true));

  const rows = channels.map((channel) => {
    const name = copy.source[channel.source];
    const hazir = busy === channel.source;
    const steps = copied?.source === channel.source && !channel.linked;
    const chatUrl = CHAT_URL[channel.source] ?? null;
    return (
      <SettingsDivider key={channel.source}>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-sans text-note font-bold text-ink">{name}</span>
              <span className={['font-sans text-helper', channel.linked ? 'font-bold text-olive-dark' : 'text-muted'].join(' ')}>
                {statusOf(channel)}
              </span>
              {channel.numbers.map((number) => (
                <span key={number} className="font-sans text-note font-bold text-ink">
                  {number}
                </span>
              ))}
              {channel.source === 'whatsapp' && channel.linked && (
                <span className="self-start">
                  <TextAction label={hazir ? copy.busy : copy.relink} onClick={() => void start('whatsapp')} disabled={busy !== null} />
                </span>
              )}
            </div>
            {!channel.linked && !steps && (
              <span className="flex-none">
                <SecondaryButton
                  label={hazir ? copy.busy : copy.cta}
                  tone="olive"
                  shape="pill"
                  onClick={() => void start(channel.source)}
                  disabled={busy !== null}
                />
              </span>
            )}
          </div>
          {steps && (
            <Note
              tone="olive"
              description={copy.copied.replace('{channel}', name)}
              action={
                <span className="flex flex-wrap gap-4">
                  <TextAction label={copy.copyAgain} onClick={() => void copyAgain()} />
                  {chatUrl !== null && <TextAction label={copy.open.replace('{channel}', name)} externalHref={chatUrl} />}
                </span>
              }
            />
          )}
        </div>
      </SettingsDivider>
    );
  });
  const failure = errorKey !== null && <Note tone="terracotta" description={errorText(t.errors, errorKey)} />;

  if (compact) {
    return (
      <SettingsCard title={copy.title}>
        <p className="font-sans text-body-sm leading-[1.6] text-body">{copy.body}</p>
        {rows}
        {failure}
      </SettingsCard>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead title={copy.title} compact={compact} />
      <span className="font-sans text-note leading-relaxed text-muted">{copy.body}</span>
      <div className="flex flex-col gap-2.5">{rows}</div>
      {failure}
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
