import { markUndelivered, startCourierDay } from '@lezzet/application';
import { DeliveryRunCollectionService, DeliveryRunService } from '@lezzet/database';
import { deliveryRunReferenceNo } from '@lezzet/domain-core';
import { fromCents } from '@lezzet/helper';
import { tabloDolu, type Db, type Kisiler } from './shared';

// ── SEFER + sefer kapanışı (0046 · 11.7 · 18.08) ─────────────────────────────────────────────────
// Kapanış bir MUTABAKAT kaydıdır, para hareketi değil: para kapıda tahsil edilirken zaten yazıldı
// (12.2). Eksen 18.08'de kurye×gün'den SEFERE indi ("fark hangi seferde doğdu" cevaplanabilmeli).
//
// SEFERLER HAM INSERT'LE KURULUR ve bu bilinçli: `start_delivery_run` RPC'si sabahın gerçeğini
// yaşar (departed_at = now, claim yalnız açık durumlar) — seed ise günü SONDAN kurar: teslim
// edilmiş siparişler çoktan var ve geçmiş çıkış/dönüş damgaları gerekir. Tarihi geriye kurmanın
// serviste karşılığı yok ve olmamalı (cart.updated_at emsali) — o yalnız seed'in derdi.
//
// Beklenen tutar UYDURULMAZ: `delivery_run_collection` görünümünden gelir ve kapanış RPC'si onu
// kendisi okur. Seed'in tek söylediği "kurye ne saydı"dır — mutabakatın anlamı da zaten budur.
//
// Dört hâl kurulur, çünkü ekranlar dördünü ayrı gösterir:
//   · MUTABIK sefer          → sayılan = beklenen; yeşil satır
//   · FARKLI sefer (geçmiş)  → nakit EKSİK çıkmış + kuryenin açıklaması; fark gizlenmez, AÇIKLANIR
//   · FARKLI sefer (BUGÜN)   → nakit FAZLA çıkmış; gün sonu mutabakatı yalnız BUGÜNÜN kapanışlarına
//                              bakıyor (`readMoneyDayEnd`), yani bugüne ait bir kapanış olmadan
//                              o ekranın uyuşmazlık satırı hiç doğmuyor (ölçüldü 30.08)
//   · KAPANMAMIŞ sefer       → teslimatı olan ama sayımı yapılmamış sefer; "açık sefer" uyarısı
//
// KAPANMA ÖLÇÜTÜ TARİH DEĞİL, DURAKLARDIR: seferin bütün durakları sonuçlandıysa kurye dönmüştür.
// Bugün iki rota koşuyor — dönen kapanır, yoldaki açık kalır (araçtan satış açık sefer ister).

/**
 * Kuryeli rota siparişlerini (zone, gün) başına SEFERE bağlar. Sipariş seed'inden SONRA koşar:
 * hangi günler sürülmüş, siparişlerin kendisi söylüyor — seed tarihle gizlice anlaşmaz.
 */
