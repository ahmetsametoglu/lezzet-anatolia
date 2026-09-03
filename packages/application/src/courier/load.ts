import { DeliveryRunService, DeliveryZoneService, OrderBoxService, OrderService } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyStatusEffect, type OrderEffects } from '../order/effects';

/**
 * **ARACA YÜKLEME OKUTMASI** (23.8 · karar §1.11) — kurye kutunun QR'ını okutur; kutu rotasına
 * aitse `loaded_at/by` damgalanır, değilse GÖRÜNÜR reddedilir.
 *
 * Kararın iki yarısı: rota onayı NİYET doğrulamasıdır (yorgun bir sabahta gözü kapalı basılır),
 * garanti KUTU kontrolüdür — yanlış kutu araca hiç binmez. Sayaç ("5/8 bindi") damgalardan türer,
 * ayrı tablo yok.
 *
 * ── YÜKLEME "YOLDA" DEMEK DEĞİLDİR (kullanıcı kararı 31.08) ─────────────────
 * Bu kapı 30.08'e kadar son kutuda `ready → out_for_delivery` de yazıyordu; yükleme ile sefer
 * başlatma tek ele bağlıydı. Kullanıcı modeli ayırdı: **araç bir ara depodur** ve içinde birden
 * çok seferin — bugünün de yarının da — kutuları durabilir. Yükleme malın depodan araca geçmesi,
 * yani bir EMANET değişimidir; müşteri bundan haberdar olmaz. Siparişi "yolda" yapan ve müşteriye
 * haber gönderen şey seferin BAŞLATILMASIDIR (`startCourierDay`).
 *
 * Kaynaşmanın somut bedeli ölçüldü: yarının seferinin kutusunu bugün okutmak, o siparişleri bugün
 * yola çıkarırdı. Ayrıca `startCourierDay`ın `started` listesi ULAŞILAMAZ hâle gelmişti — kutu
 * yüklenen sipariş buradan çoktan çıkmış oluyordu, sefer başlatmaya iş kalmıyordu.
 *
 * Geçişin sahibi `startCourierDay`: kutuları tam olan durağı o yola çıkarır, olmayanı
 * `awaitingBoxes`ta gösterir.
 *
 * ── TEK İSTİSNA: SEFER ZATEN YOLDAYSA SON KUTU DURAĞI AÇAR (kullanıcı kararı 03.09) ─────────
 * Eksik kutuyla başlatılan seferde kurye eksik kutuyu sonradan okutuyordu ve durak `ready`de
 * kalıyordu: gün ekranında sürülen seferin düğmesi "kapat", araçtaki seferlerde "duraklara git",
 * yeniden başlatmaya giden yol yok — teslimat ekranı kapıyı açıyor, sunucu `stale` diyordu.
 * Denetim 03.09, bulgu 3. Yukarıdaki gerekçe ("yarının kutusu bugün yola çıkmasın") burada
 * geçerli değil: sefer çoktan yolda, müşterilere haber gitti; bu durağın haberi de tam şimdi,
 * bir kez gider. Kararı yine motor verir (`canTransition`), geçiş koşullu yazılır (`stale` yutulur:
 * araya başka bir yazım girdiyse durum zaten değişmiştir).
 *
 * ── ROTA KONTROLÜNÜN KAYNAĞI SİPARİŞİN DAMGASIDIR ───────────────────────────
 * `start_delivery_run` seferi açarken siparişlere `courier_id` yazar ("siparişin kuryesi seferin
 * kuryesinden gelir" — 0046). Kutu → sipariş → kurye zinciri bu damgayı okur; ayrı bir rota
 * hesabı yapılmaz — yapılsaydı iki kaynak bir gün ayrışırdı.
 */

export type LoadBoxOutcome =
  | {
      status: 'ok';
      orderId: string;
      referenceNo: string | null;
      boxNo: number;
      loadedBoxes: number;
      boxCount: number;
      /**
       * Bu okutma siparişin SON kutusuydu — siparişin tamamı artık araçta. **Yola çıktı demek
       * DEĞİL** (31.08): durumu değiştiren kapı sefer başlatmadır — tek istisna aşağıda.
       */
      allBoxesLoaded: boolean;
      /** Sefer zaten yoldaydı ve bu son kutu durağı AÇTI (`out_for_delivery`, haber gitti) — 03.09. */
      stopOpened: boolean;
    }
  | { status: 'already_loaded'; orderId: string; boxNo: number; loadedBoxes: number; boxCount: number }
  | {
      status: 'wrong_route';
      referenceNo: string | null;
      /**
       * **Kutunun AİT OLDUĞU rota** (kullanıcı kararı 01.09) — "hangi sefer" değil "hangi rota":
       * `SF-26-…` bir kayıt numarası, "Kuzey Hattı — Frankfurt" kuryenin kafasındaki şey.
       * `null` = sipariş hiçbir sefere damgalı değil (henüz kurulmamış ya da başkasınınki de değil).
       */
      routeName: string | null;
      /** Seferin künyesi — rampada kâğıtla eşleştirmek için; rota adının yanında ikincil. */
      runReferenceNo: string | null;
    }
  | { status: 'not_sealed'; boxNo: number }
  | { status: 'not_loadable'; currentStatus: Order['status'] }
  | { status: 'unknown_code' };

