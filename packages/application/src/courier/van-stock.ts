import { DeliveryRunCloseService, DeliveryRunService, StockService, WarehouseService, WarehouseTransferService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchTransfer, receiveTransfer } from '../warehouse/transfer';
import { displayName, variantNames } from '../warehouse/names';

/**
 * **ARACA SERBEST ÜRÜN** (v3:19 · kullanıcı kararı 31.08) — sipariş dışı, kapıda satılabilecek mal.
 *
 * ── İKİ AYRI ŞEY, TEK EKRAN ─────────────────────────────────────────────────
 * Araca iki tür mal biniyor ve mekanizmaları AYNI DEĞİL:
 *   · **Sipariş kutusu** → emanet değişimi. Mal siparişin, depoda rezerve; stok oynamaz
 *     (`ready → out_for_delivery` etkisi `none`). `loadBox` yalnız damga yazar.
 *   · **Serbest ürün** → GERÇEK STOK HAREKETİ. Mal depodan çıkıp aracın stoğuna girer, çünkü
 *     kapıda o stoktan satılacak (`quickSale` araç deposundan düşüyor) ve akşam sayılıp geri
 *     devredilecek (v3:14). İkisini tek mekanizmaya indirmek, satılan malın hangi depodan
 *     düştüğünü belirsiz bırakırdı.
 *
 * ── NEDEN TRANSFER, NEDEN TEK ÇAĞRIDA ───────────────────────────────────────
 * Depo→araç bir TRANSFERDİR ve mekanizması hazır: `dispatch_transfer` malı kaynaktan O AN düşürür
 * (sanal transit depo yok — 0031'in T4 kararı), `receive_transfer` hedefe yazar. Yeni bir RPC
 * yazılmadı; ikinci bir stok taşıma yolu açmak, aynı gerçeği iki yerden oynatmak olurdu (CLAUDE §1).
 *
 * İki adım TEK çağrıda kapanıyor ve bu bir kestirme değil, sahanın kendisi: kurye rampada malı
 * eline alıp araca koyuyor — veren de alan da O. Ayrı bir "kabul" adımı, kuryeye kendi koyduğu
 * malı ikinci kez onaylatmak olurdu. Yarım kalma riski de var ve GÖRÜNÜR: sevk yazılıp kabul
 * düşerse mal transferde asılı kalır, o yüzden cevap ikisini birden söyler.
 *
 * ── ARAÇ DEPOSU SEFERİN ARACINDAN GELİR, İSTEMCİDEN DEĞİL (21.249 · 04.09) ──
 * Kuryenin açık seferinin aracı → o aracın deposu (`warehouse.vehicle_id`). İstemciden gelen bir
 * depo kimliği, kapsam kontrolünü kandırmanın kendisidir. **Kapsam bu soruya artık karışmıyor:**
 * 04.09'a kadar çözüm `warehouseIds` dizisini tarayıp türü araç olan İLKİNİ alıyordu ve seferde
 * seçilen araç hiçbir yere girmiyordu — ölçüm ve gerekçe `vehicleWarehouseOf` künyesinde.
 */

/** Araçta duran bir kalem — parti değil VARYANT düzeyinde toplanır (kurye partiyi konuşmaz). */
export interface VanStockLine {
  variantId: string;
  name: string;
  /**
   * Boy etiketi ("450 g"); tek boylu üründe boş dize.
   *
   * ADDAN AYRI (v3:19 `sr.ad` kalın · `sr.boy` ince) — birleşik dize gönderiliyordu ("Cevizli
   * Baklava (450 g)") ve ekran ikisini farklı ağırlıkta yazamıyordu. Depo ekranlarının hepsi bu
   * ayrımı zaten yapıyor (`variantNames` ikisini ayrı döndürüyor); kurye ucu tek yerde
   * birleştirip bilgiyi kaybediyordu.
   */
  variantLabel: string;
  /** Ürün kapağının public URL'i; `null` = kapaksız ürün (satır monogram çizer). */
  imageUrl: string | null;
  /** Araçta kalan adet — partiler toplanmış hâlde. */
  qty: number;
  /**
   * ÇIKIŞ DEPOSUNDA kalan kullanılabilir adet — "Alındıktan sonra depoda N kalır." cümlesinin
   * kaynağı (v3:19 `sr.not`). Kurye adedi artırırken depoyu boşaltıp boşaltmadığını görmeli;
   * sayı olmadan artırma sınırsız bir düğme gibi duruyordu.
   */
  available: number;
}