export async function seedDeliveryRuns(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'delivery_run')) {
    console.log('▸ seferler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEFER seed');
  const kurye = kisiler.get('kurye');
  if (!kurye) {
    console.log('  · kurye profili yok — atlandı');
    return;
  }

  // Kuryeli, bölgeli, günlü rota siparişleri — seferin duraklarını bunlar tanımlar.
  //
  // **SÜZGEÇ TEK KURYEYE DARALTILMAZ** (30.08): seferin kuryesi SİPARİŞTEN gelir (0046'nın kendi
  // kuralı), seed'in bildiği sabit bir isimden değil. Daraltılmış hâlde bugünün rotası başka bir
  // hesaba yazıldığında o hesabın sefer ekranı sessizce boş kalıyordu — sipariş vardı, sefer yoktu.
  const { data, error } = await db
    .from('order')
    .select('id,delivery_zone_id,delivery_date,warehouse_id,courier_id')
    .not('courier_id', 'is', null)
    .eq('delivery_type', 'route')
    .not('delivery_zone_id', 'is', null)
    .not('delivery_date', 'is', null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string; delivery_zone_id: string; delivery_date: string; warehouse_id: string; courier_id: string;
  }>;
  if (rows.length === 0) {
    console.log('  · kuryeli rota siparişi yok — sefer kurulmadı');
    return;
  }

  // (zone, gün) grupları — rota+gün başına TEK sefer (0046 kısıtının aynısı).
  const gruplar = new Map<
    string,
    { zoneId: string; date: string; warehouseId: string; courierId: string; orderIds: string[] }
  >();
  for (const row of rows) {
    const key = `${row.delivery_zone_id}·${row.delivery_date}`;
    const grup = gruplar.get(key);
    if (!grup) {
      gruplar.set(key, {
        zoneId: row.delivery_zone_id, date: row.delivery_date, warehouseId: row.warehouse_id,
        courierId: row.courier_id, orderIds: [row.id],
      });
      continue;
    }
    // Aynı rota+gün İKİ kuryeye yazılamaz: sefer tekil ve kuryesi tek. Seed'de böyle bir satır
    // çıkarsa bu bir fikstür hatasıdır — sessizce birini seçmek, ötekinin ekranını boşaltırdı.
    if (grup.courierId !== row.courier_id) {
      throw new Error(`seed sefer: ${grup.date} · aynı rotada iki kurye (${grup.courierId} ↔ ${row.courier_id})`);
    }
    grup.orderIds.push(row.id);
  }

  const yil = new Date().getFullYear();
  const bugun = new Date().toISOString().slice(0, 10);

  /*
    ── ARAÇ: SEFERİN KÜNYESİNDE (31.08) ──────────────────────────────────────────────────────────
    Kurye artık aracını kendisi seçiyor (v3:16) ve künye o adı taşıyor. Seed araçsız sefer
    kuruyordu; ekran "araç atanmamış" yazmak zorunda kalıyor ve araç adının çizildiği hiçbir hâl
    denenemiyordu. Depoya künyeli ilk araç yeter — filo seçimi bu seed'in konusu değil.
  */
  const { data: aracRows } = await db.from('vehicle').select('id').eq('is_active', true).limit(1);
  const aracId = (aracRows?.[0] as { id: string } | undefined)?.id ?? null;

  /*
    ── ARAÇ BİR ARA DEPO: ÜÇ HÂL DE KURULUR (kullanıcı kararı 31.08) ─────────────────────────────
    Sefer artık iki ayrı andan geçiyor — KURULUR (`departed_at` null, siparişler damgalanır,
    kutular okutulabilir) ve BAŞLATILIR (damga vurulur, duraklar açılır, müşteriye haber gider).
    Seed 31.08'e kadar yalnız "başlatılmış" hâli üretiyordu ve ikisi de denenemiyordu:

      · İLERİ GÜNÜN SEFERİ tamamen ATLANIYORDU (`grup.date > bugun → continue`). Oysa kullanıcının
        senaryosu tam bu: *"araç iki-üç günlük yolculuğa çıkıyor ve rotalar tek günlük olduğu için
        yarının seferleri de bugünden araca yükleniyor."* Atlanınca "Araçtaki Seferler" ekranında
        gün etiketi (bugün · yarın) hiç görünemiyordu.
      · BUGÜNÜN İKİ ROTASININ İKİSİ DE sürülüyor görünüyordu; "araçta bekleyen sefer" ve onun
        "Seferi başlat" düğmesi hiçbir ekranda doğmuyordu.

    Artık: ileri günün seferi KURULUR ama başlatılmaz; bugünün İKİNCİ rotası da öyle. Birinci rota
    sürülüyor kalır — üç hâl de aynı anda ekranda.
  */
  /*
    HOLDBACK KURYE BAŞINA (ölçüldü 31.08 · cihazda yakalandı). İlk yazımda bugünün İKİNCİ rotası
    bekletiliyordu — küresel olarak. Cihazda bakınca o rota BAŞKA kuryeye çıktı: giriş yapılan
    hesabın aracında iki sefer vardı ve ikisi de sürülüyordu, yani "araçta bekleyen sefer" hâli
    hiçbir hesapta denenemiyordu. Seed'in ürettiği veri ekranı kapsamıyordu.

    Kural artık kuryeye bağlı: iki ya da daha çok rotası olan HER kurye birini bekleyen bulur.
    Tek rotalı kurye hiçbirini bekletmez — o gün sürecek seferi kalmazdı ve ekranı boş bir araca
    düşerdi (durak listesi, özet kartı, kapanış düğmesi hiç görülemezdi).
  */
  const bugunGruplari = [...gruplar.values()].filter((grup) => grup.date === bugun);
  const bekletilen = new Set<string>();
  for (const courierId of new Set(bugunGruplari.map((grup) => grup.courierId))) {
    const kendi = bugunGruplari.filter((grup) => grup.courierId === courierId);
    if (kendi.length > 1) bekletilen.add(`${kendi[kendi.length - 1]!.zoneId}·${kendi[kendi.length - 1]!.date}`);
  }
  for (const grup of gruplar.values()) {
    // ── DAMGA BİR PLAN DEĞİL, OLAYDIR (mobil şeridin ölçümü, 26.08) ────────────────────────────
    // İlk hâlde her sefere çıkış VE dönüş yazılıyordu — yarınki sefer bile "dönmüş" görünüyordu.
    // İki şeyi birden bozuyordu: (1) seed'in kendi niyetiyle çelişiyordu — aşağıdaki `seedRunCloses`
    // bilerek "kapanmamış sefer" bırakıyor ama satır "kurye 16:45'te döndü" diyordu; (2) motorun
    // araç satışını sefere bağlayan adımı bu yüzden hiç tetiklenemiyordu (`quick-sale` 4b).
    // Gerçek akışta dönüş damgasını YALNIZ kapanış yazar (0046) — seed de artık aynısını söylüyor.
    /* İleri günün seferi ve bugün bekletilen rota: KURULUR ama BAŞLATILMAZ. Damga yok, duraklar
       `ready` kalır, kutular okutulabilir — "araçta bekleyen sefer"in tam tanımı. */
    const kurulacak = grup.date > bugun || bekletilen.has(`${grup.zoneId}·${grup.date}`);
    /*
      GEÇMİŞ gün: çıkış sabah 08:30, dönüş 16:45 — kapanış ekranındaki süre hesabı gerçekçi dursun.

      BUGÜN: çıkış "iki saat önce" ve bu bir üslup tercihi değil KISIT (30.08). Sabit 08:30 yazmak
      `db:refresh` sabahın erken saatinde koşulduğunda dönüş damgasını çıkıştan ÖNCEYE düşürüyordu
      ve `delivery_run_times` kısıtı seed'i kesiyordu (`returned_at >= departed_at`) — bugünün
      seferi artık kapanabildiği için o dal gerçek bir düşüş sebebi.
    */
    const departed = kurulacak
      ? null
      : grup.date < bugun
        ? `${grup.date}T08:30:00+02:00`
        : new Date(Date.now() - 2 * 3_600_000).toISOString();
    const returned = kurulacak || grup.date >= bugun ? null : `${grup.date}T16:45:00+02:00`;
    const { data: run, error: runErr } = await db
      .from('delivery_run')
      .insert({
        reference_no: deliveryRunReferenceNo(yil),
        delivery_zone_id: grup.zoneId,
        delivery_date: grup.date,
        warehouse_id: grup.warehouseId,
        courier_id: grup.courierId,
        /* `created_at` DAMGADAN bağımsız: kurulmuş sefer henüz çıkmamıştır ama satırı bugün
           doğdu. İkisini eşitlemek, kurulmuş seferi "hiç yaratılmamış" gibi gösterirdi. */
        created_at: departed ?? new Date(Date.now() - 3 * 3_600_000).toISOString(),
        departed_at: departed,
        returned_at: returned,
        vehicle_id: aracId,
      })
      .select('id,reference_no')
      .single();
    if (runErr) throw runErr;

    const { error: stampErr } = await db
      .from('order')
      .update({ delivery_run_id: (run as { id: string }).id })
      .in('id', grup.orderIds);
    if (stampErr) throw stampErr;
    /* Sonuçlanma saatleri yalnız SÜRÜLMÜŞ seferde anlamlı: kurulmuş seferin hiçbir durağı
       sonuçlanmamıştır, saat yaymak olmayan bir geçmişi uydurmak olurdu. */
    if (departed !== null) await duraklariSaateYay(db, grup.orderIds, departed);
    /*
      ── AÇIK SEFERİN DURAKLARI GERÇEKTEN YOLA ÇIKAR (30.08 · cihaz turunda yakalandı) ──────────
      Sefer ham insert'le kuruluyor (yukarıdaki künye) ve o insert `departed_at` yazıyor — ama
      SİPARİŞLERİN durumuna dokunmuyordu. Ortaya gerçekte doğamayacak bir gün çıkıyordu: sefer
      çıkmış görünüyor, durakların hepsi hâlâ `ready`. Ölçüldü: bugünün açık seferinde tek bir
      `out_for_delivery` durak yoktu.

      Belirtisi kuryenin ekranında görüldü — bekleyen bir durakta "Ulaşılamadı"ya basmak
      `same_status` ile reddediliyordu ("Sipariş zaten bu durumda"), çünkü `unreachable`ın hedefi
      `ready` ve sipariş zaten oradaydı. Ekran doğru davranıyordu; yalan söyleyen VERİYDİ.

      Çare GERÇEK KAPI: `startCourierDay` açık sefere geç kalan durakları bağlar (catch-up claim)
      ve `ready → out_for_delivery` geçişini kendisi yazar. Kutulu sipariş yola ÇIKMAZ — tüm
      kutuları binene kadar `ready` kalır (23.8) ve kapı onu `awaitingBoxes` diye ayırır; o hâl
      gerçektir, korunuyor.
    */
    if (returned === null && !kurulacak) {
      const acilis = await startCourierDay(db, {
        courierId: grup.courierId,
        zoneId: grup.zoneId,
        date: grup.date,
      });
      if (acilis.status === 'ok') {
        const yolda = [...acilis.started, ...acilis.alreadyOut];
        console.log(
          `    · ${yolda.length} durak yolda${acilis.awaitingBoxes.length > 0 ? ` · ${acilis.awaitingBoxes.length} kutu bekliyor` : ''}`,
        );
        /*
          ── ULAŞILAMADI DURAĞI: YOLA ÇIKTIKTAN SONRA ─────────────────────────────────────────
          İşaret sipariş seed'inde yazılıyordu ve buradaki catch-up claim onu geri alıyordu
          (ulaşılamayan durak `ready`e döner, claim `ready` durakları yola çıkarır). Sıra artık
          sahanın sırası: yola çık → kapıyı çal → ulaşamadıysan işaretle.

          BİR TANE, İLK YOLDAKİ DURAK: kurye ekranı takılı durağı bir SAYIYLA da gösteriyor
          ("2 takılı") ve o sayının sınanabilmesi için takılı durak yanında en az bir açık durak
          kalmalı — hepsini işaretlemek "sefer bitti" demek olurdu.
        */
        const hedef = yolda[0];
        if (hedef !== undefined && yolda.length > 1) {
          const isaret = await markUndelivered(db, {
            orderId: hedef,
            courierId: grup.courierId,
            outcome: 'unreachable',
            /* Not YALNIZ SEBEPTİR, envanter değil: ekran malın akıbetini kendisi yazıyor
               ("1 kalem araçta kaldı"), notun onu tekrarlaması satırı iki kez konuşturuyordu. */
            note: 'Zil bozuk — kimse yok',
          });
          if (isaret.status !== 'ok') throw new Error(`seed sefer: ulaşılamadı yazılamadı (${isaret.status})`);
          console.log('    · 1 durak ULAŞILAMADI (mal araçta, yarına devrolur)');
        }
      } else {
        // Sessiz geçilmez: yola çıkmayan bir açık sefer kurye ekranını yanlış doldurur.
        console.log(`    · duraklar yola çıkarılamadı (${acilis.status})`);
      }
    }
    console.log(
      `  ✓ ${(run as { reference_no: string }).reference_no} · ${grup.date} · ${grup.orderIds.length} durak${returned ? '' : ' · AÇIK (yolda)'}`,
    );
  }
  console.log(
    `✓ sefer: ${gruplar.size} sefer kuruldu (rota+gün başına tek) · ${bekletilen.size} tanesi ARAÇTA BEKLİYOR (başlatılmadı)`,
  );
}

