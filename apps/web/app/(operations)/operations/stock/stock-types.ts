// Stok ekranı view-model'leri (09.13) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR (`&` ile), DB alanları elle yeniden yazılmaz.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: "yaklaşan tarihli mi", "teklife açılabilir
// mi", "kalan raf ömrü %" hepsi `domain-core/stock`'un cevabıdır. Client bunları yeniden hesaplasaydı
// iki takvim doğardı — tarayıcının saati ile sunucunun saati ayrıldığında ekran, sunucunun izin
// vermediği bir eylemi sunar hâle gelirdi.
import type {
  KeysetCursor,
  RecallHit,
  StockMovementDetail,
  StockMovementKind,
  StockWriteOffReason,
  StorageAreaKind,
} from '@lezzet/types';
import type { ReturnDrop } from '@lezzet/application';
import type { BatchView } from '@/lib/stock/batch-types';
import type { StockLevelRow } from '@/lib/stock/level-rows';
import type { LossPeriod, StockScope, StockTab } from './stock-url';
import type { TransfersPageView } from './transfer-types';

// Parti görünümü İKİ ekranın ortak tipi (stok · fiyatlar) — tanımı `lib/stock`'ta, burada yalnız
// yeniden veriliyor: bu klasördeki 30+ kullanım yerinin yolu değişmesin.
export type { BatchView } from '@/lib/stock/batch-types';

// Seviye satırı da AYNI devri yaşadı (16.08): ürünler önizlemesinin stok bakışı satırı paylaşınca
// tanım `lib/stock/level-rows`a taşındı — bu klasördeki kullanım yerlerinin yolu değişmesin.
// (Kırılım tipi `StockWarehouseSplit`i yalnız lib ve ortak panel okuyor; burada yeniden verilmez.)
export type { StockLevelRow } from '@/lib/stock/level-rows';

/**
 * Rampaya dönmüş koli — kapının dökümü + masaüstünün iki ekstrası (10.5). Kapı tipini yeniden
 * yazmıyoruz: satır alanı eklendiğinde iki tanım sessizce ayrışırdı (`returns.ts` künyesindeki
 * `toDropLine` dersi).
 */
export type ReturnDropView = ReturnDrop & {
  /** Çözülmüş depo adı; `null` = depo kaydı silinmiş (kimliği yine satırda durur). */
  warehouseName: string | null;
  /** Akıbeti BEKLEYEN satır sayısı — rozetin sayısı; toplam satır değil. */
  pendingLineCount: number;
};

/**
 * Hareket defteri satırı — kayıt + çözülmüş adlar; maliyet cent'e indirgenmiş.
 *
 * Ad `LossRow` kaldı ama kapsamı büyüdü (06.14): eskiden yalnız imha/sayım kayıtlarıydı, artık
 * satış, kapı satışı, sevk ve kabul de aynı satır tipiyle geliyor. Yön `direction` alanında.
 */
export type LossRow = StockMovementDetail & {
  title: string;
  /** POZİTİF — yön `direction`da. `null` = partinin alış fiyatı girilmemiş (0 ile karıştırılmaz). */
  costCents: number | null;
  /**
   * Hareketin deposu — tasarım §2 satırda istiyor ve veri hep vardı, yalnız çizilmiyordu.
   * `null` = depo kaydı silinmiş (kimliği yine satırda durur).
   *
   * İkisi birden taşınır çünkü ekranın ihtiyacı ikisi: dar sütunda KOD görünür (`STR`), tam ad
   * `title`da okunur. Tek başına ad sütunu taşırıyordu (ölçüldü 27.08).
   */
  warehouseCode: string | null;
  warehouseName: string | null;
  /**
   * Kaydı giren personelin adı. `created_by` FK TAŞIMAZ (0010: "personel kimliği auth şemasında"),
   * bu yüzden gömülü `select` ile gelemiyor — sayfadaki kimlikler tek turda ayrıca çözülür.
   * `null` = kayıt kimin girdiği yazılmadan açılmış (eski/otomatik kayıt).
   */
  actorName: string | null;
};