/** Depoda alınabilir bir kalem — "sık koyulanlar" şeridinin satırı. */
export interface VanCandidate {
  variantId: string;
  name: string;
  /** Boy etiketi ("450 g") — adın ince yarısı; birleştirilmiş dize ağırlık farkını yutuyordu. */
  variantLabel: string;
  /** Ürün kapağı; `null` = monogram. */
  imageUrl: string | null;
  /** Depoda KULLANILABİLİR adet (rezerveler düşülmüş) — söz verilmiş mal araca alınamaz. */
  available: number;
  /** Bu varyanttan araçta kaç tane var — şerit kartı "araçta 3" diyebilsin diye (v3:19 `h.rozet`). */
  onVan: number;
}

export type TakeToVanOutcome =
  | { status: 'ok'; variantId: string; movedQty: number; vanQty: number }
  /** Depoda o kadar KULLANILABİLİR mal yok — sipariş için ayrılmış mal araca alınmaz. */
  | { status: 'not_enough'; available: number }
  | { status: 'no_vehicle' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /** Sevk yazıldı ama kabul düşdü — mal transferde asılı; kimliği dönüyor ki çözülebilsin. */
  | { status: 'stuck'; transferId: string }
  | { status: 'failed'; message: string };

/**
 * **ARAMA AKSANI YUTAR** — `"pogaca"` yazan kurye `"Patatesli Poğaça"`yı bulur.
 *
 * Ölçüldü (cihazda, 31.08): telefon klavyesinde ğ/ç/ş/ı/ö/ü yazmak fazladan basış istiyor ve
 * rampada kimse onu yapmıyor; katlanmamış karşılaştırma "aramaya uyan mal yok" diyordu. Katlama
 * TEK YÖNLÜ: hem aranan hem aranılan aynı süzgeçten geçiyor, yani "poğaça" yazan da bulur.
 *
 * `İ` ve `ı` ayrımı önce Türkçe kurallarıyla küçültülür (`toLocaleLowerCase('tr')`), sonra
 * harfler ASCII karşılıklarına indirilir. Sıra önemli: JS'in dil-bağımsız küçültmesi `I`yı `i`
 * yapar ve Türkçede o YANLIŞTIR (`courier-format.turkishUpper`in aynası).
 */
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
function foldTurkish(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch);
}