export async function loadBox(
  db: SupabaseClient,
  input: { code: string; courierId: string; effects?: OrderEffects },
): Promise<LoadBoxOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getByCode(input.code.trim());
  if (!box) return { status: 'unknown_code' };

  const order = await new OrderService(db).getById(box.orderId);
  // Kutusu olan sipariş silinemez (cascade kutuyu da götürür) — bu dal saf savunma.
  if (!order) return { status: 'unknown_code' };

  /*
    Sipariş bu kuryenin seferine damgalı değil → kutu bu rotanın malı değil.

    ── RET, KUTUNUN NEREYE AİT OLDUĞUNU DA SÖYLER (kullanıcı kararı 01.09) ────
    Eskiden yalnız siparişin referansı dönüyordu ve kurye "peki bu kutu kimin" sorusuyla kalıyordu.
    Tasarımın kendi kırmızı kartı bunu zaten yazıyor (v3:18): *"KT-26-8891 · SF-26-TTLM40'a ait, o
    sefer bu araçta yok."* Rota adı SEFERDEN çözülüyor; sipariş hiçbir sefere damgalı değilse ikisi
    de `null` kalır — bilinmeyen bir şeyi uydurmaktansa söylememek doğru (CLAUDE §1).

    Okuma İKİ EK TURA mal oluyor ve yalnız bu dalda: reddedilen okutma nadir bir hâl, mutlu yol
    (yükleme) hiçbir şey ödemiyor.
  */
  if (order.courierId !== input.courierId) {
    const run = order.deliveryRunId === null ? null : await new DeliveryRunService(db).getById(order.deliveryRunId);
    const zone = run === null ? null : await new DeliveryZoneService(db).getById(run.deliveryZoneId);
    return {
      status: 'wrong_route',
      referenceNo: order.referenceNo,
      routeName: zone?.name ?? null,
      runReferenceNo: run?.referenceNo ?? null,
    };
  }

  // Açık kutu araca binemez (0048 kısıtı `check` olarak da duruyor; burası okunur cümle).
  if (box.sealedAt === null) return { status: 'not_sealed', boxNo: box.boxNo };

  const siblings = await boxes.listByOrder(box.orderId);
  const loadedOthers = siblings.filter((row) => row.id !== box.id && row.loadedAt !== null).length;

  // İkinci okutma hata değil "zaten araçta" — sayaç değişmez, kurye sayımına güvenmeye devam eder.
  if (box.loadedAt !== null) {
    return {
      status: 'already_loaded',
      orderId: order.id,
      boxNo: box.boxNo,
      loadedBoxes: loadedOthers + 1,
      boxCount: siblings.length,
    };
  }

  // Teslim edilmiş/iptal edilmiş siparişin kutusu yüklenmez — durum cevabın kendisi.
  if (order.status !== 'ready' && order.status !== 'out_for_delivery') {
    return { status: 'not_loadable', currentStatus: order.status };
  }

  await boxes.update({ id: box.id, loadedAt: new Date().toISOString(), loadedBy: input.courierId });
  const loadedBoxes = loadedOthers + 1;
  const allBoxesLoaded = loadedBoxes >= siblings.length;

  return {
    status: 'ok',
    orderId: order.id,
    referenceNo: order.referenceNo,
    boxNo: box.boxNo,
    loadedBoxes,
    boxCount: siblings.length,
    allBoxesLoaded,
    stopOpened: allBoxesLoaded ? await openStopIfRunDeparted(db, order, input) : false,
  };
}

/**
 * Son kutu okutuldu; sefer ZATEN YOLDAYSA durağı aç (künyedeki tek istisna, 03.09).
 *
 * Üç koşul: sipariş hâlâ `ready` (yola çıkmamış), bir sefere damgalı, o sefer yola çıkmış. Sefer
 * kurulmuş ama başlamamışsa `false` — yarının kutusu bugün yola çıkmaz (31.08). Geçiş koşullu:
 * `stale` (araya başka yazım girdi) sessizce `false`dur, çünkü durum zaten bu kapının kararı olmaktan
 * çıkmıştır; ekran bir sonraki okumada gerçeği görür.
 */
async function openStopIfRunDeparted(
  db: SupabaseClient,
  order: Order,
  input: { courierId: string; effects?: OrderEffects },
): Promise<boolean> {
  if (order.status !== 'ready' || order.deliveryRunId === null) return false;
  const run = await new DeliveryRunService(db).getById(order.deliveryRunId);
  if (run === null || run.departedAt === null) return false;
  if (!canTransition('ready', 'out_for_delivery').allowed) return false;

  const transitioned = await new OrderService(db).transition({
    orderId: order.id,
    from: 'ready',
    to: 'out_for_delivery',
    actorId: input.courierId,
  });
  if (!transitioned.ok) return false;
  // Haber TAM ŞİMDİ ve bir kez: durak yola çıktı. Tekrar kilidi `notifyOrderStatus`ta (geçiş başına tek).
  await notifyStatusEffect(input.effects, order.id, 'out_for_delivery');
  return true;
}
