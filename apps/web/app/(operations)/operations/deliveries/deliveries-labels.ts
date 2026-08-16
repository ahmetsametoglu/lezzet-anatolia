import type { Carrier, PaymentMethod } from '@lezzet/types';
import type { StopOutcome } from '@/lib/courier/day';
import type { OpsTone } from '@/components/operation/ui/tone';
import { money } from '@/components/operation/ui/format';
import type { DoorMethod } from './[orderId]/delivery-types';
import type { PrepStage } from './dispatch-types';

// Kurye gün ekranının SÖZLÜĞÜ. Bu yüzeyin kullanıcısı sahada, telefonda, çoğu zaman ayaküstü —
// cümleler kısa ve KAPIDAKİ dille kurulu: "bekliyor" değil sistemin `ready`'si, "ulaşılamadı" değil
// `out_for_delivery → ready` geçişi. İç terim hiç görünmüyor.

/**
 * Durağın hâli — kuryenin gördüğü, sistemin `status`'ü değil.
 *
 * Motorun künyesi ayrımı yazıyor: "ulaşılamadı" ile "henüz sıra gelmedi" **ikisi de `ready`**;
 * fark geçiş geçmişinden türetiliyor. Ekran o türetimi tekrarlamıyor, sonucunu okuyor.
 */
export const OUTCOME_VIEW: Record<StopOutcome, { label: string; tone: OpsTone }> = {
  pending: { label: 'Bekliyor', tone: 'neutral' },
  delivered: { label: 'Teslim edildi', tone: 'olive' },
  // Amber çünkü bu bir BİTİŞ değil, bir askı: mal ayrılmış kalıyor ve kurye gün içinde geri dönebilir.
  unreachable: { label: 'Ulaşılamadı', tone: 'amber' },
  // Kırmızı ama bir suçlama değil: mal depoya döndü, günün planı değişti.
  refused: { label: 'Reddedildi', tone: 'red' },
};

/** Sonuçlanmış mı — ilerleme sayacı ve sıralama bunu soruyor. */
export function isSettled(outcome: StopOutcome): boolean {
  return outcome !== 'pending';
}

export const NOTES = {
  emptyDay:
    'Bugün size atanmış teslimat yok. Plan gün içinde değişebilir — sevkiyat yeni durak eklerse listeyi yenileyince görünür.',
  allDone: 'Günün bütün durakları sonuçlandı. Kasa mutabakatı için gün kapanışına geçebilirsiniz.',
  /** Ulaşılamayanlar listede KALIR — kaybolmaları, geri dönülecek adresi unutturur. */
  retryHint: 'Ulaşılamayan duraklar listede kalır; gün içinde geri dönebilirsiniz.',
  /** Kapıda ödeme yoksa para hiç konuşulmaz (tasarım §2). */
  prepaid: 'Ödendi — kapıda para konuşulmaz',

  // ── Kapıdaki durak (11.2/11.3/11.4) ───────────────────────────────────────
  /** Yola çıkmadan hiçbir sonuç yazılamaz — düğmenin altındaki tek cümlelik sebep. */
  notOnTheWay: 'Bu durak henüz yola çıkmış görünmüyor. Teslim, tahsilat ve "ulaşılamadı" işaretleri yoldaki siparişe yazılır.',
  /** Kanıt bölümünün başlık yanı — neyin, neden istendiği tek satırda. */
  proofAside: 'imza ya da fotoğraf · ihtilafta açılan şey bu',
  /**
   * Kanıt zorunlu ama henüz alınmamış. Cümle NE eksik olduğunu söylüyor; "kanıt gerekli" demek
   * kuryeyi düğmeye bakıp sebebini aramaya bırakırdı.
   */
  proofMissing: 'Bu kanalda teslim imza ya da fotoğraf ister. Kanıt alınmadan "Teslim ettim" açılmaz.',
  /** Hesap seçilmemişse tahsilat yazılamaz; teslim yine de kapanabilir, borç açık kalır. */
  noDoorAccount:
    'Kapı tahsilat hesabı seçilmemiş (Ayarlar → Ödeme). Para kaydı yazılamaz; teslim kapatılabilir ama borç açık kalır.',
  /** Nakit yasal eşiği — UYARI, engel değil (DOMAIN §7). */
  cashLimit: (limitCents: number): string =>
    `Nakit yasal uyarı eşiğinin (${money(limitCents)}) üstündesiniz. Tahsilat tamamlanabilir; mümkünse kart ya da çek önerin.`,
  /** Eksik tahsilat sessizce yutulmaz: kalan borç açıkça yazılır. */
  partialCollection: (remainingCents: number): string => `${money(remainingCents)} borç açık kalacak.`,
  /** İki sonucun stok akıbeti — kurye doğru olanı seçebilsin diye pencerenin başlığında yazar. */
  unreachableEffect: 'Mal araçta kalır, sipariş yeniden teslim edilmek üzere bekler.',
  refusedEffect: 'Mal depoya döner; rafa dönüş ya da imha kararı depocunundur.',
} as const;

