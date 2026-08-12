import { DECLARATION_GAP_LABELS, type AssistantProposalKind, type DeclarationGap } from '@lezzet/types';

/**
 * Kararın CİNSİ — kuyruk ekranı hangi kapıyı açacağını buradan okur (kullanıcı kararı 09.08).
 *
 * Kuyruk ilk hâlinde tek kapılıydı: onayla ya da reddet. Gerçek kullanım bunu çürüttü — *"bölgeye
 * hangi posta kodlarının gireceğine haritaya bakmadan karar veremem; paketten bir kalemi
 * çıkarabilmeliyim"*. Doğru cevap kuyruğa on tane form yazmak DEĞİL (hepsi mevcut operasyon
 * ekranlarının kopyası olurdu); önerinin **cinsine göre** doğru yere göndermek:
 *
 * - `apply` — düzenlenecek bir şey yok, tek tık uygulanır (vitrin işareti bir boolean'dır).
 * - `draft_then_edit` — uygulama PASİF/taslak bir kayıt doğurur; ince ayar o varlığın kendi
 *   ekranında yapılır. Kuyruğun işi köprüyü vermek: "oluştu, düzenlemeye git".
 * - `handoff` — etki geri alınamaz (bildirim gider, stok satılabilir olur, defter yazılır), yani
 *   karar ÖNCESİ düzenleme şart. Kuyruk uygulamaz, ilgili ekranı ÖN DOLDURUR; kayıt oradan ve
 *   normal akışla olur. İkinci yazma yolu yine açılmaz.
 * - `inline` — **karar kuyruğun İÇİNDE verilir** (22.8, kullanıcı kararı 10.08). Devrin çözdüğü
 *   sorun gerçekti (düzenlemeden onay verilemez) ama çözümün bedeli daha büyük çıktı: kullanıcı
 *   *"asistan sayfasından çıkınca konseptten kopuyorum"*. Doğru cevap devretmek değil, düzenleme
 *   yüzeyini kuyruğa GETİRMEK — hedef ekranın kendi form gövdesi öneri detayına gömülür.
 *
 * `inline` yeni bir yazma yolu AÇMAZ ve bu ayrım kurgunun kendisi: gövde, hedef ekranın kullandığı
 * server action'ın TA KENDİSİNİ çağırır (`setOfferPriceAction` gibi) ve o eylem `withProposal` ile
 * kuyruk satırını da kapatır. Yani kuyruk hâlâ uygulamıyor; uygulayan yine varlığın kendi kapısı,
 * değişen tek şey formun nerede DURDUĞU.
 */
export type ProposalMode = 'apply' | 'draft_then_edit' | 'handoff' | 'inline';

interface KindMeta {
  label: string;
  impact: string;
  /**
   * **Geri alma YOLU — cümle değil adres** (kullanıcı kararı 10.08).
   *
   * Kart bir tur *"geri almak teklifi kaldırmaktır"* diyordu: doğru ama eksik, çünkü NEREDEN
   * yapılacağını söylemiyordu. Operatör okur, "nereden?" diye sorar, cevap ekranda yoktur.
   * Burada yol adıyla yazılır; yeri de kart değil **onay diyaloğudur** — bilgi karar anında
   * gerekir, her bakışta değil.
   *
   * Tanımsızsa diyalog bu satırı hiç çizmez: uydurulmuş bir "geri alınabilir" izlenimi hiç
   * söylememekten kötüdür.
   */
  undoHint?: string;
  tables: string[];
  mode: ProposalMode;
  /**
   * Devrin/köprünün hedef VARLIĞI — ekran URL'i bundan kurar.
   *
   * URL'in kendisi bilerek BURADA DEĞİL: rota sözleşmesi operasyon yüzeyinin işidir (`*-url.ts`),
   * uygulama katmanı ekran bilmez (`STACK §4`). Burada duran şey "hangi varlık", orada duran şey
   * "o varlık hangi adreste".
   */
  target: string;
  /**
   * `draft_then_edit` tiplerinde doğan kaydın `result` içindeki anahtarı (`{ bundleId: … }`).
   * Köprü ancak bu kimlikle kurulabilir; anahtar uygulayıcının döndürdüğü adla birebir aynıdır.
   */
  resultKey?: string;
}