/**
 * Stoktan düşülebilecek parti — düşüm formunun seçeneği (22.26).
 *
 * **Alış fiyatı TAŞIMIYOR** ve bu bir ekran disiplini değil verinin şekli: tasarımın kuralı *"fire
 * maliyeti, imhanın parasal değeri asla görünmez"* — depocu adet düşer, paraya çevirmek raporların
 * işi. Alanı burada susturmak, ekranda unutmaktan güvenlidir.
 */
export interface WriteOffBatch {
  stockId: string;
  title: string;
  expiryDate: string;
  /** Eldeki fiziksel adet — "partide 3 var, 5 düşülemez" cevabını ekran önceden söyleyebilsin. */
  physicalQty: number;
  /** Son tarihi geçmiş mi — düşülecek ilk şey odur, gizlenmesi ters etki yapardı. */
  isExpired: boolean;
  /** Partinin deposu — çok depolu bakışta hangi rafın malı olduğu satırdan okunur. */
  warehouseName: string | null;
}

/**
 * Dönemin dağılımı — "bu çeyrek ne kadar, hangi türden". Sayfalı liste bu soruyu yanıtlayamaz:
 * ilk 30 satır dönemin toplamı değildir.
 *
 * **Toplam TEK YÖNLÜ ve POZİTİF** (06.14). Eskiden çıkış ve giriş aynı toplamda eriyordu ve
 * "Çıkışlar" sekmesi dönem toplamını EKSİ gösterebiliyordu (ölçüldü 27.08: `−13,49 €`) — çünkü
 * iade restoku ve sayım fazlası birer giriş olduğu hâlde aynı sayıya katılıyordu. Sekme artık
 * yönünü seçiyor; giriş satırları Mal kabul'ün toplamında.
 */
export interface LossSummary {
  /** Hareket tipi kırılımı — sekmenin yönü içinde. */
  byKind: Array<{ kind: StockMovementKind; qty: number; costCents: number }>;
  /** İmhanın içi (DLC · hasar · kayıp) — yalnız `write_off` satırlarından. */
  byReason: Array<{ reason: StockWriteOffReason; qty: number; costCents: number }>;
  qty: number;
  costCents: number;
}

/** Geri çağırma sonucu — sorgulanan partiler + onlardan çıkan siparişler. */
export interface RecallResult {
  /** Lot terimiyle eşleşen partiler (stoğu bitmişler dahil). */
  batches: BatchView[];
  hits: RecallHit[];
  /** Arama tavana dayandı mı — sessiz kırpma yok, ekran söyler. */
  truncated: boolean;
}

/** Başlık sayaçları — liste sayfalı olduğu için client türetemez, sunucudan gelir. */
export interface StockCounts {
  /** Elde partisi olan boy sayısı. */
  inStock: number;
  /** Karar bekleyen parti sayısı (yaklaşan tarihli + açık teklif). */
  attention: number;
  /** DLC'si geçmiş, yalnız imha yolu kalan parti sayısı. */
  blocked: number;
  /**
   * Kabul bekleyen açık tedarik siparişi sayısı — Mal kabul sekmesinin rozeti (22.26).
   *
   * **Sekme kapalıyken de okunur** ve bu bilinçli bir masraf: tasarımın kuralı *"'bugün ne
   * bekliyorum' bir bakışta okunmalı"* — sayıyı yalnız sekmeye girince göstermek, girmeyene hiç
   * göstermemek olurdu. Okuma tek sorgu (`openProgress`); sekmenin kendi detayları (sipariş künyesi,
   * tedarikçi listesi) yalnız sekme açıkken çekilir.
   */
  pendingIntake: number;
}

/**
 * Kabul bekleyen tedarik siparişi — Mal kabul sekmesindeki kart (22.26; `receiving-types`ten geldi).
 *
 * **Liste depo-üstüdür ve öyle kalır:** tedarik siparişi bir depoya ait değildir, mal kabul edilirken
 * bir kapıdan girer. Depo sorusu okumanın değil YAZMANIN sorusudur — cevabı kabul diyaloğunda verilir
 * ve varsayılan üretilmez (`CLAUDE §1`).
 */