/**
 * Ödeme yöntemi — kuryenin hazırlığı buna göre (üstü var mı, POS gerekir mi).
 *
 * Anahtarlar `PaymentMethodEnum`'un kendisidir; `Record<PaymentMethod, …>` olması bir yazım tercihi
 * değil bir nöbet: eskiden serbest `Record<string, …>` idi ve iki anahtar şemayla ayrışmıştı
 * (`check`/`transfer` yazılmış, şemada `cheque`/`bank_transfer`) — çek bekleyen kapıda ekran ham
 * `cheque` yazıyordu. Tip artık ayrışmayı derlemede yakalar.
 */
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'nakit',
  card: 'kart',
  cheque: 'çek',
  bank_transfer: 'havale',
  online: 'online',
};

/**
 * Sevkiyatçının gün planının sözlüğü (09.15). İç terim ham kullanılmaz (tasarım §6): "bölge",
 * "teslim günü", "sipariş kesim saati" denir — `DeliveryZone`, `delivery_date`, `cut-off` değil.
 */
export const DISPATCH_NOTES = {
  /** Kesim saati geçti: liste artık araç yüklenirken büyümez — bu bir güven cümlesidir (tasarım §2). */
  settled: 'Bu günün listesi kesinleşti — sipariş kesim saati geçti, yeni sipariş bu güne düşmez.',
  open: (time: string): string =>
    `Liste hâlâ büyüyebilir: ${time}'a kadar gelen sipariş bu güne düşer, sonrası bir sonraki teslim gününe.`,
  /**
   * **Engel şeridinin cümleleri — KISA ve PARALEL** (16.08). Şerit bir kontrol listesidir, açıklama
   * metni değil: yan yana dizilen dört cümle tek bakışta taranmalı. Eski hâlde hazırlık uyarısı tek
   * başına bir bant kaplıyordu ve talimatını da taşıyordu (*"hazırlık depoda; araca yüklemeden önce
   * bekleyin"*) — şeride girince o kuyruk satırı taşırıyordu ve gereksizdi: amber ton zaten
   * "yükleme" demiyor.
   */
  blockers: {
    /**
     * Hazır olmayanlar ADIYLA anılır: yalnız sayı vermek sevkiyatçıyı listede aramaya gönderirdi.
     * Üçten fazlasında ad yığılır, o zaman sayıya dönülür — uyarı bir liste değil, bir işarettir.
     */
    notReady: (names: readonly string[]): string =>
      names.length <= 3 ? `${names.join(', ')} hazır değil` : `${names.length} sipariş hazır değil`,
    unassigned: (count: number): string => `${count} sipariş kuryesiz`,
    /** Askıda kalan — engellerin EN SERTİ: bugünün değil, geçmişin borcudur. */
    stranded: (count: number): string => `${count} sipariş önceki günlerden askıda`,
    /** Hiçbir rotaya düşmemiş durak: araç oraya UĞRAMAZ. Engellerin en serti. */
    zoneless: (count: number): string => `${count} sipariş hiçbir rotaya düşmedi`,
    untracked: (count: number): string => `${count} pakette takip numarası yok`,
  },
  /**
   * Kargonun günü rotanınkinden farklı çalışır ve ekran bu farkı GİZLEMEZ (tasarım §2). Bu bölüm bir
   * güne ait değil, bir kuyruktur: kargoda teslim günü şema gereği yoktur (`0012_order.sql`).
   */
  shipping:
    'Gün süzgeci uygulanmaz: kargoda teslim günü bizim vaadimiz değil taşıyıcınındır. Bu bir kuyruktur — hazırlanmış, henüz taşıyıcıya verilmemiş paketler. Takip numarasını hazırlık ekranı yazar.',
  shippingTruncated: 'Kuyruk tavana dayandı — burada görünenden daha fazla paket bekliyor.',
  emptyDay: 'Bu güne düşen çıkış yok. Bölgelerin haftalık günleri Depolar sayfasında tanımlanır — bugün hiçbirinin günü olmayabilir.',

  // ── Günün künyesi ve engelleri (16.08, "üstte karar altta sayaç") ─────────
  /**
   * Kesim saatinin KISA hâli — künye satırında yaşar. Uzun cümle (`settled`/`open`) kaybolmadı,
   * fareyle üzerine gelince açılıyor: künye bir kimlik satırıdır, orada iki satırlık gerekçe
   * sayıların yanında ağırlık yapıyordu (ekranda ölçüldü — sağ yarıyı kaplıyordu).
   */
  settledShort: 'liste kesinleşti',
  /**
   * Saat YALNIZ bugün için yazılır. Gelecek bir güne bakarken *"liste 16:00'a kadar açık"* okuyan
   * sevkiyatçı bugünün 16:00'ını anlar — oysa o gün için kesim başka bir günün saatidir. Saatin
   * yanlış güne yapışması, doğru bilgiyi yanlış bilgiye çevirir.
   */
  openShort: (time: string): string => `liste ${time}'a kadar açık`,
  openShortAhead: 'liste henüz açık',
  /**
   * Engel kalmadığında ŞERİT SUSMAZ, "çıkabilir" der. Boş bırakmak *"kontrol edilmedi"* diye de
   * okunurdu; sevkiyatçının aradığı şey tam olarak bu tek cümle.
   */
  readyToGo: 'Araç çıkabilir — durakların hepsi hazır ve atanmış.',
  /**
   * **Rota boş ama kargo dolu** hâli (16.08 düzeltmesi). Boş gün metni yalnız rota VE kargo birlikte
   * boşken çiziliyordu; kargo kuyruğu hiç boşalmadığı için o metin ekranda pratikte hiç görünmüyordu
   * ve boş bir güne bakan sevkiyatçı üç sıfır görüp sebebini bulamıyordu (ölçüldü: 22 Ağu).
   */
  emptyRoute: 'Bu güne rota çıkışı yok.',

  // ── Askıda kalanlar (16.08 — "görünür devir") ─────────────────────────────
  /**
   * Şeridin tek cümlelik gerekçesi. **Devrin sessiz OLMADIĞINI söylüyor:** tarih kendiliğinden
   * ilerlemiyor, çünkü müşteriye verilen gün sözü haber verilmeden değişmemeli.
   */
  strandedHint:
    'Teslim günü geçtiği hâlde sonuçlanmamış siparişler. Mal hâlâ ayrılmış ve müşteri bekliyor — günü siz yazana kadar hiçbir listeye düşmezler.',
  strandedTruncated: 'Askıda listesi tavana dayandı — burada görünenden fazlası var.',
  /** Yolda takılı kalmış: kurye ne "teslim ettim" ne "ulaşılamadı" yazmış, araç dönmüş. */
  strandedStuck: 'yolda kalmış',
  strandedWaiting: 'yola çıkmamış',
  /**
   * Bölgesi çözülemeyen askıda sipariş için hedef gün ÜRETİLEMEZ (hangi bölgenin haftalık günü
   * olacağı bilinmiyor). Satır sessiz bırakılmıyor: yapılacak iş adresin kendisindedir.
   */
  strandedNoZone: 'adres bir bölgeye düşmüyor — önce adresi düzeltin',
  noAccess: 'Günün planını kurmak ve kurye atamak yöneticinin işidir. Kuryeyseniz kendi gününüz burada açılır.',
} as const;

