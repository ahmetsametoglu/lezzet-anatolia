'use server';

import { revalidatePath } from 'next/cache';
import { serviceDb } from '@lezzet/database';
import {
  cancelZoneNotices,
  preferencesSubjectOf,
  resolvePreferencesToken,
  setMarketingConsent,
  setNotificationConsent,
  type PreferencesSubject,
} from '@lezzet/application';
import type { MarketingChannel, NotificationKind } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Bildirim tercihlerinin yazma eylemleri (22.08).
 *
 * ── ÖZNE HER EYLEMDE YENİDEN ÇÖZÜLÜR ────────────────────────────────────────
 * İstemci kimlik GÖNDERMEZ, yalnız jetonu geri verir — ve jeton da sunucuda çözülür. Kimliği
 * gövdeden almak, konsoldan gönderilen bir kimlikle başkasının tercihlerini kapatmaya açık kapı
 * bırakırdı (adres kapısının aynı dersi).
 *
 * ── JETON OTURUMUN YERİNE GEÇER, YETKİSİNİ ALMAZ ────────────────────────────
 * Yetkisi dar: yalnız tercihleri okumak ve yazmak. Jetonla gelen biri ad, adres, sipariş göremez —
 * bağ yıllar boyunca bir mailin altbilgisinde durabilir.
 *
 * ── OTURUM ÖNCE, JETON SONRA ────────────────────────────────────────────────
 * Girişli müşteri kendi sayfasındayken jeton hiç taşımaz; jeton yolu mailden gelen içindir.
 */
async function subjectOf(token: string | null): Promise<PreferencesSubject> {
  const db = serviceDb();
  const customerId = await currentCustomerId();
  if (customerId) {
    const subject = await preferencesSubjectOf(db, customerId);
    if (subject) return subject;
  }
  const byToken = token ? await resolvePreferencesToken(db, token) : null;
  if (!byToken) throw new CustomerError('session_expired');
  return byToken;
}

/** Sayfa sunucuda çiziliyor: yazımdan sonra tazelenmezse anahtar eski değerine geri döner. */
function revalidate(): void {
  revalidatePath('/[locale]/account/notifications', 'page');
}

export async function setCampaignConsentAction(
  channel: MarketingChannel,
  granted: boolean,
  token: string | null,
): Promise<CustomerResult<true>> {
  try {
    const subject = await subjectOf(token);
    // Ziyaretçinin kampanya tercihi YOKTUR: kampanya hesaba bağlıdır, kaydı olmayan birinin
    // kapatabileceği bir kanal da yok. Sessizce başarı dönmek, olmayan bir şeyi kapattığını
    // sandırırdı.
    if (subject.kind !== 'profile') throw new CustomerError('session_expired');
    const ok = await setMarketingConsent(serviceDb(), {
      customerId: subject.profile.id,
      channel,
      granted,
      source: token ? 'email-link' : 'account',
    });
    if (!ok) throw new CustomerError('session_expired');
    revalidate();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export async function setKindConsentAction(
  kind: NotificationKind,
  granted: boolean,
  token: string | null,
): Promise<CustomerResult<true>> {
  try {
    const subject = await subjectOf(token);
    if (subject.kind !== 'profile') throw new CustomerError('session_expired');
    const ok = await setNotificationConsent(serviceDb(), {
      customerId: subject.profile.id,
      kind,
      granted,
      source: token ? 'email-link' : 'account',
    });
    if (!ok) throw new CustomerError('session_expired');
    revalidate();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Bekleyen bölge haberlerinden vazgeçme — **hem ziyaretçi hem girişli için**.
 *
 * Burada kapatılan bir izin değil, GERİ ALINAN bir istektir: müşteri "haber ver" demişti; vazgeçmek
 * o kaydı silmektir. Bu yüzden ziyaretçi de yapabilir — zaten kaydı olan tek şey bu.
 */
export async function cancelZoneNoticesAction(token: string | null): Promise<CustomerResult<true>> {
  try {
    const subject = await subjectOf(token);
    const email = subject.kind === 'profile' ? subject.profile.email : subject.email;
    if (!email) throw new CustomerError('session_expired');
    await cancelZoneNotices(serviceDb(), email);
    revalidate();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
