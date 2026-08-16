import type { Carrier, Channel, DeliveryType, OrderStatus } from '@lezzet/types';

// Sevkiyatçının gün planının görünüm modeli (09.15) — `design/pages/admin-teslimat.md`.

/**
 * Hazırlık kademeleri. `returned` bir hazırlık hâli değil ama satırın AKIBETİ ve gizlenmemeli.
 *
 * **`on_the_way` sonradan eklendi** (düzeltme 16.08, ekranda ölçüldü): `out_for_delivery` durumu
 * `prepOf`un son satırına düşüp **"Hazır"** diye okunuyordu — yani *"depoda, yüklenmeye hazır"*.
 * Oysa mal araçtaydı. Görünmez bir yan etkisi de vardı: o satırda *"başka güne taşı"* düğmesi
 * sessizce kayboluyordu (yola çıkmışın günü değişmez — kural doğru, gerekçe görünmez).
 */
export type PrepStage = 'not_started' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'returned';

/**
 * Günün bir çıkışı. **Rota ve kargo AYNI tipi paylaşıyor** çünkü ikisi de aynı soruya cevap veriyor:
 * "bugün bu müşteriye ne gidiyor, hazır mı, kimde". Ayrıştıkları yer alanların DOLULUĞU — kargoda
 * taşıyıcı/takip dolu ve kapıda tahsilat hiç yok (K37), rotada tersi. İki ayrı tip yazmak, ortak
 * olan on alanı iki kez yazmak olurdu.
 */
export interface DispatchStopView {
  orderId: string;
  referenceNo: string | null;
  /**
   * Durağın KENDİ teslim günü. Günün listesinde bakılan günle aynıdır ve orada okunmaz; **askıda
   * kalan** satırlarda ise haberin kendisidir (*"15 Ağustos'tan kalmış"*). Kargoda `null` — orada
   * teslim günü bizim vaadimiz değil taşıyıcınındır.
   */
  deliveryDate: string | null;
  customerName: string;
  /**
   * **B2B mi B2C mi** (16.08) — Siparişler tablosundan alındı ve sebebi tahsilat: kurumsal müşterinin
   * ödemesi vadeli olabiliyor, yani "kapıda ne olacak" sorusunun cevabı kanala göre değişiyor.
   * Sevkiyatçı kuryeyi yola çıkarırken bunu bilmek zorunda; ad tek başına söylemiyor
   * (*"Restaurant Bosphore"* kurumsal görünür ama *"Julien Fischer"* bir esnaf da olabilir).
   */
  channel: Channel;
  deliveryType: DeliveryType;
  status: OrderStatus;
  /**
   * Hazırlık kademesi — DÖRT hâl, iki değil (tasarımın kendi sözlüğü: Hazır · Hazırlanıyor · Hazır
   * değil · Teslim). İkiye indirmek "hiç başlanmamış" ile "depoda hazırlanıyor"u aynı gösterirdi;
   * oysa sevkiyatçının kararı tam olarak bu farkta: biri beklemeye değer, öteki müdahale ister.
   *
   * Hazırlık DEPO ekranının işi; burada yalnız OKUNUR (tasarım §6).
   */
  prep: PrepStage;
  courierId: string | null;
  /** Atanmamışsa `null`; gün başında normal, araç çıkarken kalmamalı. */
  courierName: string | null;
  /**
   * **Kapıda tahsil edilecek** (cent); `null` = kapıda para konuşulmayacak. Kargoda HER ZAMAN null
   * (K37), sonuçlanmış siparişte de null — kurye oradan ayrıldı.
   *
   * ⚠ `null` **"ödendi" DEMEK DEĞİL** ve tablo bir süre öyle okuyordu (düzeltme 16.08): dün teslim
   * edilmiş bir sipariş "Ödendi" yazıyordu, oysa 6,00 € tutarın 0,00 €'su tahsil edilmişti. Ödenip
   * ödenmediğini `outstandingCents` söyler.
   */
  dueAmountCents: number | null;
  /**
   * **Hâlâ ödenmemiş tutar — aşamadan bağımsız** (cent, 0 = ödendi). `dueAmountCents`ten farkı
   * sorduğu soru: o *"kapıda para konuşulacak mı"*, bu *"bu siparişin borcu var mı"*. Sonuçlanmış
   * siparişte birincisi null olur ama ikincisi dolu kalabilir — o kalan bir BORÇTUR.
   */
  outstandingCents: number;
  /**
   * **Toplam ADET** — kalem satırı sayısı DEĞİL (düzeltme 16.08).
   *
   * Alan `itemCount` idi ve `order_item` satırlarını sayıyordu; ekranda ölçüldü: günün dört
   * siparişinin dördü de *"1 kalem"* yazıyordu, oysa gerçek adetler 1 · 2 · 3 · 4'tü. Sevkiyatçının
   * sorusu *"araca ne kadar yer lazım"* ve satır sayısı ona hiçbir şey söylemiyor — üstelik dört
   * farklı yükü eşit gösteriyordu.
   *
   * **Kalem DÖKÜMÜ yine yok:** kutuyu araçtan alan kurye ve onun ekranı zaten taşıyor
   * (`CourierStop.contentSummary`); burada gereken tek şey büyüklük.
   */
  unitCount: number;
  /** Kargo künyesi — yalnız OKUNUR; girişi hazırlık ekranının kaydıdır (07.12, tasarım §2). */
  carrier: Carrier | null;
  trackingNumber: string | null;
  /**
   * **Bölge artık satırın ALANI, grubun başlığı değil** (16.08).
   *
   * Liste bölge bölge gruplanıyordu ve bölgesi çözülemeyen sipariş "son gruba" düşüyordu — yani en
   * çok bakılması gereken satır, adı olmayan bir başlığın altında sessizleşiyordu. Kolon olunca
   * ekrandaki her satır kendi bölgesini söylüyor ve `null` olan amber görünüyor: *"bu sipariş
   * hiçbir rotaya düşmedi"* bir eksiklik hâlidir, boşluk değil.
   *
   * Gruplamanın gerekçesi (*"iki ayrı araç, iki ayrı yükleme"*) kaybolmadı: satırlar bölgeye göre
   * sıralı geliyor ve depo adı yanında duruyor.
   */
  zoneId: string | null;
  zoneName: string | null;
  /** Bölgenin çıkış deposu — aracın hangi tesisten yükleneceği (`null` = bölgesi yok). */
  warehouseName: string | null;
}