/**
 * Hazırlık kademesinin yüzü — tasarımın kendi sözlüğü (Hazır · Hazırlanıyor · Hazır değil · Teslim).
 * `ready` HİÇ ROZET ÇİZDİRMEZ: normal olan hâl için rozet basmak, listeyi tek renge boyayıp asıl
 * uyarıları (hazır değil) görünmez kılardı — rozet bir sapmadır, bir etiket değil.
 */
export const PREP_VIEW: Record<PrepStage, { label: string; tone: OpsTone } | null> = {
  ready: null,
  not_started: { label: 'Hazır değil', tone: 'red' },
  preparing: { label: 'Hazırlanıyor', tone: 'amber' },
  // **ROZET ÇİZER ve `ready`den ayrı durur** (16.08): bu bir sapma değil ama bir SAPMA DEĞİL de
  // değil — "depoda hazır" ile "araçta, yolda" sevkiyatçı için iki ayrı gerçek. Tonu sakin (slate):
  // uyarı değil, konum bildirimi.
  on_the_way: { label: 'Yolda', tone: 'slate' },
  delivered: { label: 'Teslim', tone: 'olive' },
  returned: { label: 'İade döndü', tone: 'slate' },
};

/** Taşıyıcı adları — ham enum değeri ekrana yazılmaz. */
export const CARRIER_LABEL: Record<Carrier, string> = {
  colissimo: 'Colissimo',
  chronopost: 'Chronopost',
  dhl: 'DHL',
  ups: 'UPS',
  other: 'diğer',
};