/**
 * **KURYENİN ARAÇ DEPOSU — SEFERİN ARACINDAN** (21.249 · kullanıcı kararı 04.09).
 *
 * ── ÖNCE NE VARDI, NEDEN YANLIŞTI ──────────────────────────────────────────
 * İmza `(db, warehouseIds)` idi ve kuryenin KAPSAM DİZİSİNİ tarayıp türü araç olan İLK satırı
 * alıyordu. Yani sistem seferde seçilen aracı kaydediyor ama kullanmıyordu: malın hangi araçtan
 * çıkacağını profildeki dizinin SIRASI belirliyordu. Tek araçlı kurulumda doğru cevap veriyor ve
 * hiçbir belirtisi olmuyordu; ikinci araç girdiği gün kurye A'yı seçerken serbest ürün, kapıda
 * satış ve akşam dönüşü B'den işleyecekti — sessizce, hiçbir yerde hata çıkmadan.
 *
 * ── ŞİMDİ: TEK KAYNAK SEFERİN ARACI ────────────────────────────────────────
 * Kuryenin AÇIK seferleri okunur (kapanmamış olanlar), aracı alınır, o aracın deposu döner. Bağ
 * veride: `warehouse.vehicle_id` (21.249 · `warehouse_vehicle_identity`). Kapsam artık bu soruya
 * hiç karışmıyor — kapsamın işi "hangi depoları görebilirsin", "malın nerede" değil.
 *
 * ── ARAÇSIZ SEFERDE `null` VE BU BİR EKSİK DEĞİL ───────────────────────────
 * Araç seçmek isteğe bağlı (`day.ts` künyesi: kurulum eksikse kurye kilitlenmesin). Araçsız
 * seferde araç deposu da YOKTUR ve kapılar `no_vehicle` döner. Kapsamdaki ilk aracı sessizce
 * devreye sokmak, kuryeye adını koymadığı bir aracın malını sattırmaktı (CLAUDE §1: ölçülemeyen
 * değer uydurulmaz).
 *
 * Açık seferlerin hepsi AYNI aracı taşır — kural veride (`assert_vehicle_single_courier`) ve sefer
 * açma kapısında (`vehicle_mismatch`). Yine de ilk NON-NULL araç alınıyor: kural bir gün gevşerse
 * burası çökmemeli, yalnız bir cevap vermeli.
 *
 * ── AÇIK SEFER YOKSA SON SEFERİN ARACI (04.09) ─────────────────────────────
 * Bu okuma KAPANIŞTAN SONRA da doğru cevap vermek zorunda ve sebebi dönüş kapısı: `return.ts`
 * kutu listesini bilerek sefere bağlamıyor (*"dünkü seferin reddedilen kutusu bugün de araçtaysa
 * yine inmelidir"* — o dosyanın künyesi). Araç yalnız AÇIK seferden çözülseydi aynı ekranın iki
 * yarısı çelişirdi: kutular listelenir, serbest ürün "araç yok" derdi — hem de tam o kutuların
 * durduğu araç için. Kurye akşam parasını teslim edip seferi kapattığında depocunun ekranı boşalırdı.
 *
 * Fallback SEÇİM DEĞİL, ÖLÇÜMDÜR: kuryenin en son sürdüğü sefer hangi aracı yazdıysa mal fiziken
 * o araçtadır — kapanış malı indirmez, yalnız parayı mutabık kılar. Kapsamdaki ilk aracı almakla
 * arasındaki fark da bu: orada cevap dizinin sırasından geliyordu, burada kaydından.
 *
 * RAMPA yolları (`/van-stock`, alma/devretme) bu gevşemeyi KULLANMAZ, `courierVanContext`i okur:
 * onların ayrıca seferin ÇIKIŞ TESİSİNE de ihtiyacı var ve kapanmış seferin tesisi bugünün malını
 * nereden alacağını söylemez.
 */
export async function vehicleWarehouseOf(db: SupabaseClient, input: { courierId: string }): Promise<string | null> {
  const run = await vanRunOf(db, input.courierId, { includeClosed: true });
  return run === null ? null : vanWarehouseIdOf(db, run.vehicleId);
}

/**
 * **SERBEST ÜRÜNÜN İKİ UCU** — mal nereden alınıyor, nereye konuyor (21.249).
 *
 * Çıkış tesisi de bir tur kapsamdan çözülüyordu ve aynı aileden bir hataydı: *"araç OLMAYAN ilk
 * kapsam satırı"* deniyordu, yani kapsamda iki araç varsa ÖTEKİ ARAÇ tesis sanılıyordu ve mal
 * araçtan araca taşınıyordu. Şimdi ikisi de tek gerçekten türüyor: açık seferin aracı (deposu) ve
 * açık seferin çıkış tesisi (`delivery_run.warehouse_id` — rotanın deposu).
 *
 * Sefer yoksa ikisi de `null` ve çağıranlar `no_vehicle` döndürüyor.
 */
export interface CourierVanContext {
  /** Aracın STOK deposu; `null` = açık seferde araç yok. */
  vehicleWarehouseId: string | null;
  /** Seferin ÇIKIŞ tesisi — serbest ürünün alındığı depo. */
  facilityId: string | null;
}

export async function courierVanContext(db: SupabaseClient, input: { courierId: string }): Promise<CourierVanContext> {
  const run = await vanRunOf(db, input.courierId, { includeClosed: false });
  if (run === null) return { vehicleWarehouseId: null, facilityId: null };
  return { vehicleWarehouseId: await vanWarehouseIdOf(db, run.vehicleId), facilityId: run.warehouseId };
}

/** Aracı olan sefer — araç kimliği daraltılmış, çağıranların ayrıca `null` elemesi gerekmesin. */
type VanRun = { vehicleId: string; warehouseId: string };

