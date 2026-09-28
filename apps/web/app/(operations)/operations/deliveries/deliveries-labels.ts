import type { OpsTone } from '@/components/operation/ui/tone';
import type { ZoneMapFact } from '@/components/operation/ui/zone-map-model';
import type { PrepStage } from './dispatch-types';

// Teslimat sayfasının sözlüğü: sevkiyat masası, rota kurulumu ve sefer kaydı. Kuryenin kapıdaki sözlüğü burada yok, çünkü o
// akış native uygulamada.

/**
 * Sevkiyatçının gün planının sözlüğü. İç terim ham kullanılmaz: "bölge", "teslim günü", "sipariş kesim saati" denir,
 * `DeliveryZone`, `delivery_date`, `cut-off` değil.
 */
export const DISPATCH_NOTES = {
  /** Kesim saati geçti: liste artık araç yüklenirken büyümez — bu bir güven cümlesidir. */
  settled: 'Bu günün listesi kesinleşti — sipariş kesim saati geçti, yeni sipariş bu güne düşmez.',
  /**
   * Kesim önceki güne aitken ayrı cümle: kesim 22:00, saat 19:40 iken "kesim saati geçti" yanlış okunur, çünkü geçen şey dünün
   * 22:00'siydi.
   */
  settledPrevDay: (time: string): string =>
    `Bu günün listesi kesinleşti — kesim bir gün önce ${time}'da kapandı, yeni sipariş bu güne düşmez.`,
  open: (time: string): string =>
    `Liste hâlâ büyüyebilir: ${time}'a kadar gelen sipariş bu güne düşer, sonrası bir sonraki teslim gününe.`,
  /**
   * Kesim önceki güne aitken "hâlâ açık" cümlesi de günü söylemeli: bugünün {time}'ı YARININ
   * seferini kapatıyor, bu günün değil.
   */
  openPrevDay: (time: string): string =>
    `Liste hâlâ büyüyebilir: bir gün önce ${time}'a kadar gelen sipariş bu güne düşer.`,
  /** Engel şeridinin cümleleri kısa ve paralel, çünkü şerit bir kontrol listesidir ve tek bakışta taranmalı. */
  blockers: {
    /**
     * Hazır olmayanlar ADIYLA anılır: yalnız sayı vermek sevkiyatçıyı listede aramaya gönderirdi.
     * Üçten fazlasında ad yığılır, o zaman sayıya dönülür — uyarı bir liste değil, bir işarettir.
     */
    notReady: (names: readonly string[]): string =>
      names.length <= 3 ? `${names.join(', ')} hazır değil` : `${names.length} sipariş hazır değil`,
    /** Seferi açılmamış rota: kurye henüz rotayı almadı. */
    runless: (count: number): string => (count === 1 ? '1 rotanın seferi açılmadı' : `${count} rotanın seferi açılmadı`),
    /** Askıda kalan — engellerin EN SERTİ: bugünün değil, geçmişin borcudur. */
    stranded: (count: number): string => `${count} sipariş önceki günlerden askıda`,
    /** Hiçbir rotaya düşmemiş durak: araç oraya UĞRAMAZ. Engellerin en serti. */
    zoneless: (count: number): string => `${count} sipariş hiçbir rotaya düşmedi`,
    /**
     * Kapısı başka kodda bulunan durak; cümle "yanlış adres" demez, çünkü müşteri haklı olabilir (yeni bina). Söylenen bir olgu,
     * ki sevkiyatçı telefonu açıp sorabilsin.
     */
    doorElsewhere: (count: number): string =>
      count === 1 ? '1 durak başka posta kodunda görünüyor' : `${count} durak başka posta kodunda görünüyor`,
    /** Kapısı doğrulanamayan durak — yumuşak: kaba eşleşme bir hüküm değil, yeni yapı olabilir. */
    doorUnverified: (count: number): string =>
      count === 1 ? '1 durağın kapı numarası doğrulanmadı' : `${count} durağın kapı numarası doğrulanmadı`,
    untracked: (count: number): string => `${count} pakette takip numarası yok`,
  },
  /** Kargonun günü rotanınkinden farklı çalışır ve ekran bu farkı gizlemez: kargoda teslim günü şema gereği yoktur. */
  shipping:
    'Gün süzgeci uygulanmaz: kargoda teslim günü bizim vaadimiz değil taşıyıcınındır. Bu bir kuyruktur — hazırlanmış, henüz taşıyıcıya verilmemiş paketler. Takip numarasını hazırlık ekranı yazar.',
  shippingTruncated: 'Kuyruk tavana dayandı — burada görünenden daha fazla paket bekliyor.',
  emptyDay: 'Bu güne düşen çıkış yok. Bölgelerin haftalık günleri Depolar sayfasında tanımlanır — bugün hiçbirinin günü olmayabilir.',

  // ── Günün künyesi ve engelleri ────────────────────────────────────────────
  /** Kesim saatinin kısa hâli künye satırında; uzun cümle üzerine gelince açılır, çünkü künye bir kimlik satırıdır. */
  settledShort: 'liste kesinleşti',
  /** Saat yalnız bugün için yazılır: gelecek bir güne bakan sevkiyatçı saati bugünün kesimi sanırdı. */
  openShort: (time: string): string => `liste ${time}'a kadar açık`,
  openShortAhead: 'liste henüz açık',
  /**
   * Engel kalmadığında ŞERİT SUSMAZ, "çıkabilir" der. Boş bırakmak *"kontrol edilmedi"* diye de
   * okunurdu; sevkiyatçının aradığı şey tam olarak bu tek cümle.
   */
  readyToGo: 'Araç çıkabilir — durakların hepsi hazır ve atanmış.',
  /** Rota boş ama kargo dolu hâli: boş gün metni kargo kuyruğu doluyken hiç görünmezdi. */
  emptyRoute: 'Bu güne rota çıkışı yok.',

  // ── Askıda kalanlar ───────────────────────────────────────────────────────
  /** Devir sessiz değil: tarih kendiliğinden ilerlemez, çünkü müşteriye verilen gün sözü haber verilmeden değişmemeli. */
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
  noAccess: 'Günün planını kurmak ve kurye atamak yöneticinin işidir. Kuryenin günü native uygulamada açılır.',
} as const;

