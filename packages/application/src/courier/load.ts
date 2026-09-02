import { DeliveryRunService, DeliveryZoneService, OrderBoxService, OrderService } from '@lezzet/database';
import type { Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 * Geçişin tek sahibi artık `startCourierDay`: kutuları tam olan durağı o yola çıkarır, olmayanı
 * `awaitingBoxes`ta gösterir.
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
       * DEĞİL** (31.08): durumu değiştiren tek kapı sefer başlatmadır.
       */
      allBoxesLoaded: boolean;
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
  input: { code: string; courierId: string },
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

  return {
    status: 'ok',
    orderId: order.id,
    referenceNo: order.referenceNo,
    boxNo: box.boxNo,
    loadedBoxes,
    boxCount: siblings.length,
    allBoxesLoaded: loadedBoxes >= siblings.length,
  };
}