export interface PendingPurchase {
  purchaseOrderId: string;
  referenceNo: string | null;
  supplierName: string;
  /** Kaç kalem ısmarlandı. */
  lineCount: number;
  /** Kaç kalemin malı hâlâ gelmedi — "3/5 girildi" ilerlemesi bundan doğar. */
  missingLineCount: number;
  /** Sipariş gönderileli kaç gün oldu; "14 gündür bekliyor" uyarısı. `null` = hiç gönderilmemiş. */
  ageDays: number | null;
  /** Kısmen geldi mi. */
  isPartial: boolean;
}

/**
 * Mal kabul sekmesinin YALNIZ o sekmede okunan verisi (22.26) — `null` = sekme kapalı.
 *
 * Sayfanın her açılışında sipariş künyelerini ve tedarikçi listesini çekmek, üç sekmede bakılmayan
 * bir listeyi her seferinde kurmak olurdu. Rozetin sayısı `counts.pendingIntake`te ve o hep okunuyor
 * — yani sekmeye girmeyen de "kaç sipariş bekliyor" bilgisini kaybetmiyor.
 */
export interface IntakeTabData {
  pending: PendingPurchase[];
  /**
   * Siparişsiz kabulde seçilecek tedarikçiler — doğal tavanlı küme (operatörün elle kurduğu liste),
   * tek turda okunur ve sayfalanmaz (`CLAUDE §1`).
   */
  suppliers: Array<{ id: string; name: string }>;
  /** Kabulün yazılabileceği depolar — kapsamdan gelir; **varsayılan seçim YOK** (`CLAUDE §1`). */
  warehouseOptions: Array<{ id: string; name: string }>;
  /**
   * Çalışılan deponun AKTİF stoklama alanları (19.29) — partinin rafı buradan seçilir, yazılmaz.
   * `kind` taşınıyor çünkü form "donuk ürün oda sıcaklığı alanına konuyor" uyarısını kuruyor.
   */
  storageAreas: Array<{ id: string; name: string; kind: StorageAreaKind }>;
  /** Bağlamda tek depo seçiliyse onun kimliği — diyalogda ÖN SEÇİLİ gelir, sorulmadan yazılmaz. */
  warehouseId: string | null;
  /** Kabul edilenler defterinin İLK sayfası (22.28) — en yeni önce. */
  received: ReceivedIntake[];
  /** Defterin devamı; `null` = son sayfa. Sessiz kırpma yok, ekran "daha var" diyebilmeli. */
  receivedCursor: KeysetCursor | null;
}

/**
 * **Kabul edilmiş bir giriş — defterin satırı** (22.28).
 *
 * Sekmenin ikinci sorusu: "ne bekliyorum"un yanında **"ne geldi"**. Cevabı olmayan bir depo ekranı,
 * az önce yazdığı kaydı bir daha göremeyen bir operatör demektir — ve göremeyen operatör, tereddüt
 * ettiğinde aynı malı ikinci kez girer.
 *
 * **Para YALNIZ `canSeeCost` ile taşınır** ve alanın `null` olması iki şey demek DEĞİL: burada
 * "gösterilmiyor" demek, "sıfır" değil (`CLAUDE §1` — ölçülemeyen değer sıfır değildir). Depoya
 * bağlı personelde sunucu bu alanı hiç doldurmaz; ekran isteseydi bile gösteremez.
 */
export interface ReceivedIntake {
  id: string;
  /** İRSALİYE günü — operatörün girdiği tarih; geriye dönük olabilir (sıra `createdAt`ten gelir). */
  date: string;
  /** Kaydın yazıldığı an — defterin sırası budur; "az önce ne girdim" sorusunu o cevaplar. */
  createdAt: string;
  /** Tedarikçi adı; `null` = tedarikçisiz giriş (dökme/plansız). */
  supplierName: string | null;
  /** Bağlı tedarik siparişinin numarası; `null` = siparişsiz kabul. */
  purchaseRef: string | null;
  /** Malın girdiği depo — kayıt bu kapıya takılıdır (`StockIntakeSchema.warehouseId` künyesi). */
  warehouseName: string | null;
  /** Kaç parti doğdu (kalem sayısı) ve toplam kaç paket girdi. */
  lineCount: number;
  qty: number;
  note: string | null;
  /** Girişin parasal toplamı — **yalnız depo-üstü kapsamda dolu**; `null` = gösterilmiyor. */
  totalAmountCents: number | null;
}