export interface DispatchDayView {
  date: string;
  /** Sunucunun "bugün"ü — gün seçicinin etiketleri buna göre ("Bugün"/"Yarın"). */
  today: string;
  /**
   * Araçla giden — **düz liste, bölgeye göre SIRALI** (16.08). Bölge artık satırın kolonu
   * (`DispatchStopView.zoneName` künyesi); gruplama kalktı çünkü bölgesizler adsız bir başlığın
   * altında kayboluyordu.
   */
  route: DispatchStopView[];
  /**
   * **Kargo KUYRUĞU — günün listesi değil.** `delivery_date` kargoda şema gereği NULL'dur
   * (`0012_order.sql`: *"rota günü; kargoda null"*), çünkü kargoda teslim tarihi bizim vaadimiz
   * değil taşıyıcınındır. Gün süzgeciyle okunsaydı bu bölüm hiçbir zaman satır döndürmezdi — ölü
   * bir bölüm, üstelik "bugün kargo yok" diye YALAN söyleyen bir bölüm olurdu.
   *
   * Doğrusu bir kuyruk: **hazırlanmış ve henüz taşıyıcıya verilmemiş** paketler. Tasarım §2 farkı
   * zaten yazıyor ("kargonun günü rotanınkinden farklı çalışır… ekran bu farkı gizlemez") — ekran
   * da gizlemiyor, kuyruk olduğunu söylüyor.
   */
  shipping: DispatchStopView[];
  /** Kuyruk tavana dayandı mı — sessiz kırpma yok, ekran "daha var" diyebilmeli. */
  shippingTruncated: boolean;
  /**
   * **ASKIDA KALANLAR — teslim günü GEÇMİŞ ama sonuçlanmamış rota siparişleri** (kullanıcı kararı
   * 16.08: *"görünür devir — sevkiyatçı karar verir"*).
   *
   * ── NEDEN VAR: SİPARİŞ KAYBOLABİLİYORDU ────────────────────────────────────
   * Ölçüldü (16.08, seed değil AKIŞ): `out_for_delivery`den çıkışın üç kapısı da bir kurye eylemi
   * ister (`status-machine`: `delivered` · `ready` · `returned`), ve `delivery_date`'i yazan yalnız
   * iki yer var — sipariş verilirken (`place-order`) ve sevkiyatçının elle taşıması
   * (`moveDeliveryDayAction`, ki o da `out_for_delivery`'yi REDDEDİYOR). Arada hiçbir otomatik yol
   * yok: on iki zamanlanmış işin hiçbiri siparişe dokunmuyor, `order` tablosundaki iki trigger da
   * `status`/`delivery_date` yazmıyor, `startCourierDay` ertesi gün yalnız O GÜNÜN siparişlerini
   * okuyor. Yani kurye bir durağı işaretlemeden günü bitirirse sipariş KALICI OLARAK yetim kalıyordu:
   * mal rezerve, para tahsil edilmemiş, müşteri bekliyor — ve hiçbir ekranda görünmüyor.
   *
   * **Daha yaygın ikinci hâl:** kurye *doğru davranıp* "ulaşılamadı" işaretlese bile durum `ready`'ye
   * döner ama `delivery_date` DÜNDE kalır. Kodun kendi yorumu *"sipariş yarın yeniden denenir"*
   * diyordu; yarını yazan yoktu.
   *
   * **Devir SESSİZ DEĞİL:** tarih kendiliğinden ilerlemiyor — müşteriye verilen gün sözü haber
   * verilmeden değişmemeli. Ekran satırı görünür kılıyor, günü sevkiyatçı yazıyor.
   */
  stranded: DispatchStopView[];
  /** Askıda listesi tavana dayandı mı. Uzunsa asıl haber odur — sessiz kırpma yok. */
  strandedTruncated: boolean;
  /** Atama listesi — `listByRole('courier')`. */
  couriers: { id: string; name: string }[];
  /**
   * **Günün künyesi + ENGELLERİ** — iki ayrı küme, tek nesnede (16.08, kullanıcı kararı: *"üstte
   * karar, altta sayaç"*).
   *
   * Eski hâl dört sayaçtı (`total · ready · unassigned · door…`) ve üçü aynı soruyu üç kez soruyordu:
   * ekranda `ÇIKIŞ 4` · `HAZIR 2/4` · `4 durak` yan yana yazılıyordu — **aynı sayı 250 piksel içinde
   * üç kez.** Ayrıca `ready` bir ENGELİN tersiydi; engelin kendisini (kaç tanesi hazır DEĞİL) hiçbir
   * yerde vermiyordu, okuyan taraf her seferinde çıkarma yapıyordu.
   *
   * Şimdi ayrım şu: **künye** günün ne olduğunu söyler (durak, yük, hangi depodan, liste kesin mi),
   * **engel** ise sevkiyatçının araç çıkmadan kapatması gerekenleri. Engel yoksa şerit sessizce
   * "çıkabilir" der — sayı basmaz.
   */
  summary: {
    /** Rota durağı sayısı. Kargo BURAYA GİRMEZ: paket bir durak değil (kendi alanı var). */
    stops: number;
    /** Toplam ADET — *"araca ne kadar yer lazım"*. Satırlarda vardı, künyede yoktu. */
    units: number;
    /**
     * Yükleme yapılacak depolar, adlarıyla ve tekilleştirilmiş. Tasarım §4 çok depolu günü *"iki
     * ayrı araç, iki ayrı yükleme"* diye tanımlıyor — bu karar künyeden okunmalı, satırları
     * tarayarak değil.
     */
    warehouses: string[];
    /**
     * Hazır olmayan durakların MÜŞTERİ ADLARI (`not_started` + `preparing`), tekilleştirilmiş —
     * depo yetişmedi; sevkiyatçı bekler. Sayı değil ad tutuluyor çünkü uyarı bir sayım değil bir
     * ADRES işaretidir: *"2 sipariş hazır değil"* sevkiyatçıyı listede aramaya gönderirdi.
     * Tekilleştirme burada: aynı müşterinin iki siparişi *"Claire Weber, Claire Weber"* diye
     * okunuyordu.
     */
    notReadyNames: string[];
    /** Kurye atanmamış durak. Gün başında normal, araç çıkarken kalmamalı. */
    unassigned: number;
    /** Hiçbir rotaya düşmemiş durak — araç oraya UĞRAMAZ, en sert engel bu. */
    zoneless: number;
    doorCents: number;
    doorCount: number;
    /** Kargo kuyruğu büyüklüğü — günün değil, ama gün kapanışının kontrolü (tasarım §2). */
    parcels: number;
    /** Takip numarası yazılmamış paket: *"paket çıkmış ama müşteri bilmiyor"* (tasarım §4). */
    parcelsUntracked: number;
    /** Önceki günlerden askıda kalan sipariş — engellerin EN SERTİ (`stranded` künyesi). */
    stranded: number;
  };
  /**
   * Kesim saatinin o güne etkisi (tasarım §2): **liste kesinleşti mi, hâlâ büyüyebilir mi.**
   * Saat ayarlardan gelir ve burada DEĞİŞTİRİLMEZ; ekran yalnız etkisini gösterir.
   */
  cutoff: { time: string; settled: boolean };
  /** Siparişin taşınabileceği yaklaşan günler — motordan (`upcomingDeliveryDates`), bölge başına. */
  moveDatesByZone: Record<string, string[]>;
}

export interface DispatchViewProps {
  day: DispatchDayView;
  /** Toplu atama için seçili sipariş kimlikleri. */
  selected: string[];
  onToggle: (orderId: string) => void;
  /** Başlıktaki "tümü" kutucuğu — bölge grubunun kutucuğunun yerini aldı (16.08, gruplama kalktı). */
  onToggleAll: () => void;
  onAssign: (courierId: string | null) => void;
  onMove: (orderId: string, date: string) => void;
  /**
   * Askıda kalan siparişi bir güne yazma. `onMove`'dan AYRI bir eylem çünkü fazladan bir iş yapıyor:
   * durum `out_for_delivery`de takılıysa önce onu çözüyor (araç döndü, durak sonuçlanmadı).
   */
  onBringForward: (orderId: string, date: string) => void;
  onDate: (date: string) => void;
  busy: boolean;
  error: string | null;
}