/**
 * **DURAKLARIN SONUÇ SAATLERİNİ GÜN İÇİNE YAYAR** (30.08).
 *
 * Kurye gün listesi durağın sonucunu SAATİYLE yazıyor ("TESLİM EDİLDİ · 14:12") — sabah çıkılan
 * rotada saat, hangi durağın ne zaman kapandığını söyleyen tek işaret. Seed ise günü tek nefeste
 * kuruyor: ölçüldü, bugünün beş durağının bütün geçişleri aynı saniyedeydi (`13:04:32`) ve ekran
 * beş durağa da aynı dakikayı yazardı. Rota bir SIRA'dır; aynı dakika o sırayı görünmez kılar.
 *
 * **YALNIZ SEED'İN DERDİ:** damgayı geriye kurmanın serviste karşılığı yok ve olmamalı (bu
 * dosyanın kendi künyesi — seferler de aynı sebeple ham insert'le kuruluyor). Üretimde saat, işin
 * gerçekten yapıldığı andır.
 *
 * Yayılım çıkıştan itibaren durak başına 35 dakika: gerçek bir rotanın temposu ve beş duraklık bir
 * gün öğleden sonraya taşmadan bitiyor. Yalnız SONUÇ geçişleri kaydırılır (`delivered` · `returned`
 * · ulaşılamayanın `ready` dönüşü) — hazırlık ve yola çıkış damgaları olduğu gibi kalır, onlar
 * kuryenin sorusunun cevabı değil.
 */