/**
 * Öneri tipinin EKRAN KÜNYESİ (22.3) — rozet metni, "uygulanınca ne olur" cümlesi, hedef tablolar,
 * kararın cinsi ve köprü hedefi.
 *
 * **Neden kapıda, ekranda değil:** hepsi tipin DEĞİŞMEZ özelliği; ekrana yazılsalardı panelin
 * ikinci bir gerçek kaynağı olurdu ve tip eklendiğinde biri unutulurdu. `satisfies Record<…>`
 * sayesinde yeni bir `kind` eklendiği an burası DERLENMEZ — unutmak mümkün değil.
 *
 * Hedef tablolar gerçek şema adlarıdır (tasarımın fikstüründeki `packages`/`cash_entries` gibi
 * kurgusal adlar DEĞİL — 22.3 veri sözleşmesi).
 */
export const KIND_META = {
  bundle_draft: {
    label: 'Paket',
    /**
     * ── `draft_then_edit` → `inline` (22.18) ───────────────────────────────
     * Tip pasif bir paket doğurup operatörü Ürünler ekranına yolluyordu ve künyesi de bunu
     * anlatıyordu: *"kalem çıkarmak/eklemek ve payları değiştirmek paket ekranının işi"*. Kullanıcının
     * 10.08'de indirim için söylediği cümle burada da geçerliydi — *"asistan sayfasından çıkınca
     * konseptten kopuyorum"*. Paket artık kuyrukta, GERÇEK formuyla kuruluyor.
     *
     * **Etki cümlesi de değişti ve bu bir düzeltme:** paket artık pasif DOĞMUYOR — form durumu da
     * kalemleri de operatörün önünde ve karar tek adımda veriliyor. Eski cümle kalsaydı ekran,
     * yapmadığı bir şeyi vaat ederdi.
     */
    impact:
      'Katalogda yeni bir paket oluşur. Adı, fiyatı, kalemleri ve payları onaydan ÖNCE bu ekranda düzenlenir; satışta mı pasif mi doğacağı da formdaki durum seçiciyle belirlenir.',
    tables: ['bundle', 'bundle_item'],
    mode: 'inline',
    target: 'bundle',
    resultKey: 'bundleId',
  },
  featured_flag: {
    label: 'Vitrin',
    impact: 'Kayıt ana sayfa vitrinine girer ya da çıkar. Yayın durumu (aktif/pasif) DEĞİŞMEZ — bu ayrı bir eksendir.',
    tables: ['category', 'collection', 'bundle'],
    // Payload bir boolean: düzenlenecek bir şey yok, ara ekran gereksiz sürtünme olurdu.
    mode: 'apply',
    target: 'featured',
  },
  purchase_order: {
    label: 'Tedarik',
    impact:
      'Tedarik siparişi TASLAK olarak açılır; tedarikçiye gönderilmez. Kalem ve adet düzeltmesi tedarik ekranında yapılır, göndermek ayrı ve insanlı bir adımdır.',
    tables: ['purchase_order', 'purchase_order_item'],
    mode: 'draft_then_edit',
    target: 'purchase_order',
    resultKey: 'purchaseOrderId',
  },
  stock_intake: {
    label: 'Stok',
    impact:
      'Partiler stoğa girer ve satılabilir hâle gelir; son kullanma tarihleri bu tabloyla sabitlenir. Bağlı tedarik siparişi varsa kapanışı da bu kabulden türer.',
    tables: ['stock_intake', 'stock'],
    // Geri alınamaz: giren parti satılabilir olur ve SKT o an sabitlenir. Faturadan okunan
    // miktar/tarih gözle doğrulanmadan yazılmamalı — mal kabul ekranı ön doldurulur.
    mode: 'handoff',
    target: 'receiving',
  },
  /**
   * ── `handoff` → `inline` (22.18) ─────────────────────────────────────────
   * Devrin gerekçesi *"etki geri alınamaz (defter yazılır), yani karar ÖNCESİ düzenleme şart"*tı ve
   * o şart AYNEN duruyor — düzenleme hâlâ karardan önce; değişen tek şey formun nerede DURDUĞU.
   * Finans ekranının elle hareket formu ortak alana ayrıldı, kuyruk onu kendi içinde açıyor.
   *
   * **Transfer hâlâ devirle:** iki hesap ister ve kendi kapısı vardır ("⇄ Transfer"). Gövde o tipte
   * formu hiç açmaz, sebebini yazar — kuyruğa uymayan bir kararı zorla oraya sığdırmak, yanlış
   * doldurulmuş bir defter satırı demekti.
   */
  money_movement: {
    label: 'Para',
    impact: 'Muhasebe defterine bir hareket yazılır ve hesap bakiyesi değişir. Kayıt SİLİNMEZ — düzeltmesi ters kayıtladır.',
    tables: ['money_movement'],
    // Silinemeyen bir defter satırı: tutar ve hesap onaydan önce görülüp düzeltilebilmeli — ve
    // artık kuyruğun İÇİNDE düzeltiliyor (yukarıdaki künye).
    mode: 'inline',
    target: 'finance',
    // Doğan defter satırının kimliği künyeye yazılır: "bu hareketi hangi öneri kurdu" sorusunun
    // cevabı. Anahtar uygulayıcının döndürdüğü adla BİREBİR aynı (`recordManualMovementAction` →
    // `moneyMovementId`); ölçüldü, uydurulmadı.
    resultKey: 'moneyMovementId',
  },
  zone_extend: {
    label: 'Bölge',
    impact:
      'Posta kodları bölgeye eklenir, o adreslerde teslimat açılır ve haber bekleyen müşterilere "bölgeniz açıldı" bildirimi gider. BİLDİRİM GERİ ALINAMAZ: bölgeyi sonra kapatsanız bile mesaj gitmiş olur.',
    tables: ['delivery_zone_postal_code', 'zone_notice'],
    // Kuyruğun tek kapılı hâlinin çöktüğü yer (kullanıcı 09.08): "hangi kod girsin" sorusu
    // haritasız cevaplanamaz ve bildirim kısmi seçime bağlıdır. Rota ekranı ön doldurulur.
    mode: 'handoff',
    target: 'routes',
  },
  product_create: {
    label: 'Yeni ürün',
    impact:
      'Katalogda yeni bir ürün oluşur ve ADAY olarak doğar — vitrinde görünmez, satılamaz. Satışa çıkarmak ayrı bir karardır ve bu yoldan verilemez. Fiyat ve stok girilmez; ikisi de ayrı iştir.',
    tables: ['product', 'product_variant'],
    // ── FORM KUYRUĞA GELDİ, AMA "ADAY DOĞAR" CÜMLESİ BAYAT DEĞİL (22.16) ────
    // `product_draft` ile AYNI gövdeyi kullanıyor (kullanıcı: *"yeni ürün ile ürün düzenleme ayna
    // diyaloğu kullanabilir değil mi?"*), o yüzden mod `inline`. Ama üstteki etki cümlesi olduğu
    // gibi kalıyor ve bu bilinçli: satış durumu seçicisi kuyrukta YOK (kullanıcı kararı 11.08 —
    // kuyruk içeriği yazar, satış eksenine dokunmaz), yani öneriden doğan ürün gerçekten aday
    // doğuyor. Devri körü körüne uygulamak, var olan bir kısıtı yok saymak olurdu.
    mode: 'inline',
    target: 'product',
    resultKey: 'productId',
  },
  product_draft: {
    label: 'Ürün',
    // 22.6'da metin GÜNCELLENDİ: "alerjen ve saklama bu yoldan yazılamaz" cümlesi artık YANLIŞTI —
    // ambalaj fotoğrafından okuma senaryosuyla o alanlar açıldı (gıda duvarı şemadan ekrana taşındı).
    // Bayat bir etki cümlesi, olmayan bir güvenceyi vaat eder.
    impact:
      'Ürünün kaydı kuyruktaki formdan güncellenir — kategori, beyanlar ve varyantlar onaydan ÖNCE elinizin altında. SATIŞ DURUMU DEĞİŞMEZ: pasifse pasif, satıştaysa satışta kalır. DOLU bir alan yazılırsa eskisi KAYBOLUR (metinlerde sürüm tutulmuyor).',
    tables: ['product'],
    // ── `draft_then_edit` DEVRİ KAPANDI (kullanıcı kararı 11.08) ────────────
    // Eski cümle şuydu: *"uygulanınca kayıt PASİF doğar; ince ayar ve yayına alma kendi ekranının
    // işi."* 22.14'te ürün ekranının KENDİ formu kuyruğa taşınmıştı, yani cümle olmayan bir kısıtı
    // anlatıyordu ve kullanıcı bunu ekranda gördü (*"burada her şeyi yapmıyor muyuz, neden böyle bir
    // uyarı var?"*). Devir `discount_draft`ınkiyle aynı gerekçe: pasif doğurmanın sebebi operatörün
    // formu GÖRMEMESİYDİ, artık görüyor.
    //
    // **Ama satış ekseni yine kuyruğun DIŞINDA** (kullanıcı kararı, aynı gün): bir tur durum seçicisi
    // de forma taşınmıştı, geri alındı. Kuyruk ürünün İÇERİĞİNİ yazar; yayına almak ürün ekranının
    // kararı. Form mevcut durumu okuyup aynısını geri gönderdiği için bu eksen hiç oynamıyor.
    mode: 'inline',
    target: 'product',
    resultKey: 'productId',
  },
  discount_draft: {
    label: 'İndirim',
    impact:
      'Kampanya kuralı kuyruktaki formdan yazılır — kapsam, oran, tarih ve "Aktif" anahtarı onaydan ÖNCE elinizin altında. Aktif kaydedilirse koşulları tutan sepetlere hemen işler; kapalı kaydetmek kuralı hazır ama yayın dışı bırakır.',
    tables: ['discount', 'discount_code'],
    undoHint: 'Geri almak için: Fiyatlar → Kuponlar → kuralı kapatın (silinmez, geçmişi durur).',
    // ── `draft_then_edit` DEVRİ KAPANDI (kullanıcı kararı 10.08) ────────────
    // Eski etki cümlesi şuydu: *"Kampanya PASİF doğar. Kapsamı, tarihi ve oranı indirim ekranında
    // düzenlenir."* Kullanıcının itirazı doğrudan bu cümleyeydi — *"doğrudan bu indirimle alakalı
    // formun önüme gelmesini istiyorum"*. Pasif doğurmak bir emniyetti ama emniyetin sebebi
    // operatörün formu GÖRMEMESİYDİ: görmediği bir kuralı yayına almak tehlikelidir. Form kuyruğa
    // gelince o gerekçe düştü; anahtar da öteki alanlarla aynı ekranda duruyor.
    //
    // Kod satırları da işin içinde (`discount_code`) — bir kuponun kapısı yoksa kural kimsenin
    // giremediği bir odadır, ve kuyruk onu "uygulandı" diye damgalamamalı.
    mode: 'inline',
    target: 'discount',
    resultKey: 'discountId',
  },
  batch_offer: {
    // ── "FIRSAT" MÜŞTERİNİN KELİMESİ, OPERASYONUNKİ "TEKLİF" (kullanıcı kararı 11.08) ──
    // Rozet bir tur "Fırsat" yazıyordu ve kullanıcının itirazı yerindeydi: *"bu fırsat ifadesi
    // müşteri için; bizim için aslında stok eritme — eritilmesi gereken bir stoku eritmeye
    // çalışıyoruz, o yüzden fırsat kelimesi çok garip."* Ölçüldü: operasyon yüzeyi zaten "Teklif"
    // diyor (stok ekranı: "Teklif açık", teklif diyaloğu, teklif fiyatı) — sızan tek yer kuyruğun
    // rozetiydi. Müşteri yüzeyi "Fırsat" demeye devam ediyor (`messages.json`); iki yüzey iki ayrı
    // şey vaat ediyor ve aynı kelimeyi paylaşmaları gerekmiyor.
    label: 'Teklif',
    impact:
      'Partiye indirimli satış fiyatı yazılır ve o parti ANINDA satışa çıkar (müşteri yüzeyinde "Fırsat" olarak görünür) — taslak evresi yoktur. Aynı ürünün öteki partileri tam fiyatta kalır. Geri almak teklifi kaldırmaktır.',
    tables: ['stock'],
    undoHint: 'Geri almak için: Stok → parti → Teklifi kaldır.',
    // ── ÜÇ TURDA ÜÇ CEVAP; SONUNCUSU İKİSİNİ DE KAPSIYOR ───────────────────
    // (1) `apply` yazılmıştı: "tek sayı, düzenlenecek bir şey yok". Yanlıştı — teklif fiyatının ÜÇ
    //     YÜZÜ var (tutar · listeye göre indirim · alışa göre marj) ve tek sayı onaylamak, marjı
    //     GÖRMEDEN fiyat onaylamaktır.
    // (2) `handoff` oldu: karar stok ekranına, `offer-dialog`a devredildi. Üç yüz orada görünüyordu
    //     ve fiyat değiştirilebiliyordu — ama bedeli kullanıcının kuyruktan kopmasıydı (10.08).
    // (3) `inline`: o diyaloğun kendi gövdesi (`PriceTriple`) kuyruğun içine geldi. Üç yüz de
    //     görünüyor, fiyat da değiştirilebiliyor, üstelik sayfadan çıkılmıyor — devrin çözdüğü
    //     sorun duruyor, yarattığı sorun kalkıyor. Yazan kapı yine `setOfferPriceAction`.
    mode: 'inline',
    target: 'stock',
    resultKey: 'stockId',
  },
  recipe_draft: {
    label: 'Tarif',
    /**
     * ── `draft_then_edit` → `inline` (22.18) ───────────────────────────────
     * Tarif formu ortak alana ayrılıp kuyruğa taşındı; paket ve indirimle aynı gerekçe (kullanıcı
     * kararı 10.08). Etki cümlesinin *"malzeme ve adım düzenlemesi tarif ekranında yapılır"* kısmı
     * artık doğru değil — ikisi de onaydan ÖNCE burada düzenleniyor.
     *
     * **"PASİF doğar" KORUNDU ve bu bilinçli:** yayın ayrı bir karar ve ayrı bir eylemi var
     * (`setRecipeActiveAction`). Form o anahtarı taşımıyor — kaydetme akışına gömülseydi bir yazım
     * hatasını düzeltmek tarifi istemeden yayına alabilirdi (05.16 kararı).
     */
    impact:
      'Tarif PASİF doğar — yayına almak ayrı bir karardır ve tarif ekranında yapılır. Ad, adımlar, malzemeler ve künye alanları onaydan ÖNCE bu ekranda düzenlenir.',
    tables: ['recipe', 'recipe_item'],
    mode: 'inline',
    target: 'recipe',
    resultKey: 'recipeId',
  },
} as const satisfies Record<AssistantProposalKind, KindMeta>;

