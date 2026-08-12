import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readNeighborWelcome, type NeighborWelcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import { buttonClass } from '@/components/customer/ui/button';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { recordPageView } from '@/lib/analytics/page-view';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { acceptNeighborInviteAction } from './actions';
import type { Messages } from './invite-types';
import messages from './messages.json';

/**
 * Komşu daveti karşılaması (17.10) — **paylaşılan bağlantının indiği yer**.
 *
 * Getiren davetinin karşılamasıyla (`/invite/[code]`) aynı iskelet, ama söylediği şey farklı ve
 * fark bu sayfanın tamamını belirliyor: orada davet "bize katıl" der ve süresizdir, burada
 * **"şu güne, bu sefere yetiş"** der ve kesim saatinde ölür. Bu yüzden her hâlde GÜN görünür;
 * günü söylemeyen bir komşu daveti, davet değil sadece bir bağlantıdır.
 *
 * ── BEŞ HÂL ─────────────────────────────────────────────────────────────────
 * `ok` · `unknown` · `run_closed` (sefer geçti / kesim saati doldu) · `full` (kontenjan) · `self`.
 * Dördü de "yine de alışverişe devam" ile biter: davet tutmadı diye ziyaretçiyi kapıda çevirmek,
 * kazanılabilecek bir siparişi elin tersiyle itmektir.
 *
 * **Geçersiz belirteç 404 DEĞİL** — `/invite/[code]`teki aynı karar ve aynı gerekçe: bağlantıyı
 * açan kişi ziyaretçidir, WhatsApp'ta kırpılmış bir bağı tıklamış olabilir.
 *
 * **Davet edenin yalnız ADI görünür** (ilk sözcük). Adres, sipariş içeriği, tutar hiçbiri geçmez:
 * komşu daveti bir teslimat gününü paylaşır, bir siparişi değil.
 */
interface NeighborPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: NeighborPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  // `robots` kapalı: belirteç oturum yerine geçmese de başkasının künyesidir ve sayfanın arama
  // trafiğinden beklentisi yok — tek giriş yolu paylaşılan bağlantı.
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: false } };
}

export default async function NeighborInvitePage({ params }: NeighborPageProps) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/neighbor/[token]');

  const t: Messages = messages[locale];
  const [device, viewerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const welcome = await readNeighborWelcome(serviceDb(), token, viewerId);

  return (
    <SiteFrame device={device} locale={locale as Locale}>
      <NeighborFace device={device} locale={locale as Locale} token={token} welcome={welcome} t={t} />
    </SiteFrame>
  );
}

interface NeighborFaceProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  token: string;
  welcome: NeighborWelcome;
  t: Messages;
}

/**
 * Hâlin yüzü. Beşi de aynı bloğu (`MessageScreen`) kullanıyor — sayfanın kendisi bir DURUM
 * ekranıdır; her hâle ayrı düzen çizmek aynı sayfanın beş farklı görünmesi olurdu.
 */
function NeighborFace({ device, locale, token, welcome, t }: NeighborFaceProps) {
  const compact = device === 'mobile';
  const catalogLink = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/catalog" locale={locale} className={buttonClass({ variant, compact })}>
      {label}
    </Link>
  );

  switch (welcome.status) {
    case 'ok':
      return (
        <MessageScreen
          device={device}
          emoji="🚚"
          eyebrow={t.ok.eyebrow}
          // İsimsiz davet de düzgün bir cümle kurar ("Komşunuz sizi … çağırıyor"): WhatsApp'tan
          // açılmış bir kayıtta yalnız telefon olabilir ve boş yer tutucu cümleyi bozardı.
          title={t.ok.title
            .replace('{name}', welcome.inviterName || t.ok.someone)
            .replace('{date}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={t.ok.description}
          actions={
            <>
              <AcceptButton locale={locale} token={token} target="cart" label={t.ok.primary} variant="primary" compact={compact} />
              <AcceptButton
                locale={locale}
                token={token}
                target="catalog"
                label={t.ok.secondary}
                variant="secondary"
                compact={compact}
              />
            </>
          }
        />
      );
    case 'self':
      return (
        <MessageScreen
          device={device}
          emoji="🔗"
          eyebrow={t.self.eyebrow}
          title={t.self.title}
          description={t.self.description}
          actions={
            <Link href="/orders" locale={locale} className={buttonClass({ variant: 'primary', compact })}>
              {t.self.primary}
            </Link>
          }
        />
      );
    case 'run_closed':
      return (
        <MessageScreen
          device={device}
          emoji="🕔"
          eyebrow={t.runClosed.eyebrow}
          title={t.runClosed.title.replace('{date}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={t.runClosed.description}
          actions={catalogLink(t.runClosed.primary, 'primary')}
        />
      );
    case 'full':
      return (
        <MessageScreen
          device={device}
          emoji="👥"
          eyebrow={t.full.eyebrow}
          title={t.full.title}
          description={t.full.description.replace('{date}', formatDeliveryDate(welcome.deliveryDate, locale))}
          actions={catalogLink(t.full.primary, 'primary')}
        />
      );
    case 'unknown':
      return (
        <MessageScreen
          device={device}
          emoji="🧭"
          eyebrow={t.unknown.eyebrow}
          title={t.unknown.title}
          description={t.unknown.description}
          actions={catalogLink(t.unknown.primary, 'primary')}
        />
      );
  }
}

interface AcceptButtonProps {
  locale: Locale;
  token: string;
  target: 'catalog' | 'cart';
  label: string;
  variant: 'primary' | 'secondary';
  compact: boolean;
}

/**
 * Daveti kabul eden düğme — `<form action>` ile, istemci bileşeni YOK. Sayfanın tek etkileşimi bu
 * iki düğme; onlar için bir `'use client'` ağacı kurmak, JavaScript'i kapalı ziyaretçide daveti
 * tümden çalışmaz yapardı.
 */
function AcceptButton({ locale, token, target, label, variant, compact }: AcceptButtonProps) {
  const accept = acceptNeighborInviteAction.bind(null, locale, token, target);
  return (
    <form action={accept}>
      <button type="submit" className={buttonClass({ variant, compact })}>
        {label}
      </button>
    </form>
  );
}