/**
 * Gün kapanışının sözlüğü (11.6). Ayrı bir küme çünkü buranın dili MUTABAKAT dilidir: "beklenen",
 * "sayılan", "fark". İç terim ("mutabakat kaydı", "reconciliation", "para hareketi") görünmez
 * (tasarım §6), ve fark **suçlayıcı olmayan** bir cümleyle yazılır — değerlendirme admin'in işidir.
 */
export const CLOSE_NOTES = {
  /** Sonuçlanmamış durak kapanışı ENGELLEMEZ (tasarım §4): kurye depoya döndüyse günü kapatabilmeli. */
  pending: (count: number): string =>
    `${count} durak sonuçlanmadı. Gün yine de kapatılabilir — bu duraklar yarının işine devrolur.`,
  returned: 'Bu koliler depoya fiziksel teslim edilir; rafa dönüş ya da imha kararı depo tarafında verilir.',
  /** Durağı olmayan gün kapatılmaz — karşılığı olmayan bir mutabakat kaydı "sayıldı" der, oysa sayılan yok. */
  emptyDay: 'Bugün size atanmış teslimat olmadı, dolayısıyla kasaya teslim edilecek bir şey de yok. Gün kapanışı ancak duraklı bir günde anlamlıdır.',
  noCollection: 'Bugün kapıda tahsilat yok — teslimatların tamamı önceden ödenmiş. Sayılacak para yok.',
  reconciled: 'Beklenen ile sayılan tutuyor.',
  /** İşaret ANLAMLI: eksi eksik, artı fazla. Mutlak değere indirmek iki farklı gerçeği aynı gösterirdi. */
  difference: (cents: number): string => (cents < 0 ? `${money(-cents)} eksik` : `${money(cents)} fazla`),
  totalDifference: (cents: number): string =>
    cents < 0 ? `Toplamda ${money(-cents)} eksik.` : `Toplamda ${money(cents)} fazla.`,
  closedAt: (at: string): string => `Gün ${new Date(at).toLocaleString('tr-TR')} tarihinde kapatıldı. Kayıt salt-okunur.`,
} as const;

/**
 * Kapıda SEÇİLEBİLEN yöntemler (11.3) — üçle sınırlı, çünkü online ve havale kuryenin eline hiç
 * girmez. Sıra kapıdaki sıklıktır: nakit önce.
 */
export const DOOR_METHODS: Array<{ key: DoorMethod; label: string }> = [
  { key: 'cash', label: 'Nakit' },
  { key: 'card', label: 'Kart' },
  { key: 'cheque', label: 'Çek' },
];

/**
 * Rota kurulumunun sözlüğü (19.20). **Arayüz dili tek kelime: ROTA.** Kullanıcının tanımı (07.08):
 * *"bir bölge tanımlamak = bir dağıtım güzergâhı tanımlamak."* Veri modeli adı `delivery_zone` kalır —
 * iç ad, arayüz dili değil; ekranda "bölge" demek operatörü çevirmeye zorluyordu.
 */
