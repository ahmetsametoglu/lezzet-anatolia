import 'server-only';
import { AnalyticsSessionService, UserProfileService, serviceDb } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { currentSessionKey } from './session-key';

/**
 * **EDİNİM KAYNAĞI ATFI** (13.2) — 07 ile 13 arasındaki eksik halka.
 *
 * ── DURUM (04.08) ───────────────────────────────────────────────────────────
 * `acquisition_source`'un YAZMA kapısı aylardır duruyordu (`checkout-session.ts`: "yalnız boşsa
 * yaz") ve alan her müşteride boştu, çünkü onu BESLEYEN taraf yoktu. Ekranın kendisi bunu doğru
 * anlatıyordu ("henüz ölçülmüyor"). Bu dosya besleyicidir.
 *
 * ── EŞLEŞME NEDEN BÖYLE, NEDEN SİPARİŞE ANAHTAR YAZMIYORUZ ──────────────────
 * Oturum anahtarını siparişe yazmak en kolay yol olurdu ve TAM OLARAK bu yüzden yasak
 * (`ANALYTICS §2`): tek bir `join` anonim defterin tamamını geriye dönük kimliklendirirdi. Bunun
 * yerine eşleşme **sipariş anında TÜKETİLİR**: oturumun künyesi okunur, müşteriye kopyalanır,
 * anahtar hiçbir yere yazılmaz. Kalan bağ kampanya adıdır, kişiye çözülemez.
 *
 * ── BEDELİ DÜRÜSTÇE ─────────────────────────────────────────────────────────
 * Tuz gün dönümünde değişir; kampanyaya gece 23:50'de tıklayıp 00:10'da sipariş veren müşterinin
 * künyesi bulunamaz ve kaynağı boş kalır. **Boş kalması yanlış yazmaktan iyidir** — "kaynağı
 * ölçülmemiş ciro" kendi kovasında görünür, uydurulmuş bir kampanya adı ise raporu sessizce
 * bozardı.
 */

/**
 * Oturumun kampanya künyesini müşterinin edinim kaynağına KOPYALAR — yalnız alan boşsa.
 *
 * **"Yalnız boşsa" kuralı burada da geçerli** (`DOMAIN §11`): müşteriyi bize ilk getiren kaynak
 * sonraki kampanyalarla ezilmemelidir. İkinci kez gelen müşteri bir remarketing reklamına tıklamış
 * olabilir; onu "kazandıran" o reklam değildir.
 *
 * **Fırlatmaz.** Atıf bir ölçümdür ve ölçüm akışı kesmez (`ANALYTICS §4`): kampanya künyesi
 * yazılamadı diye müşterinin siparişi düşmemeli. Hata yutulur ama sessiz değil.
 */
export async function rememberAcquisition(customerId: string): Promise<void> {
  try {
    const sessionKey = await currentSessionKey();
    if (!sessionKey) return;

    const db = serviceDb();
    const profiles = new UserProfileService(db);
    const customer = await profiles.getById(customerId);
    // Alan doluysa oturum künyesine hiç bakılmaz — okumayı da boşa yapmayalım.
    if (!customer || customer.acquisitionSource) return;

    const session = await new AnalyticsSessionService(db).bySessionKey(sessionKey);
    if (!session) return;

    // Kaydedilen şey KAPALI SÖZLÜK + yönlendiren alan adı. `source` iki yerden gelebilir: UTM
    // etiketi (reklam) ya da yönlendiren site (organik). UTM önce gelir — reklamla gelen ziyaretçi
    // teknik olarak da bir siteden yönlendirilmiştir ve o ikinci bilgi kampanyayı gölgelerdi.
    const kunye = { ...(session.utm ?? {}), source: session.utm?.source ?? session.source ?? null };
    if (!kunye.source && !kunye.campaign) return;

    await profiles.update({ id: customerId, acquisitionSource: kunye });
  } catch (err) {
    // `captureError` DEĞİL `logger.warn`: bu bir ölçüm eksiği, bir sistem arızası değil — hata
    // defterine yazsaydık gerçek arızaların arasında kaybolurdu (kapının kendi gerekçesiyle aynı).
    logger.warn({ job: 'analytics_attribution', customerId, reason: (err as Error).message }, 'edinim kaynağı yazılamadı');
  }
}
