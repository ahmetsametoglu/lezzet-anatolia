import type { Locale } from '@lezzet/i18n';
import type { LinkedChat } from '@/lib/account/read';
import type { ChatLinkNotice } from '@/lib/identity/cart-link-landing';
import { Card } from '@/components/customer/ui/card';
import { SettingsCard, SettingsDivider } from '@/components/customer/phone-kit/settings-card';
import { CardHead } from './account-cards';
import type { Messages } from '../account-types';

/**
 * **Bağlı sohbetler** (15.16 · 08.09) — müşterinin hangi sohbetlerinin bu hesaba bağlı olduğu.
 *
 * Bugüne kadar bağ yalnız operasyonun gördüğü bir şeydi; müşteri "Messenger'dan yazınca beni
 * tanıyorlar mı" sorusunun cevabını hiçbir yerde göremiyordu. Kart SALT OKUNURDUR: bağ kurmanın
 * tek yolu sohbetten gönderilen bağlantıdır, çözmenin yolu ise bir birleştirme kararıdır ve
 * insana aittir (15.16 — ayırma kapısı bilerek yok). Buraya bir "kaldır" düğmesi koymak, o kararı
 * müşterinin tek tıkına indirmek olurdu.
 *
 * Tarih `linkedAt`, o yoksa sohbetin açılışı — WhatsApp'ta sohbet müşterisiyle doğar ve ayrıca
 * "bağlanmaz"; ikisini "tanıştığımız gün" diye tek kavramda okumak müşteri için doğrudur.
 *
 * Boş hâlde kart YİNE çizilir: yokluk bir eksiklik değil, bir yol tarifi ("yazın, bağlantıyla
 * bağlayın"). Gizlenseydi müşteri bu yolun varlığını hiç öğrenemezdi.
 *
 * Telefon görünümü (14.09) native hesabın kum kartını çizer: native'de bu blok yok (web'e özgü);
 * yeni bir yüzey dili icat edilmedi, adres ve izin kartlarının kabuğu kullanıldı.
 */
interface LinkedChatsCardProps {
  t: Messages;
  locale: Locale;
  chats: LinkedChat[];
  compact: boolean;
}

export function LinkedChatsCard({ t, locale, chats, compact }: LinkedChatsCardProps) {
  const dateOf = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const sinceOf = (chat: LinkedChat) => t.chatSince.replace('{date}', dateOf.format(new Date(chat.since)));

  if (compact) {
    return (
      <SettingsCard title={t.chatsTitle}>
        {chats.length === 0 ? (
          <p className="font-sans text-body-sm leading-[1.6] text-muted">{t.chatsEmpty}</p>
        ) : (
          chats.map((chat, index) => {
            const row = (
              <div className="flex items-center justify-between gap-3">
                <span className="font-sans text-control text-ink">{t.chatSource[chat.source]}</span>
                <span className="font-sans text-helper text-muted">{sinceOf(chat)}</span>
              </div>
            );
            return index === 0 ? <div key={chat.id}>{row}</div> : <SettingsDivider key={chat.id}>{row}</SettingsDivider>;
          })
        )}
        <p className="font-sans text-helper leading-[1.6] text-muted">{t.chatsNote}</p>
      </SettingsCard>
    );
  }

  return (
    <Card compact={compact}>
      <CardHead title={t.chatsTitle} compact={compact} />
      {chats.length === 0 ? (
        <span className="font-sans text-note leading-relaxed text-muted">{t.chatsEmpty}</span>
      ) : (
        <div className="flex flex-col">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="flex items-center justify-between gap-3 border-b border-sand-100 py-2.5 first:pt-0 last:border-b-0 last:pb-0"
            >
              <span className="font-sans text-body-sm font-bold text-ink">{t.chatSource[chat.source]}</span>
              <span className="font-sans text-note text-muted">{sinceOf(chat)}</span>
            </div>
          ))}
        </div>
      )}
      <span className="font-sans text-micro leading-relaxed text-muted">{t.chatsNote}</span>
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