/** Kararın cinsi — ekran kapıyı buradan seçer (`satisfies` sayesinde yeni tip eklenince derlenmez). */
export function modeOf(kind: AssistantProposalKind): ProposalMode {
  return KIND_META[kind].mode;
}

/**
 * "Uygulanınca ne olur" — sabit şablon + ÖNERİYE ÖZGÜ sayı (operasyon şeridinin itirazı, 09.08).
 *
 * İtiraz haklıydı ve şuydu: aynı `zone_extend`in biri bildirim gönderir, biri göndermez (bekleyen
 * yoksa) — "gider" diyen sabit bir cümle ikinci hâlde YALAN söyler. Ama cümleyi tümüyle üreten
 * araca bırakmak da doğru değildi: o zaman metni MODEL yazardı ve geri alınamaz bir etkiyi
 * yumuşatan bir cümle kurabilirdi.
 *
 * Orta yol: **iskelet burada sabit** (asistan değiştiremez), **sayı payload'dan okunur** (öneriye
 * özgü ve gerçek). Kolon açmaya gerek yok — veri zaten payload'da.
 */
/**
 * Geri alma yolu — tanımlıysa. `KIND_META` `as const` olduğu için alan yalnız onu TAŞIYAN tipte
 * görünür; çağıran her tip için sorabilsin diye erişim buradan geçer (`modeOf`/`impactOf` deseni).
 */