/**
 * Kuryenin ARAÇLI seferi. `includeClosed` yalnız SIRAYI genişletir, sırayı bozmaz: açık sefer
 * varsa daima o kazanır — kapanmışa ancak açık yokken düşülür. "Açık" tanımı `quick-sale`ınkiyle
 * aynı tek sinyalden: **kapanış kaydı yoksa açıktır** (dönüş damgası değil).
 *
 * `listByCourier` `deliveryDate` azalan sırada geliyor, yani kapanmışların ilki EN SON sürülendir.
 */
async function vanRunOf(
  db: SupabaseClient,
  courierId: string,
  opts: { includeClosed: boolean },
): Promise<VanRun | null> {
  const runs = (await new DeliveryRunService(db).listByCourier(courierId, {})).filter((run) => run.vehicleId !== null);
  if (runs.length === 0) return null;

  const closes = await new DeliveryRunCloseService(db).listByRuns(runs.map((run) => run.id));
  const closedIds = new Set(closes.map((close) => close.deliveryRunId));
  const run = runs.find((candidate) => !closedIds.has(candidate.id)) ?? (opts.includeClosed ? runs[0] : undefined);
  return run === undefined || run.vehicleId === null ? null : { vehicleId: run.vehicleId, warehouseId: run.warehouseId };
}

/** Aracın STOK deposu — bağ `warehouse.vehicle_id` (21.249), birebir ve benzersiz. */
async function vanWarehouseIdOf(db: SupabaseClient, vehicleId: string): Promise<string | null> {
  const [van] = await new WarehouseService(db).list({ kind: 'vehicle', vehicleId });
  return van?.id ?? null;
}

/**
 * **Araçta ne var** — varyant düzeyinde toplanmış. Parti kırılımı BİLEREK yok: kurye "üç Şöbiyet
 * var" diye düşünüyor, "iki farklı SKT'den üç Şöbiyet" diye değil. Kırılım depo ekranlarının işi.
 */