/**
 * Hazırlık kademesinin yüzü. `ready` rozet çizdirmez: normal hâle rozet basmak listeyi tek renge boyar ve asıl uyarıları
 * görünmez kılardı.
 */
export const PREP_VIEW: Record<PrepStage, { label: string; tone: OpsTone } | null> = {
  ready: null,
  not_started: { label: 'Hazır değil', tone: 'red' },
  preparing: { label: 'Hazırlanıyor', tone: 'amber' },
  // Rozet çizer, çünkü "depoda hazır" ile "araçta, yolda" sevkiyatçı için iki ayrı gerçek; ton sakin, uyarı değil konum.
  on_the_way: { label: 'Yolda', tone: 'slate' },
  delivered: { label: 'Teslim', tone: 'olive' },
  returned: { label: 'İade döndü', tone: 'slate' },
};

/** Sefer metinleri — sefer şeridi ve geçmiş seferler sekmesi aynı sözlüğü okur, "yolda"nın iki cümlesi olmaz. */
export const RUN_NOTES = {
  /** Saat okunur biçimde: sevkiyatçının sorusu "ne zamandır yolda". */
  onRoad: (departedAt: string | null): string =>
    departedAt
      ? `Yolda · ${new Date(departedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Yolda',
  returned: (returnedAt: string): string =>
    `Döndü · ${new Date(returnedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
  /** Sefer açılmamış rota — kurye henüz almadı; engel sayacının satırdaki karşılığı. */
  waiting: 'sefer açılmadı — kurye rotayı bekliyor',
  /** Dönmüş ama SAYILMAMIŞ sefer: para araçta göründü, mutabakat yapılmadı — görünür eksik. */
  unclosed: 'Kapanış bekliyor',
  emptyList:
    'Sefer, kurye rotayı alıp yola çıktığında doğar ve burada kalıcı kaydı tutulur: kim sürdü, hangi araç, ne zaman çıktı-döndü, sayım ne dedi. İlk sefer başlatıldığında bu liste dolmaya başlar.',
} as const;

/**
 * Rota kurulumunun sözlüğü; arayüz dili tek kelime: rota. Veri modeli adı `delivery_zone` kalır, ekranda "bölge" demek
 * operatörü çevirmeye zorlardı.
 */
export const ROUTE_NOTES = {
  pickRoute: 'Soldaki haritada tanımlı güzergâhlar görünüyor. Düzenlemek için listeden bir rota seçin, ya da "+ Rota" ile yenisini kurun.',
  noCodes: 'Henüz kod yok — bu rota hiçbir adrese hizmet etmiyor.',

  // ── Haritanın lejant altı satırı ──────────────────────────────────────────
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
   * Rayın tek sorusu "bu kod rotada yerini hak ediyor mu"; ürün kırılımı, marj ve kohort Analitik'in işi. Rota ekranındaki her
   * sayı, o ekranda verilen kararı değiştirebilmeli.
   */
  weightHint: 'Tüm zamanların siparişi. Yükü hangi kodun taşıdığını gösterir — düşük satır, güzergâhtan çıkarma adayıdır.',
  /** Henüz kaydedilmemiş kod ölçülmedi. "0 sipariş" YAZILMAZ: ölçülemeyen değer sıfır değildir. */
  weightUnmeasured: 'Yeni eklenen kodlar kaydedildikten sonra ölçülür.',
  /** Haber bekleyen KİMLİKLİ ve izinlidir; anonim talep sayacıyla toplanmaz (evi Depolar'daki tablo). */
  waiting: (count: number): string => `${count} kişi haber bekliyor`,

  // ── Öneriler ──────────────────────────────────────────────────────────────
  /**
   * Haritadaki önerinin künyesi: sıra karar sırasıdır, önce neden (kanıtlar), sonra nerede, en sonda ne kadar taze. Ölçülemeyen
   * parça hiç girmez: rotanın kodu yoksa uzaklık, sorulma yoksa yaş yazılmaz.
   */
  suggestionTip: (parts: {
    waitingCount: number;
    orderCount: number;
    requestCount: number;
    /** `null` = rotanın hiç kodu yok, uzaklık ÖLÇÜLEMİYOR — "0 km" yazmak ölçmüş gibi okuturdu. */
    distanceKm: number | null;
    /** Son sorunun yaşı, hazır metin (`agoShort`); `null` = hiç sorulmamış. */
    age: string | null;
  }): ZoneMapFact[] =>
    [
      // Sıra sinyalin ağırlığına göre: bekleyen kişi → sipariş → soru → uzaklık → yaş. Boş sinyal çipe dönmez, çünkü "0 sipariş"
      // gerçek kanıtı seyreltir.
      parts.waitingCount > 0 ? { icon: 'waiting' as const, label: `${parts.waitingCount} bekliyor` } : null,
      parts.orderCount > 0 ? { icon: 'orders' as const, label: `${parts.orderCount} sipariş` } : null,
      parts.requestCount > 0 ? { icon: 'asked' as const, label: `${parts.requestCount} soru` } : null,
      parts.distanceKm === null ? null : { icon: 'distance' as const, label: `${parts.distanceKm} km` },
      // "Önerilen kod" ibaresi yok: noktanın moru ve lejant bunu zaten söylüyor.
      parts.age === null ? null : { icon: 'age' as const, label: parts.age },
    ].filter((fact): fact is ZoneMapFact => fact !== null),
  /** Ekran dışındaki öneriler: rayın tek işi, haritanın yapısal olarak yapamadığı şey, yani bakılmayan yeri göstermek. */
  offscreenTitle: 'Ekran dışında',
  offscreenHint: 'Görüş alanının dışında kalan öneriler — tıklayınca harita oraya gider.',
  /** Hepsi ekranda: bu bir eksiklik değil, iyi hâl — cümle onu öyle söyler. */
  offscreenNone: 'Öneri kalmadı ya da hepsi ekranda — haritadaki mor noktalar.',
  /** Sinyal yoksa öneri de yok; bu bir arıza değil, sessiz bir dönem. */
  suggestionEmpty:
    'Şimdilik öneri yok — rota dışında kalan kodlarda talep, bekleyen ya da sipariş izi görünmüyor.',
  /**
   * Uzaklık karar verdirmez, bağlam verir: uzaktaki kod ayrı bir karardır ve o karar operatörün. `null` = rotanın hiç kodu yok,
   * "0 km" yazmak ölçemediğimizi ölçmüş göstermek olurdu.
   */
  suggestionWhere: (distanceKm: number | null, place?: string): string =>
    [place, distanceKm === null ? null : `rotaya ${distanceKm} km`].filter(Boolean).join(' · '),

  // ── Tıklamanın geri bildirimi (tasarımın `hint` şeridi) ───────────────────
  added: (code: string, place?: string): string => `${place ? `${code} ${place}` : code} rotaya eklendi`,
  /** Çıkarmanın SONUCU yazılır: kod düşünce o adresler kargo yoluna geçer — sessiz bir çıkarma bunu saklardı. */
  removed: (code: string, place?: string): string =>
    `${place ? `${code} ${place}` : code} rotadan çıkarıldı — bu adresler kargo yoluna geçer`,
} as const;
