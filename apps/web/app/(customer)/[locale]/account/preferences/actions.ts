'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { serviceDb } from '@lezzet/database';
import {
  cancelZoneNotices,
  preferencesSubjectOf,
  resolvePreferencesToken,
  setNotificationConsent,
  updateCustomerPreferences,
  type PreferencesSubject,
} from '@lezzet/application';
import type { MarketingChannel, NotificationKind } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Özne her eylemde oturumdan, yoksa jetondan sunucuda çözülür; istemciden kimlik alınsaydı başkasının tercihleri kapatılabilirdi.
 * Jeton yalnız tercihlere yetki verir, çünkü bağ yıllarca bir e-postanın altbilgisinde durabilir.
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
  revalidatePath('/[locale]/account/preferences', 'page');
}

export async function setCampaignConsentAction(
  channel: MarketingChannel,
  granted: boolean,
  token: string | null,
): Promise<CustomerResult<true>> {
  try {
    const subject = await subjectOf(token);
    // Ziyaretçinin kampanya tercihi yoktur, çünkü kampanya hesaba bağlıdır; sessiz başarı olmayan bir şeyi kapattığını sandırırdı.
    if (subject.kind !== 'profile') throw new CustomerError('session_expired');
    const sonuc = await updateCustomerPreferences(serviceDb(), {
      profileId: subject.profile.id,
      source: token ? 'email-link' : 'account',
      marketingConsent: { [channel]: granted },
      runLater: after,
    });
    if (sonuc.status !== 'ok') throw new CustomerError('session_expired');
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

/** Bekleyen bölge haberlerinden vazgeçme; kapatılan bir izin değil geri alınan bir istek olduğu için ziyaretçi de yapabilir. */
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
