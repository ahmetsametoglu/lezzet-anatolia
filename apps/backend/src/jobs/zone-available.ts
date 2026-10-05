import { dispatchCustomerNotification, notificationPreferencesUrl } from '@lezzet/application';
import { DeliveryZoneService, UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import { isInRoute } from '@lezzet/domain-core';
import { localizedUrl } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import { maskEmail } from '@lezzet/observability/mask';
import type { PreferredLanguage, ZoneNotice } from '@lezzet/types';

export const ZONE_AVAILABLE = 'zone_available';

/**
 * Beklenen bölge açıldı, bekleyenlere haber: olay değil uzlaştırma işidir, çünkü kod bölgeye hangi yoldan girerse girsin her koşu
 * "kapsanmış ve haberi gitmemiş" bekleyişleri arar ve kaçan tur sonrakinde telafi olur. Damga gönderimden sonra yazılır, çünkü
 * önce damgalamak sağlayıcı düşünce müşteriyi kalıcı sessizliğe bırakırdı.
 */

/** Tur başına tavan — bir bölge açılınca yüzlerce satır birikmiş olabilir; kuyruk turlara yayılır. */
const BATCH = 200;

/** Haberin dili: kaydın dili, sonra müşterinin profili, ikisi de boşsa Fransızca, çünkü teslimat bölgesi Fransa'dadır. */
function localeOf(notice: ZoneNotice, profileLocale: PreferredLanguage | null): PreferredLanguage {
  return notice.locale ?? profileLocale ?? 'fr';
}

export async function zoneAvailableJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const notices = new ZoneNoticeService(db);

  const pending = await notices.listPending(BATCH);
  if (pending.length === 0) return { checked: 0, sent: 0, failed: 0 };

  // Bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme → tek turda (`CLAUDE §1`).
  const zones = await new DeliveryZoneService(db).listWithCodes({ activeOnly: true });

  // **Kapsama kararını MOTOR veriyor** (`isInRoute`). Kendi karşılaştırmamızı yazsaydık üçüncü bir
  // kopya olurdu (okuma kapısı + ekran + burası) ve kopyalar bir gün ayrışır: biri haber gönderir,
  // öteki tabloda "kapsanmıyor" yazar.
  const covered = pending.filter((n) => isInRoute({ country: n.country, postalCode: n.postalCode }, zones));
  if (covered.length === 0) return { checked: pending.length, sent: 0, failed: 0 };

  // Kimlikli kayıtların profilleri TEK turda — satır başına sorgu N+1 olurdu.
  const customerIds = [...new Set(covered.map((n) => n.customerId).filter((id): id is string => Boolean(id)))];
  const profiles = customerIds.length > 0 ? await new UserProfileService(db).listByIds(customerIds) : [];
  const profileOf = new Map(profiles.map((p) => [p.id, p]));

  const sent: string[] = [];
  let failed = 0;

  for (const notice of covered) {
    const profile = notice.customerId ? profileOf.get(notice.customerId) : undefined;
    const locale = localeOf(notice, profile?.preferredLanguage ?? null);

    let delivered = false;
    try {
      // Profilsiz alıcıya uygulama içi satır yazılmaz, yalnız mail gider; dedupe anahtarı kaydın kendisidir, aynı bölge kaydına
      // ikinci satır açılmaz.
      const results = await dispatchCustomerNotification(
        db,
        {
          event: 'zone_available',
          customerId: notice.customerId ?? null,
          // Telefon YOK: `zone_notice` numara tutmuyor. Sürücü yeteneğe bakıyor, yani WhatsApp
          // sürücüsü bu alıcıyı kendiliğinden atlar — burada kanal seçimi yapılmıyor.
          recipient: { name: profile?.name ?? null, email: notice.email, phone: null, locale },
          target: { type: 'zone_notice', id: notice.id },
          dedupeKey: `zone:${notice.id}`,
          payload: { postalCode: notice.postalCode },
          data: {
          customerName: profile?.name ?? null,
          locale,
          postalCode: notice.postalCode,
          catalogUrl: localizedUrl('/catalog', locale),
          /* Bu yolun alıcısı çoğu zaman hesapsızdır: profili varsa profilin jetonu, yoksa kaydın kendi jetonu kullanılır, ikisi de
             yoksa çıplak adrese düşülür. */
          notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, {
            customerId: notice.customerId,
            zoneNoticeToken: notice.token,
          }),
          },
        },
      );
      delivered = results.some((r) => r.status === 'sent');
    } catch (err) {
      // Kimlik değil, MASKELİ adres: bu yolda `customerId` çoğu zaman yok (ziyaretçi kaydı), yani
      // "hangi kayıt" sorusunun tek cevabı adresin kendisi (`CLAUDE §1` maskeleme istisnası).
      logger.warn(
        { job: ZONE_AVAILABLE, noticeId: notice.id, email: maskEmail(notice.email), reason: (err as Error).message },
        'bölge haberi gönderilemedi',
      );
    }

    // **Damga yalnız GERÇEKTEN gidince.** `skipped` bir hata değil (sağlayıcı anahtarı yok) ama
    // "gitti" de değil: damgalanmazsa satır sıradaki turda yeniden denenir. Yerelde anahtarsız
    // çalışırken kuyruk birikir ve bu doğru davranıştır — gönderilmemiş bir haber, gönderilmiş
    // sayılmamalı.
    if (delivered) sent.push(notice.id);
    else failed += 1;
  }

  // Damga GÖNDERİMDEN SONRA ve TOPLU.
  if (sent.length > 0) await notices.markNotified(sent, new Date().toISOString());

  logger.info({ job: ZONE_AVAILABLE, checked: pending.length, covered: covered.length, sent: sent.length, failed }, 'bölge haberi turu');
  return { checked: pending.length, covered: covered.length, sent: sent.length, failed };
}
