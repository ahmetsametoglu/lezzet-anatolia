import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readInviteWelcome, type InviteWelcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import { buttonClass } from '@/components/customer/ui/button';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { recordPageView } from '@/lib/analytics/page-view';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { acceptInviteAction } from './actions';
import type { Messages } from './invite-types';
import messages from './messages.json';

/**
 * Davet karşılaması (17.9) — **paylaşılan davet bağlantısının indiği yer**.
 *
 * Bu sayfa 17.7'nin kapalı kalan halkasıydı: kod üretiliyordu, bağ kurma kapısı yazılıydı, ödül
 * motoru çalışıyordu — ama kodu bir ADRESE çeviren ve o adresi karşılayan hiçbir şey yoktu. Yani
 * müşteri kimseyi davet edemiyordu; davet zinciri ilk adımında kopuktu.
 *
 * ── DÖRT HÂL, DÖRDÜ DE BURADA ÇİZİLİYOR ─────────────────────────────────────
 * Beşinci hâl (`already_referred`) kayıt anına ait ve ekranı yok — ziyaretçi henüz kimse değilken
 * "senin zaten bir getirenin var" denemez (`readInviteWelcome` künyesi).
 *
 * **Geçersiz kod 404 DEĞİL** ve bu `/feedback/[token]`ın tersi bir karar, bilerek: orada belirteç
 * oturumun yerine geçiyor ve var olmayan bir kaydı doğrulamamak gerekiyordu. Burada ise bağlantıyı
 * açan kişi ZİYARETÇİ — WhatsApp'ta kırpılmış bir bağlantıya tıklamış olabilir ve ona 404 vermek,
 * kapıdaki müşteriyi geri çevirmektir. Kod tanınmasa da sayfa açılır, davet çizilmez.
 *
 * **Davet edenin yalnız ADI görünür** (ilk sözcük): bağlantı tanımadığımız kanallarda dolaşıyor ve
 * onu açan herkes bu sayfayı görüyor. Soyadı, e-posta, sipariş geçmişi hiçbiri geçmez.
 *
 * **Çerez sayfa açılınca değil, DOKUNULUNCA yazılır** (`actions.ts` künyesi): bağlantıyı açmak bir
 * niyet değil, düğmeye basmak öyle.
 */
interface InvitePageProps {
  params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  // `alternates` YOK ve `robots` kapalı: sayfa aramada olmamalı (kod başkasının künyesi), o yüzden
  // dil karşılıklarını arama motoruna bildirmenin de anlamı yok — bildirilecek bir dizin yok.
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: false } };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/invite/[code]');

  const t: Messages = messages[locale];
  const [device, viewerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  const welcome = await readInviteWelcome(serviceDb(), code, viewerId);

  return (
    <SiteFrame device={device} locale={locale as Locale}>
      <InviteFace device={device} locale={locale} code={code} welcome={welcome} t={t} />
    </SiteFrame>
  );
}

interface InviteFaceProps {
  device: 'mobile' | 'desktop';
  locale: Locale | string;
  code: string;
  welcome: InviteWelcome;
  t: Messages;
}

/**
 * Hâlin yüzü. Dördü de aynı bloğu (`MessageScreen`) kullanıyor ve bu tasarımın kararı, kısaltma
 * değil: sayfanın kendisi bir DURUM ekranıdır — 404 ve 500'ün kardeşi. Her hâle ayrı bir düzen
 * çizmek, aynı sayfanın dört farklı görünmesi olurdu.
 */
function InviteFace({ device, locale, code, welcome, t }: InviteFaceProps) {
  const catalogLink = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/catalog" locale={locale as Locale} className={buttonClass({ variant, compact: device === 'mobile' })}>
      {label}
    </Link>
  );
  const accountLink = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/account" locale={locale as Locale} className={buttonClass({ variant, compact: device === 'mobile' })}>
      {label}
    </Link>
  );

  switch (welcome.status) {
    case 'ok':
      return (
        <MessageScreen
          device={device}
          emoji="🎁"
          eyebrow={t.ok.eyebrow}
          // Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): o hâlde davet
          // İSİMSİZ ama düzgün bir cümleyle çizilir ("Bir tanıdığınız sizi… davet etti"). Boş yer
          // tutucu bırakmak cümleyi bozuk okuturdu.
          title={t.ok.title.replace('{name}', welcome.referrerName || t.ok.someone)}
          description={t.ok.description}
          actions={
            <>
              <AcceptButton locale={locale} code={code} target="catalog" label={t.ok.primary} variant="primary" device={device} />
              <AcceptButton locale={locale} code={code} target="login" label={t.ok.secondary} variant="secondary" device={device} />
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
          actions={accountLink(t.self.primary, 'primary')}
        />
      );
    case 'already_customer':
      return (
        <MessageScreen
          device={device}
          emoji="👋"
          eyebrow={t.alreadyCustomer.eyebrow}
          title={t.alreadyCustomer.title}
          description={t.alreadyCustomer.description}
          actions={
            <>
              {catalogLink(t.alreadyCustomer.primary, 'primary')}
              {accountLink(t.alreadyCustomer.secondary, 'secondary')}
            </>
          }
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
  locale: Locale | string;
  code: string;
  target: 'catalog' | 'login';
  label: string;
  variant: 'primary' | 'secondary';
  device: 'mobile' | 'desktop';
}

/**
 * Daveti kabul eden düğme — `<form action>` ile, istemci bileşeni YOK.
 *
 * Sayfanın tamamı sunucuda çiziliyor ve tek etkileşimi bu iki düğme; onlar için bir `'use client'`
 * ağacı kurmak, JavaScript'i kapalı ziyaretçide daveti tümden çalışmaz yapardı. Form gönderimi
 * çerezi yazar ve yönlendirir — sunucunun kendi işi.
 */
function AcceptButton({ locale, code, target, label, variant, device }: AcceptButtonProps) {
  const accept = acceptInviteAction.bind(null, String(locale), code, target);
  return (
    <form action={accept}>
      <button type="submit" className={buttonClass({ variant, compact: device === 'mobile' })}>
        {label}
      </button>
    </form>
  );
}