/** Kategori seçeneği — süzgeç menüsünü besler (tavanı sınırlı, tek turda gelir). */
export interface CategoryOption {
  id: string;
  name: string;
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface StockData {
  /** Seviyelerin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır. */
  levels: StockLevelRow[];
  /**
   * `?v=` ile seçili boyun HEDEFLİ okuması — liste sayfalı olduğundan seçili boy ilk sayfada
   * olmayabilir; sağ panel o zaman buradan beslenir. `null` = parametre yok ya da satır zaten listede.
   */
  pinned: StockLevelRow | null;
  nextCursor: KeysetCursor | null;
  /** Karar bekleyen TÜM partiler — sayfalanmaz; bir partiyi kaçırmak imhalık malı satmaktır. */
  attention: BatchView[];
  /**
   * **Depoya dönen, akıbeti bekleyen koliler** (10.5) — yalnız Dikkat sekmesi açıkken dolu.
   *
   * Dikkat kuyruğunun dördüncü grubudur ve orada olması bir yerleşim tercihi değil: sekmenin sorusu
   * *"hangi mala bugün ne yapacağım"* ve rampada karar bekleyen koli tam olarak o soru. Ayrı bir yer
   * açmak aynı soruyu iki ekrana bölerdi.
   */
  returns: ReturnDropView[];
  /**
   * Parti karışma sinyali (23.9): aynı varyantın aynı depoda 2+ açık partisi olan durum sayısı —
   * lot etiketi kararının SAYISAL ölçütü (etüt §1.10). Tüm partiler üzerinden, süzgeçsiz: sinyal
   * bir izlemedir, görünüm tercihi değil.
   */
  mixedLotCount: number;
  losses: LossRow[];
  lossCursor: KeysetCursor | null;
  /** Düşüm formunun parti seçenekleri — yalnız Çıkışlar sekmesi açıkken dolu (form orada açılıyor). */
  writeOffBatches: WriteOffBatch[];
  /** Seçili dönemin toplamı ve sebep kırılımı — dönemin TAMAMI üzerinden, sayfadan değil. */
  lossSummary: LossSummary;
  counts: StockCounts;
  /** Mal kabul sekmesinin verisi — yalnız o sekme açıkken dolu (yukarıdaki künye). */
  intake: IntakeTabData | null;
  /** Transfer sekmesinin verisi — yalnız o sekme açıkken dolu (intake ile aynı künye). */
  transfers: TransfersPageView | null;
  /**
   * Yoldaki sevkiyat sayısı — sekme ROZETİ, her sekmede okunur (intake rozetinin emsali:
   * "bugün ne bekliyorum bir bakışta"). Kapsamla süzülmüş: depocu yalnız kendini ilgilendireni sayar.
   */
  transitCount: number;
  /**
   * **Alış fiyatı/maliyet görünür mü** — depo-üstü kapsamda (yönetici/muhasebe) evet, depoya bağlı
   * personelde hayır (`design/pages/admin-stok.md §6`).
   *
   * Bayrak yalnız ÇİZİMİ yönetir; yetkinin kendisi sunucudadır — kaydeden kapı kapsamı yeniden
   * sorup depoya bağlı personelin gönderdiği maliyeti düşürüyor (`receiveIntakeAction`). Ekran
   * gizlemek bir yetki kontrolü değildir.
   */
  canSeeCost: boolean;
  categories: CategoryOption[];
  /**
   * Kararın verildiği eşik (`Setting`) — ekranda YAZILI durur. "Neden bu parti listede" sorusu
   * ayarlara gitmeden yanıtlanabilmeli; ayrıca temiz hâlde "acaba uyarı mı çalışmıyor" şüphesini keser.
   */
  nearExpiryPercent: number;
  warehouse: StockWarehouseView;
}

/** Listenin depo ekseni — kırılım çizilir mi, süzgeç var mı, hangi depoya süzülü (19.5). */
export interface StockWarehouseView {
  /**
   * Başlıktaki evren adı — BAĞLAMIN adı ("Tüm depolar" / "Kehl — sınır deposu"), süzgecin değil.
   * Boş = tek depolu kurulum, eksen hiç görünmez.
   */
  scopeLabel: string;
  /** Satırda "N depoda" ipucu ve açılır kırılım görünür mü (kural 4). */
  showSplit: boolean;
  /** Süzgeç kontrolü çizilir mi (kural 2: yalnız bağlam "tüm depolar" iken). */
  available: boolean;
  active: { id: string; code: string; name: string } | null;
  /** Adresten gelen ama bağlama uymadığı için düşen kod (kural 7). */
  dropped: string | null;
  options: Array<{ id: string; code: string; name: string }>;
}

/**
 * stock-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir.
 *
 * `levels` SÜZÜLMÜŞ listedir (parti süzgeci client'ta, çünkü ölçüt sunucudan gelen bir karardır);
 * `data.levels` ise ham ilk sayfadır. İkisi ayrı tutulur ki sayaçlar süzgeçten etkilenmesin.
 */
export interface StockViewProps {
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * Bu ekranda sekme değişimi ÇOĞUNLUKLA sığdır (`replaceState`, sunucuya gitmez); bayrak yalnız
   * gerçekten gezinilen hâllerde (arama terimi varken sekme, ya da süzgeç) doluyor.
   */
  navPending: boolean;
  data: StockData;
  levels: StockLevelRow[];
  tab: StockTab;
  onTab: (t: StockTab) => void;
  search: string;
  onSearch: (q: string) => void;
  catFilter: string;
  onCatFilter: (id: string) => void;
  scope: StockScope;
  onScope: (s: StockScope) => void;
  /** Seçili depo KODU ('' = tümü) — adreste yaşar, bağlamdan ayrıdır (19.5). */
  warehouseFilter: string;
  onWarehouseFilter: (code: string) => void;
  hasMoreLevels: boolean;
  loadingLevels: boolean;
  onLoadMoreLevels: () => void;
  losses: LossRow[];
  hasMoreLosses: boolean;
  loadingLosses: boolean;
  onLoadMoreLosses: () => void;
  /**
   * Kabul defteri (22.28) — ilk sayfa + elde biriken devamı, TEK liste hâlinde.
   *
   * `data.intake.received` doğrudan okunmuyor: o yalnız sunucunun son turudur ve sekme ondan
   * beslenseydi "daha fazla" düğmesi hiçbir şey yapmıyor gibi görünürdü (`losses` ile aynı desen).
   */
  received: ReceivedIntake[];
  hasMoreReceived: boolean;
  loadingReceived: boolean;
  onLoadMoreReceived: () => void;
  period: LossPeriod;
  onPeriod: (p: LossPeriod) => void;
  selectedId: string | null;
  onSelect: (variantId: string) => void;
  /**
   * Depo kırılımı açık olan boy — aynı anda TEK satır açılır (19.5).
   *
   * Hepsi açılabilseydi liste varyant×depo düz listesine dönerdi ve tam olarak kaçınılan şey o:
   * kırılım bir detaydır, tarama düzeninin kendisi değil.
   */
  openVariantId: string | null;
  onToggleSplit: (variantId: string) => void;
  /** Teklif diyaloğunu bu parti için aç. */
  onOpenOffer: (stockId: string) => void;
  /**
   * Mal kabul formunu aç — sipariş kimliğiyle (siparişten kabul) ya da `null` (irsaliyesiz kabul).
   * İkisi AYNI formdur; kip satırların `expectedQty`sinden okunur.
   */
  onOpenIntake: (purchaseOrderId: string | null) => void;
  /** Stoktan düş tutanağını aç; parti verilirse o satırla dolu başlar (satırdan gelen kısayol). */
  onOpenWriteOff: (stockId?: string) => void;
  /** Geri çağırma sorgusunu aç. Lot verilirse kutu DOLU açılır — satırdaki numarayı elle yeniden
   *  yazdırmak, acil bir akışta en gereksiz adımdır. */
  onOpenRecall: (lot?: string) => void;
  /**
   * Asistan önerisinden gelindi ama devredilen parti LİSTEDE YOK (22.5); `null` = sorun yok.
   *
   * Yalnız bu hâl sayfaya iner: parti bulunduğunda künye teklif diyaloğunun içinde durur, çünkü
   * pencere kendiliğinden açılıp sayfayı örtüyor — arkada kalan künyeyi kimse okuyamaz.
   */
}