export function undoHintOf(kind: AssistantProposalKind): string | undefined {
  return (KIND_META[kind] as { undoHint?: string }).undoHint;
}

export function impactOf(kind: AssistantProposalKind, payload: unknown): string {
  const base = KIND_META[kind].impact;
  if (!payload || typeof payload !== 'object') return base;
  const p = payload as Record<string, unknown>;

  if (kind === 'zone_extend' && Array.isArray(p.postalCodes)) {
    const codes = p.postalCodes as Array<{ waitingCount?: unknown }>;
    const waiting = codes.reduce((sum, c) => sum + (typeof c.waitingCount === 'number' ? c.waitingCount : 0), 0);
    // Bekleyen YOKSA cümle bildirimden hiç söz etmez: olmayan bir dış etkiyi uyarmak, gerçek
    // uyarıyı da değersizleştirir ("nasılsa hep yazıyor").
    return waiting === 0
      ? `${codes.length} posta kodu bölgeye eklenir ve o adreslerde teslimat açılır. Bu kodlarda haber bekleyen müşteri yok — bildirim gitmeyecek.`
      : `${codes.length} posta kodu bölgeye eklenir, o adreslerde teslimat açılır ve haber bekleyen ${waiting} müşteriye bildirim gider. BİLDİRİM GERİ ALINAMAZ: bölgeyi sonra kapatsanız bile mesaj gitmiş olur.`;
  }

  if (kind === 'stock_intake' && Array.isArray(p.lines)) {
    return `${p.lines.length} parti stoğa girer ve satılabilir hâle gelir; son kullanma tarihleri bu tabloyla sabitlenir. Bağlı tedarik siparişi varsa kapanışı da bu kabulden türer.`;
  }

  if (kind === 'purchase_order' && Array.isArray(p.lines)) {
    return `${p.lines.length} kalemlik tedarik siparişi TASLAK olarak açılır; tedarikçiye gönderilmez. Göndermek ayrı ve insanlı bir adımdır.`;
  }

  if (kind === 'bundle_draft' && Array.isArray(p.items)) {
    return `${p.items.length} kalemlik yeni bir paket oluşur ve PASİF doğar — müşteri vitrininde görünmez. Yayına almak ayrı bir karardır.`;
  }

  // ── BEYAN TİPLERİNDE CÜMLE TAMLIKTAN KURULUR (22.6) ────────────────────────
  // Ekranın en önemli tek bilgisi "onaylarsam kayıt tam olur mu". Ölçüt motordan geliyor
  // (`missingDeclarations` → payload'daki `remainingGaps`), araç kendi ölçütünü uydurmuyor.
  if (kind === 'product_create' || kind === 'product_draft') {
    const gaps = Array.isArray(p.remainingGaps) ? (p.remainingGaps as string[]) : [];
    const tail =
      gaps.length === 0
        ? 'Onaylanırsa ürünün yasal beyanı TAM olur.'
        : `Onaylansa bile şu beyanlar EKSİK kalır: ${gaps.map((g) => DECLARATION_GAP_LABELS[g as DeclarationGap] ?? g).join(' · ')} — eksik beyanlı ürün satışa çıkamaz.`;
    if (kind === 'product_create') return `${base} ${tail}`;
    const fields = p.fields && typeof p.fields === 'object' ? Object.keys(p.fields as Record<string, unknown>) : [];
    const head =
      fields.length > 0
        ? `Asistan ürünün ${fields.join(' ve ')} alanını dolduruyor; kaydedilecek olan formda DURAN hâl`
        : 'Asistanın önerisi formda açılır; kaydedilecek olan formda DURAN hâl';
    // "ama ürün TASLAKTA KALIR" CÜMLESİ KALKTI (11.08): kuyruk artık ürün ekranının kendi formunu
    // taşıyor ve durum seçici de içinde — yani kısıt yok. Olmayan bir güvenceyi vaat eden cümle,
    // operatörü yapabildiği bir işten alıkoyar.
    return `${head}. ${tail}`;
  }

  return base;
}