export const ROUTE_NOTES = {
  pickRoute: 'Soldaki haritada tanımlı güzergâhlar görünüyor. Düzenlemek için listeden bir rota seçin, ya da "+ Rota" ile yenisini kurun.',
  noCodes: 'Henüz kod yok — bu rota hiçbir adrese hizmet etmiyor.',

  // ── Haritanın lejant altı satırı ──────────────────────────────────────────
  // İki AYRI gerçeği ayrı cümlelerle söyler ve ikisi de bugün doğrudur. Tek bir "boşta kod yok"
  // cümlesi ikisini de yutardı — oysa "çizilmiyor" ile "yok" aynı şey değil (`CLAUDE.md §1`:
  // ölçülemeyen değer sıfır değildir). Operatör hangisinde olduğunu bilmeli.
  /** Eşiğin ALTINDA: sorun veri değil, noktaların ayırt edilememesi. Sebebi yazılır ki keyfi görünmesin. */
  mapTooFar: 'Bu uzaklıkta boştaki kodlar çizilmez — noktalar üst üste biner. Yakınlaşın, ayrışacaklar.',
  /** Okuma HENÜZ dönmedi ya da düştü. "Kod yok" DEĞİL: ölçülemeyen değer sıfır değildir (`CLAUDE §1`). */
  mapUnread: 'Boştaki kodlar okunuyor…',
  /**
   * Eşiğin üstünde ve okuma döndü. **`truncated` sessiz kalamaz:** kesilen kuyruk yazılmazsa
   * operatör görmediği kodu "yok" sanar ve olmayan bir boşluğa göre karar verir.
   */
  mapFree: (count: number, truncated: boolean): string => {
    if (truncated) return `${count} boşta kod çizili — ama bu alanda daha fazlası var. Yakınlaşın, hepsi görünsün.`;
    return count === 0
      ? 'Bu alanda boşta kod yok — görünen kodların tamamı bir rotada tanımlı.'
      : `${count} boşta kod çizili — rotaya eklemek için noktaya tıklayın.`;
  },
  // ── Kodların ağırlığı (analitik rayı) ─────────────────────────────────────
  /**
   * Rayın tek sorusu: *"bu kod rotada yerini hak ediyor mu?"* Ürün kırılımı, marj, geri bildirim
   * puanı ve kohort BİLEREK dışarıda — onlar Analitik'in işi ve rota kurarken verilecek kararı
   * değiştirmiyorlar. Rota ekranındaki her sayı, o ekranda verilen kararı değiştirebilmeli.
   */
  weightHint: 'Tüm zamanların siparişi. Yükü hangi kodun taşıdığını gösterir — düşük satır, güzergâhtan çıkarma adayıdır.',
  /** Henüz kaydedilmemiş kod ölçülmedi. "0 sipariş" YAZILMAZ: ölçülemeyen değer sıfır değildir. */
  weightUnmeasured: 'Yeni eklenen kodlar kaydedildikten sonra ölçülür.',
  /** Haber bekleyen KİMLİKLİ ve izinlidir; anonim talep sayacıyla toplanmaz (evi Depolar'daki tablo). */
  waiting: (count: number): string => `${count} kişi haber bekliyor`,

  // ── Öneriler ──────────────────────────────────────────────────────────────
  /**
   * Önerinin GEREKÇESİ — haritada üzerine gelince, rayda satırın altında.
   *
   * Puan YAZILMAZ, kanıt yazılır. Bir "87 puan" operatöre hiçbir şey söylemez ve sorgulanamaz;
   * *"3 kişi bekliyor · 6 sipariş gitti · 47 kez soruldu"* hem sebebi hem de büyüklüğü verir ve
   * operatör istemezse reddeder. Öneri bir emir değil, bir hatırlatmadır.
   *
   * Sıra sinyalin AĞIRLIĞINA göre: bekleyen kişi (iletişim bilgisi verdi) → sipariş (ödedi) →
   * soru (yalnız yazdı). Boş sinyal cümleye HİÇ girmez; "0 sipariş" yazmak gerekçeyi seyreltirdi.
   */
  suggestionReason: (parts: { waitingCount: number; orderCount: number; requestCount: number }): string =>
    [
      parts.waitingCount > 0 ? `${parts.waitingCount} kişi haber bekliyor` : null,
      parts.orderCount > 0 ? `${parts.orderCount} sipariş gitti` : null,
      parts.requestCount > 0 ? `${parts.requestCount} kez soruldu` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  /** Rayın başlığı altındaki tek cümle: önerinin ne OLMADIĞINI da söyler. */
  suggestionHint:
    'Hiçbir rotada olmayan, ama veride izi olan kodlar. Sıra sinyalin gücüne göre — eklemek için tıklayın, haritada mor noktalar bunlar.',
  /** Sinyal yoksa öneri de yok; bu bir arıza değil, sessiz bir dönem. */
  suggestionEmpty:
    'Şimdilik öneri yok — rota dışında kalan kodlarda talep, bekleyen ya da sipariş izi görünmüyor.',
  /**
   * Uzaklık KARAR VERDİRMEZ, bağlam verir (kullanıcı kararı 07.08: eleme kalktı) — 6 siparişi olan
   * ama 70 km ötedeki kod ayrı bir karardır ve o karar operatörün.
   *
   * `null` = rotanın hiç kodu yok, ölçülemiyor: "0 km" yazmak ölçemediğimizi ölçmüş göstermek olurdu.
   */
  suggestionWhere: (distanceKm: number | null, place?: string): string =>
    [place, distanceKm === null ? null : `rotaya ${distanceKm} km`].filter(Boolean).join(' · '),

  // ── Tıklamanın geri bildirimi (tasarımın `hint` şeridi) ───────────────────
  added: (code: string, place?: string): string => `${place ? `${code} ${place}` : code} rotaya eklendi`,
  /** Çıkarmanın SONUCU yazılır: kod düşünce o adresler kargo yoluna geçer — sessiz bir çıkarma bunu saklardı. */
  removed: (code: string, place?: string): string =>
    `${place ? `${code} ${place}` : code} rotadan çıkarıldı — bu adresler kargo yoluna geçer`,
} as const;