async function duraklariSaateYay(db: Db, orderIds: readonly string[], departedAt: string): Promise<void> {
  const cikis = new Date(departedAt).getTime();
  for (const [sira, orderId] of orderIds.entries()) {
    const { data, error } = await db
      .from('order_status_log')
      .select('id,from_status,to_status')
      .eq('order_id', orderId);
    if (error) throw error;
    const kayitlar = (data ?? []) as Array<{ id: string; from_status: string | null; to_status: string }>;
    const sonuc = kayitlar.find(
      (kayit) =>
        kayit.to_status === 'delivered' ||
        kayit.to_status === 'returned' ||
        (kayit.from_status === 'out_for_delivery' && kayit.to_status === 'ready'),
    );
    // Sonuçlanmamış durağın kaydırılacak damgası da yoktur — bekleyen durak saat yazmaz.
    if (!sonuc) continue;
    const an = new Date(cikis + (sira + 1) * 35 * 60_000).toISOString();
    const { error: yazErr } = await db.from('order_status_log').update({ created_at: an }).eq('id', sonuc.id);
    if (yazErr) throw yazErr;
  }
}

/** Sefer kapanışları — kapanış RPC'den geçer (yazım tek yol), yalnız sayılan tutarlar seed'indir. */
export async function seedRunCloses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'delivery_run_close')) {
    console.log('▸ sefer kapanışları zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEFER KAPANIŞI seed');
  const kurye = kisiler.get('kurye');
  const admin = kisiler.get('yonetici') ?? null;
  if (!kurye) {
    console.log('  · kurye profili yok — atlandı');
    return;
  }

  const runs = new DeliveryRunService(db);
  const collections = new DeliveryRunCollectionService(db);

  /**
   * Seferin bütün durakları sonuçlandı mı — "kurye döndü" sorusunun veriye sorulmuş hâli.
   *
   * Ölçüt bunun için var: kapanış bir günün SONUNDA yapılır ve hâlâ yolda olan sefer kapatılmaz.
   * Tarihe (ör. "bugünse kapatma") bakmak yerine DURAKLARA bakmak, bugün iki rota koştuğunda da
   * doğru cevabı veriyor: biri dönmüşse o kapanır, öteki açık kalır.
   */
  async function seferiBitti(runId: string): Promise<boolean> {
    const { data, error } = await db.from('order').select('status').eq('delivery_run_id', runId);
    if (error) throw error;
    const duraklar = (data ?? []) as Array<{ status: string }>;
    return (
      duraklar.length > 0 &&
      duraklar.every((durak) => ['delivered', 'completed', 'returned', 'cancelled'].includes(durak.status))
    );
  }

  // Kapıda tahsilatı OLAN seferler — görünüm zaten "hangi sefer, ne kadar" diyor. Sıralama sefer
  // gününe göre en yeniden eskiye; küme TÜM kuryelerin seferi (30.08): kapanış kuryeye değil
  // SEFERE aittir ve bugün iki rota iki ayrı kimlikte koşuyor.
  const bugun = new Date().toISOString().slice(0, 10);
  const seferler = await runs.listRecent({ limit: 60 });
  /** GEÇMİŞ günlerin tahsilatlı seferleri — mutabık/farklı kapanışların kaynağı. */
  const tahsilatli: Array<{ runId: string; date: string }> = [];
  /** BUGÜN dönmüş seferler — gün sonu mutabakatının bugüne ait tek kaynağı. */
  const bugunDonen: Array<{ runId: string; date: string }> = [];
  for (const sefer of seferler) {
    if (!(await collections.getByRun(sefer.id))) continue;
    if (sefer.deliveryDate < bugun) tahsilatli.push({ runId: sefer.id, date: sefer.deliveryDate });
    // BUGÜNÜN seferi ancak DÖNMÜŞSE kapanır. En az biri açık kalmalı: araçtan satış yalnız açık
    // sefere bağlanıyor (`quick-sale` 4b) ve kurye ekranı da bugünün açık seferini bekliyor.
    else if (sefer.deliveryDate === bugun && (await seferiBitti(sefer.id))) {
      bugunDonen.push({ runId: sefer.id, date: sefer.deliveryDate });
    }
  }

  if (tahsilatli.length === 0 && bugunDonen.length === 0) {
    console.log('  · kapıda tahsilatlı sefer yok — kapanış kurulmadı');
    return;
  }

  // 1) EN YENİ sefer: mutabık kapanış — sayılan tutar beklenenin aynısı.
  const mutabik = tahsilatli[0];
  if (mutabik) {
    const beklenen = await collections.getByRun(mutabik.runId);
    const sonuc = await runs.close({
      runId: mutabik.runId,
      countedCashCents: beklenen?.expectedCashCents ?? 0,
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${mutabik.date} · MUTABIK · teslim ${sonuc.deliveredCount} · devreden ${sonuc.pendingCount} · nakit ${fromCents(sonuc.countedCashCents ?? 0)} €`
        : `  · ${mutabik.date} atlandı (${sonuc.reason})`,
    );
  }

  // 2) BİR ÖNCEKİ sefer: FARK VAR — kuryede 15 € eksik nakit. Fark açıklamasız kalmaz: operatörün
  // sorduğu soru "neden" olduğu için seed o cevabı da kurar.
  const farkli = tahsilatli[1];
  if (farkli) {
    const beklenen = await collections.getByRun(farkli.runId);
    const sonuc = await runs.close({
      runId: farkli.runId,
      countedCashCents: Math.max(0, (beklenen?.expectedCashCents ?? 0) - 1500),
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      note: 'Bir müşteri 15 € eksik ödedi, kalanı bir sonraki teslimatta verecek. Kendisiyle konuşuldu.',
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${farkli.date} · FARK VAR · nakit fark ${fromCents(sonuc.differenceCashCents ?? 0)} € · mutabık: ${sonuc.reconciled}`
        : `  · ${farkli.date} atlandı (${sonuc.reason})`,
    );
  }

  /*
    3) BUGÜN DÖNMÜŞ sefer: FARK VAR — gün sonu mutabakatının BUGÜNE ait tek kaynağı (30.08).

    `readMoneyDayEnd` yalnız BUGÜNÜN kapanışlarına bakıyor: dünkü farklı kapanış oradan hiç
    görünmüyor ve `discrepancy` her koşuda `null` dönüyordu — ekran "mutabakat sorusu henüz
    sorulmadı" diyordu, oysa asıl sebep seed'in bugüne hiç kapanış yazmamasıydı.

    Fark 8,40 € ve YÖNÜ ters (fazla çıkmış): dünkü kapanış eksik nakit örneği, bu fazla. İkisi
    farklı sorular ve ekranın işareti (eksi/artı) ancak iki yönlü veriyle sınanır.
  */
  for (const bugunku of bugunDonen) {
    const beklenen = await collections.getByRun(bugunku.runId);
    const sonuc = await runs.close({
      runId: bugunku.runId,
      countedCashCents: (beklenen?.expectedCashCents ?? 0) + 840,
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      note: 'Kasada 8,40 € fazla çıktı — bir müşteri üstünü almadı, sabah ofise bırakılacak.',
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${bugunku.date} (BUGÜN, dönen rota) · FARK VAR · nakit fark ${fromCents(sonuc.differenceCashCents ?? 0)} €`
        : `  · ${bugunku.date} atlandı (${sonuc.reason})`,
    );
  }

  // 4) Kalan seferler KAPATILMADAN bırakılır — "sayımı bekleyen sefer" uyarısının zemini.
  const kapanan = Math.min(2, tahsilatli.length) + bugunDonen.length;
  const acik = tahsilatli.length - Math.min(2, tahsilatli.length);
  console.log(
    `✓ sefer kapanışı: ${kapanan} sefer kapandı (1 mutabık · ${1 + bugunDonen.length} FARKLI, biri BUGÜN) · ${acik} geçmiş sefer açık`,
  );
}