/**
 * Önerinin TUTARI — tipe göre payload'dan türer; tutar kavramı olmayan tipte `null`.
 *
 * **Ekran bunu hesaplamaz** (sözleşme): aynı türetme iki yerde yazılsaydı biri bir gün ötekinden
 * ayrılır ve listede görünen tutar kartta başka çıkardı.
 */
export function amountCentsOf(kind: AssistantProposalKind, payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  // Paket fiyatı EURO tutulur (paket ailesi cent'e göçmedi — `Bundle.totalPrice`); çevrim burada.
  if (kind === 'bundle_draft' && typeof p.totalPrice === 'number') return Math.round(p.totalPrice * 100);
  if (kind === 'money_movement' && typeof p.amountCents === 'number') return p.amountCents;

  // Mal kabulde tutar KALEMLERDEN toplanır; bir kalemin maliyeti bilinmiyorsa toplam UYDURULMAZ
  // (eksik veriyi 0 saymak faturayı olduğundan ucuz gösterirdi — `packages.ts` ağırlık kuralının aynısı).
  if (kind === 'stock_intake' && Array.isArray(p.lines)) {
    const lines = p.lines as Array<{ qty?: unknown; unitCostCents?: unknown }>;
    if (lines.length === 0) return null;
    let total = 0;
    for (const line of lines) {
      if (typeof line.unitCostCents !== 'number' || typeof line.qty !== 'number') return null;
      total += line.unitCostCents * line.qty;
    }
    return total;
  }
  return null;
}
