import { DeliveryZoneService, UserProfileService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import { isInRoute } from '@lezzet/domain-core';
import { localizedUrl } from '@lezzet/i18n';
import { defaultNotifier } from '@lezzet/notify';
import { logger } from '@lezzet/observability';
import { maskEmail } from '@lezzet/observability/mask';
import type { Country, PreferredLanguage, ZoneNotice } from '@lezzet/types';

export const ZONE_AVAILABLE = 'zone_available';

/**
 * **Beklenen bölge açıldı → bekleyenlere haber** (14.10 · 19.21).
 *
 * ── OLAY DEĞİL, UZLAŞTIRMA İŞİ — VE BU İSTENENDEN GÜÇLÜ ─────────────────────
 * Operasyon şeridi *"bir OLAY olmalı, bir düğme değil"* dedi ve gerekçesi doğruydu: bölgeyi açan
 * kişi unutabilir, sistemin bildiği bir şeyi insana hatırlatmaya bırakmak olurdu. Bir adım daha
 * gidiyoruz, çünkü **olay da kaçırılabilir:** bölgenin kaydedilmesine bağlı bir tetik TEK bir yazma
 * yolunu varsayar; oysa bir kod bölgeye migration'la, elle SQL'le, toplu içe aktarmayla ya da bugün
 * olmayan ikinci bir ekrandan da girebilir. Kaçan gönderim **hata vermez**, yalnız müşteri hiç haber
 * almaz.
 *
 * Bunun yerine her koşuda "kapsanmış hâle gelmiş ve haberi gitmemiş" bekleyişler aranır. Üstünlüğü:
 * **hangi yolla kapsandığı önemsiz.** Sistem kendini onarır — kaçan bir tur telafi olur, ikinci tur
 * no-op'tur.
 *
 * ── İKİ KORUMA, İKİSİ DE ZATEN ŞEMADA ───────────────────────────────────────
 * **İdempotentlik:** sorgunun kendisi `notified_at is null`; ikinci tur aynı kişiyi hiç görmez.
 * Bölge iki kez kaydedilse ya da bir kod çıkıp geri girse de değişmez.
 * **İşaret:** aynı damga "kime gitti"nin cevabı. Toplu yazılıyor — bir bölge açılınca onlarca
 * kişiye birden gider, satır satır damgalamak turu kişi sayısıyla çarpardı.
 *
 * ── DAMGA GÖNDERİMDEN SONRA ─────────────────────────────────────────────────
 * Tersi (önce damgala, sonra gönder) sağlayıcı düşerse müşteriyi **kalıcı sessizliğe** mahkûm
 * ederdi: satır "haber verildi" görünür, bir daha hiçbir tur onu bulmaz. Emsal aynı kararla
 * yazılmış: `ProductFeedback.notified_at` künyesi.
 *
 * ── KANAL ───────────────────────────────────────────────────────────────────
 * Bugün yalnız e-posta gidiyor; `zone_notice` telefon tutmuyor ve WhatsApp `15.x` inmeden
 * gönderilemez. Bildirim altyapısı kanal yeteneğine kendi bakıyor (`supports`), yani WhatsApp
 * açıldığında bu iş değişmeden ikinci kanal devreye girer.
 */

/** Tur başına tavan — bir bölge açılınca yüzlerce satır birikmiş olabilir; kuyruk turlara yayılır. */
const BATCH = 200;

/**
 * Ülke bilgisi kayıtta YOK (`zone_notice` yalnız kodu tutuyor) — kapsama kontrolü ülke ister.
 * İki ülke de denenir, biri tutarsa kapsanmış sayılır. `readZoneDemand` ile aynı çözüm; kaydedilmemiş
 * bir bilgiyi kaydediyormuş gibi yapmıyoruz.
 */
const COUNTRIES: readonly Country[] = ['FR', 'DE'];

/**
 * Haberin dili. Sıra: kaydın kendi dili → müşterinin profili → **Fransızca**.
 *
 * Son basamak bir TAHMİNDİR ve yalnız ikisi de boşken devreye girer (dil kolonu 14.10'da eklendi,
 * ondan önceki ziyaretçi kayıtlarında `null`). Fransızca seçilmesinin sebebi pazarın kendisi:
 * teslimat bölgesi Fransa.
 */
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
  const covered = pending.filter((n) => COUNTRIES.some((country) => isInRoute({ country, postalCode: n.postalCode }, zones)));
  if (covered.length === 0) return { checked: pending.length, sent: 0, failed: 0 };

  // Kimlikli kayıtların profilleri TEK turda — satır başına sorgu N+1 olurdu.
  const customerIds = [...new Set(covered.map((n) => n.customerId).filter((id): id is string => Boolean(id)))];
  const profiles = customerIds.length > 0 ? await new UserProfileService(db).listByIds(customerIds) : [];
  const profileOf = new Map(profiles.map((p) => [p.id, p]));

  const notifier = defaultNotifier();
  const sent: string[] = [];
  let failed = 0;

  for (const notice of covered) {
    const profile = notice.customerId ? profileOf.get(notice.customerId) : undefined;
    const locale = localeOf(notice, profile?.preferredLanguage ?? null);

    let delivered = false;
    try {
      const results = await notifier.send(
        'zone_available',
        // Telefon YOK: `zone_notice` numara tutmuyor. Sürücü yeteneğe bakıyor, yani WhatsApp
        // sürücüsü bu alıcıyı kendiliğinden atlar — burada kanal seçimi yapılmıyor.
        { name: profile?.name ?? null, email: notice.email, phone: null, locale },
        {
          customerName: profile?.name ?? null,
          locale,
          postalCode: notice.postalCode,
          catalogUrl: localizedUrl('/catalog', locale),
          notificationPreferencesUrl: localizedUrl('/account/notifications', locale),
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