export async function readVanStock(
  db: SupabaseClient,
  input: { vehicleWarehouseId: string; sourceWarehouseId?: string | null },
): Promise<VanStockLine[]> {
  const stocks = new StockService(db);
  const batches = await stocks.listInStockDetailed(undefined, [input.vehicleWarehouseId]);
  const toplam = new Map<string, number>();
  for (const batch of batches) {
    if (batch.physicalQty <= 0) continue;
    toplam.set(batch.variantId, (toplam.get(batch.variantId) ?? 0) + batch.physicalQty);
  }
  if (toplam.size === 0) return [];

  const variantIds = [...toplam.keys()];
  /* Çıkış deposu verilmediyse kalan SORULMAZ ve sıfır da yazılmaz (CLAUDE §1: ölçülemeyen değer
     sıfır değildir) — 0 dönerse ekran "depoda hiç kalmadı" derdi, oysa bilmiyoruz. Bu yolda
     ekran cümleyi hiç kurmuyor. */
  const [names, available] = await Promise.all([
    variantNames(db, variantIds),
    input.sourceWarehouseId
      ? stocks.listAvailableAcross([input.sourceWarehouseId], variantIds)
      : Promise.resolve([]),
  ]);
  const availableBy = new Map(available.map((row) => [row.variantId, row.availableQty]));

  return [...toplam.entries()]
    .map(([variantId, qty]) => ({
      variantId,
      name: names.get(variantId)?.productName ?? displayName(names.get(variantId)),
      variantLabel: names.get(variantId)?.variantLabel ?? '',
      imageUrl: names.get(variantId)?.imageUrl ?? null,
      qty,
      available: availableBy.get(variantId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/**
 * **Alınabilecekler** — çıkış deposunda kullanılabilir malı olan varyantlar.
 *
 * ÖLÇÜ FİİLİ DEĞİL KULLANILABİLİR ve gerekçe `dispatch_transfer`ın kendi künyesinde yazılı: fiiliye
 * bakılsaydı müşteriye SÖZ VERİLMİŞ mal araca alınabilir görünürdü, gider, sipariş depoda karşılıksız
 * kalırdı — üstelik aynı mal araçta "serbest" görünüp ikinci kez satılabilirdi.
 *
 * Liste TAVANLI: bu bir katalog değil, rampada tek dokunuşla alınacak kısa bir şerit (v3:19 "SIK
 * KOYULANLAR"). Sınırsız büyüyen bir küme olsaydı sayfalama gerekirdi; burada gereken şey seçim
 * kolaylığı ve tavan onu koruyor (CLAUDE §1'in "editoryal seçki" dalı).
 */
export async function listVanCandidates(
  db: SupabaseClient,
  input: { warehouseId: string; vehicleWarehouseId?: string | null; query?: string; limit?: number },
): Promise<VanCandidate[]> {
  const stocks = new StockService(db);
  const batches = await stocks.listInStockDetailed(undefined, [input.warehouseId]);
  const variantIds = [...new Set(batches.map((batch) => batch.variantId))];
  if (variantIds.length === 0) return [];

  /* KULLANILABİLİR ÖLÇÜSÜ GÖRÜNÜMDEN gelir (`available_stock`), partiden çıkarılmaz: rezerve
     PARTİDE durmuyor, ayrı bir kayıt — parti satırından "fiili − rezerve" hesaplamak mümkün
     değil ve denenirse rezerveleri sıfır saymış olurduk. */
  const [available, names, vanBatches] = await Promise.all([
    stocks.listAvailableAcross([input.warehouseId], variantIds),
    variantNames(db, variantIds),
    /* ARAÇTA KAÇ TANE VAR (v3:19 `h.rozet` = "araçta 3") — şerit kartı kendi hâlini söylüyor.
       Sayı olmadan kurye aynı üründen ikinci kez alıp almadığını bilmiyordu; kart hepsinde aynı
       "dokun, araca al" cümlesini yazıyordu (tur 31.08). */
    input.vehicleWarehouseId
      ? stocks.listInStockDetailed(undefined, [input.vehicleWarehouseId])
      : Promise.resolve([]),
  ]);
  const onVan = new Map<string, number>();
  for (const batch of vanBatches) {
    if (batch.physicalQty <= 0) continue;
    onVan.set(batch.variantId, (onVan.get(batch.variantId) ?? 0) + batch.physicalQty);
  }

  /* Arama ADIN İÇİNDE geçiyor mu — SQL'e inmiyor ve inmemeli: ad iki tabloyu birleştiren bir
     TÜRETİMDİR (ürün adı + boy etiketi) ve `ilike` yalnız birine bakabilirdi. Küme zaten depoda
     stoğu olan varyantlar kadar; rampada aranan şey de tam olarak o. */
  const needle = foldTurkish(input.query ?? '');
  return available
    .filter((row) => row.availableQty > 0)
    .map((row) => ({
      variantId: row.variantId,
      name: names.get(row.variantId)?.productName ?? displayName(names.get(row.variantId)),
      variantLabel: names.get(row.variantId)?.variantLabel ?? '',
      imageUrl: names.get(row.variantId)?.imageUrl ?? null,
      available: row.availableQty,
      onVan: onVan.get(row.variantId) ?? 0,
    }))
    .filter((row) => needle.length === 0 || foldTurkish(`${row.name} ${row.variantLabel}`).includes(needle))
    .sort((a, b) => b.available - a.available)
    .slice(0, input.limit ?? 12);
}

/**
 * **Araca al** — depodan araca, tek çağrıda sevk + kabul.
 *
 * Parti seçimi KAPININ işi, kuryenin değil: rampada "hangi SKT" diye sormak, kapıda satılacak bir
 * paket için anlamsız bir karar. FEFO uygulanıyor (tarihi yakın önce) — depo kapılarının aynı
 * ilkesi ve aynı gerekçe: yakın tarihli mal önce hareket etmezse fire olur.
 */
export async function takeToVan(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    vehicleWarehouseId: string | null;
    variantId: string;
    qty: number;
    actorId?: string | null;
    /**
     * Transfer belgesinin notu (21.257 · depo şeridinin ölçümü 04.09).
     *
     * Sabitti ve `returnFromVan` aynı kapıyı depoları TAKAS EDEREK çağırdığı için iki yön de
     * *"Araca serbest ürün"* yazıyordu: akşam araçtan inen mal, geçmişte "araca konmuş" diye
     * okunuyordu (ölçüldü Oppo'da: `TRF-VAN-1-26-0001/0002`, yön `VAN-1 → STR`, not "Araca").
     * Kayıt doğruydu, CÜMLESİ tersti — belge künyesi olayın kendisini söylemeli.
     *
     * Notu ÇAĞIRANA bıraktık, kapının içinde yönü tahmin etmedik ("hedef araç mı" diye bakmak,
     * çağıranın zaten bildiği niyeti kapıda yeniden çıkarmak olurdu).
     */
    note?: string;
    /**
     * Yazımın kimliği (21.263) — rampada cevabı kaybolan isteğin tekrarı malı İKİNCİ kez araca
     * bindirmesin. Anahtar sevke gider; tekil indeks ikinci yazımı reddeder ve bu kapı kabul
     * adımını hiç çalıştırmadan ölçülmüş sonucu döndürür (aşağıdaki `deduped` dalı).
     */
    idempotencyKey?: string | null;
  },
): Promise<TakeToVanOutcome> {
  if (input.vehicleWarehouseId === null) return { status: 'no_vehicle' };
  if (input.warehouseId === input.vehicleWarehouseId) return { status: 'forbidden', reason: 'out_of_scope' };

  const stocks = new StockService(db);
  /* Kapı ÖNCE ölçüyor, sonra yazıyor: `dispatch_transfer` de kullanılabiliri kontrol ediyor ama
     onun reddi ham bir RPC hatasıdır. Buradaki ölçüm ekrana "depoda şu kadar var" diyebilmek
     için — kuryeye "olmadı" demek yerine SEBEBİNİ söylemek. */
  const [row] = await stocks.listAvailableAcross([input.warehouseId], [input.variantId]);
  const available = row?.availableQty ?? 0;
  if (available < input.qty) return { status: 'not_enough', available };

  const batches = (await stocks.listInStockDetailed([input.variantId], [input.warehouseId]))
    /* FEFO: tarihsiz parti EN SONA — "bilinmiyor"u en yakın tarih saymak, gerçekten yakın olanı
       geride bırakırdı. (`listInStockDetailed` zaten `expiryDate`e göre sıralı; bu satır o sırayı
       KORUYOR ve tarihsizi sona itiyor.) */
    .sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'));

  const lines: Array<{ sourceStockId: string; qty: number }> = [];
  let kalan = input.qty;
  for (const batch of batches) {
    if (kalan <= 0) break;
    const pay = Math.min(kalan, batch.physicalQty);
    if (pay <= 0) continue;
    lines.push({ sourceStockId: batch.id, qty: pay });
    kalan -= pay;
  }

  const sevk = await dispatchTransfer(db, {
    fromWarehouseId: input.warehouseId,
    toWarehouseId: input.vehicleWarehouseId,
    lines,
    actorId: input.actorId ?? null,
    note: input.note ?? 'Araca serbest ürün',
    idempotencyKey: input.idempotencyKey,
  });
  if (sevk.status !== 'ok') {
    if (sevk.status === 'failed') return { status: 'failed', message: sevk.message };
    return { status: 'forbidden', reason: 'out_of_scope' };
  }

  /*
    TEKRAR EDEN İSTEK BURADA DURUR (21.263). Sevk zaten yazılmışsa KABUL ADIMI ÇALIŞTIRILMAZ:
    ilk çağrı ya işi bitirmiştir (transfer `received`, mal araçta) ya da kabulde takılmıştır
    (transfer `in_transit`, hâli `stuck` olarak zaten görünür ve depo ekranından çözülür — bu
    dosyanın `stuck` künyesinin kararı). İkisinde de doğru davranış aynı: hiçbir şey yazma, malın
    ŞU AN nerede olduğunu ÖLÇ ve onu söyle.

    `movedQty: 0` bilerek: bu çağrı hiçbir şey taşımadı. Taşındığını yazmak, yazılmamış bir
    hareketi yazılmış göstermek olurdu.
  */
  if (sevk.deduped) {
    const olcum = await vanQtyOfVariant(db, input.vehicleWarehouseId, input.variantId);
    return { status: 'ok', variantId: input.variantId, movedQty: 0, vanQty: olcum };
  }

  const transferLines = await new WarehouseTransferService(db).listLines(sevk.transferId);
  const kabul = await receiveTransfer(db, {
    transferId: sevk.transferId,
    warehouseId: input.vehicleWarehouseId,
    lines: transferLines.map((line) => ({ lineId: line.id, receivedQty: line.qty })),
    actorId: input.actorId ?? null,
  });
  /* Kabul düşerse mal TRANSFERDE asılı kalır ve bu gizlenmez: kimliği dönüyor ki depo ekranından
     çözülebilsin. Sessiz bir `ok`, kaybolmuş bir malı "araçta" diye gösterirdi. */
  if (kabul.status !== 'ok') return { status: 'stuck', transferId: sevk.transferId };

  return {
    status: 'ok',
    variantId: input.variantId,
    movedQty: input.qty,
    vanQty: await vanQtyOfVariant(db, input.vehicleWarehouseId, input.variantId),
  };
}

/**
 * Bir varyantın BİR depodaki adedi — tek satır, tek süzgeç.
 *
 * Kendi fonksiyonu, çünkü üç yerden soruluyor (yazım sonrası ölçüm, tekrar dalı, devrin düzeltmesi)
 * ve üçünde de `readVanStock`un TAM listesini çekip içinden aramak gereksiz iş olurdu. Üçüncü bir
 * kopya doğmasın diye tek yerde (CLAUDE §1).
 */
async function vanQtyOfVariant(db: SupabaseClient, warehouseId: string, variantId: string): Promise<number> {
  const line = (await readVanStock(db, { vehicleWarehouseId: warehouseId })).find((row) => row.variantId === variantId);
  return line?.qty ?? 0;
}

/**
 * **Depoya devret** — araçtan depoya, aynı yoldan ters yön (v3:14 "SAY VE DEVRET").
 *
 * Akşam dönüşünde satılmayan mal geri veriliyor. Ayrı bir kapı DEĞİL aynı kapının aynası: kaynak
 * ile hedef yer değiştiriyor, mekanizma bir. İki ayrı yol yazılsaydı biri bir gün ötekinden
 * ayrılırdı (fire kaydı, parti izi, defter satırı).
 *
 * **Aynasının yazdığı NOT kendisinindir** (21.257): mekanizma ortak, cümle değil — belgeyi okuyan
 * yönü nottan anlar. Künye `takeToVan`ın `note` alanında.
 *
 * ── AYNANIN TUZAĞI: DÖNEN `vanQty` DÜZELTİLİYOR (21.263 · ölçüldü 05.09) ────
 * Takas yalnız depoları değil ADLARINI da yer değiştiriyor: `takeToVan`ın içinde
 * `input.vehicleWarehouseId` bu yönde **tesistir**, araç değil. Dolayısıyla oradan dönen `vanQty`
 * aracın değil ÇIKIŞ DEPOSUNUN o varyanttaki adediydi. Bugüne dek görünmüyordu çünkü ekran yalnız
 * `movedQty`yi yazıp listeyi yeniden okuyordu — ama sayı yanlıştı, ve yanlış kaldığı sürece bir gün
 * ona güvenen biri çıkardı. Ölçüm burada, ARACIN kendi deposundan, yeniden yapılıyor.
 */
export async function returnFromVan(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    vehicleWarehouseId: string | null;
    variantId: string;
    qty: number;
    actorId?: string | null;
    /** Yazımın kimliği (21.263) — geçirgen; künyesi `takeToVan`ın aynı alanında. */
    idempotencyKey?: string | null;
  },
): Promise<TakeToVanOutcome> {
  if (input.vehicleWarehouseId === null) return { status: 'no_vehicle' };
  const van = input.vehicleWarehouseId;
  const sonuc = await takeToVan(db, {
    warehouseId: van,
    vehicleWarehouseId: input.warehouseId,
    variantId: input.variantId,
    qty: input.qty,
    actorId: input.actorId ?? null,
    note: 'Araçtan depoya devir',
    idempotencyKey: input.idempotencyKey,
  });
  // Yukarıdaki künyenin tuzağı: `takeToVan` tesisin adedini ölçtü. Araçtakini burada söylüyoruz.
  return sonuc.status === 'ok' ? { ...sonuc, vanQty: await vanQtyOfVariant(db, van, input.variantId) } : sonuc;
}

export type SetVanQtyOutcome =
  | { status: 'ok'; variantId: string; delta: number; vanQty: number }
  /** Taban tutmadı — HİÇBİR ŞEY YAZILMADI ve `vanQty` aracın gerçeğidir. Künye kapının içinde. */
  | { status: 'stale'; variantId: string; vanQty: number }
  | { status: 'not_enough'; available: number }
  | { status: 'no_vehicle' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'stuck'; transferId: string }
  | { status: 'failed'; message: string };

/**
 * **ARAÇTAKİ ADEDİ YAZ** — rampanın tek yazım kapısı (21.263 · kullanıcı kararı 04.09).
 *
 * İstemci "şu kadar EKLE" demeyi bıraktı, "şu kadar OLSUN — ben şu kadar görüyorum" diyor. Farkı ve
 * yönü burada, aracın GERÇEK adedi ölçülerek buluyoruz. Sözleşme künyesi
 * (`CourierVanStockSetRequestSchema`) neden fark göndermediğimizi anlatıyor; burada yalnız SIRA var
 * ve sıranın kendisi bir karar.
 *
 * ── İKİ KONTROL, BU SIRAYLA ─────────────────────────────────────────────────
 * 1. **YAKINSAMA** — gerçek zaten hedefe eşitse hiçbir şey yazma, BAŞARI dön (`delta: 0`).
 * 2. **TABAN** — gerçek, istemcinin gördüğünden farklıysa hiçbir şey yazma, `stale` dön.
 *
 * **Yakınsama MUTLAKA tabandan önce.** Cevabı kaybolan bir isteğin tekrarında taban zaten bayattır
 * (ilk istek yazdı, ekran göremedi) ama sonuç DOĞRUDUR — o istek bir çatışma değil bir başarıdır.
 * Sıra ters olsaydı kurye doğru isteği için `stale` yer, ekran ona "değişmiş" derdi ve o an
 * araçtaki sayı zaten istediği sayı olurdu. Bu iki cümle bu kapının çekirdeği.
 *
 * ── NEDEN AYRI BİR KAPI, `takeToVan`ın İÇİNE GÖMÜLMEDİ ──────────────────────
 * `takeToVan`/`returnFromVan` fiziksel hareketin iki yönü ve başka çağıranları var (akşam dönüşü
 * `returnFromVan`ı adet vererek çağırıyor, besleme `takeToVan`ı). Onlara mutlak hedef mantığını
 * zorlamak, kendi tabanı olmayan çağıranlara olmayan bir soru sordurmak olurdu.
 */
export async function setVanQty(
  db: SupabaseClient,
  input: {
    /** Malın alındığı/geri konduğu ÇIKIŞ TESİSİ — seferin rotasından gelir. */
    warehouseId: string;
    vehicleWarehouseId: string | null;
    variantId: string;
    /** Araçta OLMASI istenen adet. */
    targetQty: number;
    /** İstemcinin O ANDA gördüğü adet — doğrulanacak iddia. */
    observedQty: number;
    actorId?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<SetVanQtyOutcome> {
  if (input.vehicleWarehouseId === null) return { status: 'no_vehicle' };

  const current = await vanQtyOfVariant(db, input.vehicleWarehouseId, input.variantId);
  if (current === input.targetQty) return { status: 'ok', variantId: input.variantId, delta: 0, vanQty: current };
  if (current !== input.observedQty) return { status: 'stale', variantId: input.variantId, vanQty: current };

  const diff = input.targetQty - current;
  const ortak = {
    warehouseId: input.warehouseId,
    vehicleWarehouseId: input.vehicleWarehouseId,
    variantId: input.variantId,
    actorId: input.actorId ?? null,
    idempotencyKey: input.idempotencyKey,
  };
  const sonuc = diff > 0 ? await takeToVan(db, { ...ortak, qty: diff }) : await returnFromVan(db, { ...ortak, qty: -diff });
  if (sonuc.status !== 'ok') return sonuc;

  /* `delta` İŞARETLİ ve `movedQty`den TÜRÜYOR, `diff`ten değil: tekrar eden istekte hareket
     yazılmaz ve `movedQty` sıfır gelir (`takeToVan`ın `deduped` dalı). `diff`i yazsaydık
     yazılmamış bir hareketi yazılmış gösterirdik. */
  return {
    status: 'ok',
    variantId: sonuc.variantId,
    delta: diff > 0 ? sonuc.movedQty : -sonuc.movedQty,
    vanQty: sonuc.vanQty,
  };
}
