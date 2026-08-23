import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { serviceDb } from '@lezzet/database';
import { preferencesSubjectOf, readNotificationPreferences, resolvePreferencesToken } from '@lezzet/application';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { NotificationsClient } from './notifications-client';
import type { Messages } from './notifications-types';
import messages from './messages.json';

/**
 * BİLDİRİM TERCİHLERİ (22.08) — **on mail şablonunun altbilgisindeki bağın hedefi.**
 *
 * ── NEDEN AÇILDI ────────────────────────────────────────────────────────────
 * Yol `PATHNAMES`te tanımlıydı, `robots.txt`'te dışlanmıştı ve altı kod yolu onu giden postaya
 * yazıyordu — ama SAYFASI hiç yazılmamıştı. Ölçüldü (22.08): üç dilde de **404**. Yani müşteriye
 * gönderdiğimiz her mailin "tercihlerinizi yönetin" satırı ölü bir bağdı; ticari e-postada o satır
 * hem nezaket hem yasal gerekliliktir.
 *
 * ── JETON: GİRİŞ ZORUNLU DEĞİL (kullanıcı kararı 22.08) ─────────────────────
 * Bağ `?t=` ile gelir. Sebebi ölçülmüş bir hâl: `zone_available` maili `zone_notice.email`e
 * gidiyor ve o kaydın `customer_id`si ÇOĞU ZAMAN YOK (ziyaretçi bıraktı). Sayfa oturum isteseydi,
 * "haber ver" diyen ziyaretçi hesabı olmayan bir giriş ekranında kalırdı — vazgeçmenin önüne
 * konmuş ikinci bir engel. GDPR'ın ölçütü de bu: izni geri almak, vermek kadar kolay olmalı.
 *
 * **Oturum jetonu EZER:** girişli müşteri kendi hesabına bakar, mailde hangi jeton olursa olsun.
 * Aksi hâlde paylaşılmış bir bağ, giriş yapmış başka birinin ekranında başkasının tercihlerini
 * açardı.
 *
 * ── ÜÇ HÂL ──────────────────────────────────────────────────────────────────
 * (1) girişli → tam sayfa · (2) jetonlu ziyaretçi → yalnız bölge haberi satırı · (3) ne oturum ne
 * geçerli jeton → **girişe yönlendirilmez, "bağlantı geçerli değil" denir**. Yönlendirme, mailden
 * gelen kişiye kendi tercihini değiştirmeye çalışırken bir giriş duvarı göstermek olurdu ve
 * geçersiz jetonun sebebini de söylemezdi.
 *
 * ── TASARIM ─────────────────────────────────────────────────────────────────
 * Bu sayfanın çizimi YOK: `design/pages/musteri-hesap.md` izinleri hesap sayfasının içinde
 * tanımlıyor, ayrı bir tercih sayfası hiç çizilmedi — URL mail altbilgisinden doğdu. Yerleşim
 * hesap kartlarının kendi diliyle kuruldu (aynı `Card` · `ConsentSwitch` ölçüleri), improvise
 * edilen bir görsel karar yok. `BEKLEYEN(08.5)`
 */
interface NotificationsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function NotificationsPage({ params, searchParams }: NotificationsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/account/notifications');

  const t: Messages = messages[locale];
  const [device, customerId, query] = await Promise.all([detectDevice(), currentCustomerId(), searchParams]);
  const token = query.t?.trim() || null;

  const db = serviceDb();
  // Oturum ÖNCE: girişli müşteri kendi kaydını görür, adresteki jeton ne olursa olsun.
  const subject = customerId
    ? await preferencesSubjectOf(db, customerId)
    : token
      ? await resolvePreferencesToken(db, token)
      : null;

  // Ne oturum ne jeton → ziyaretçi hiç bağ taşımadan gelmiştir; orası giriş sayfasının işi.
  if (!subject && !token) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const view = subject ? await readNotificationPreferences(db, subject) : null;

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{ back: { label: t.back, href: '/account' }, title: t.title }}
    >
      <NotificationsClient t={t} locale={locale} view={view} token={token} />
    </SiteFrame>
  );
}
