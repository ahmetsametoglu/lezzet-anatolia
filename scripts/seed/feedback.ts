import { FeedbackDueOrderService, FeedbackRequestService, PointsEntryService, ProductFeedbackService } from '@lezzet/database';
import { feedbackToken, redemptionCode } from '@lezzet/domain-core';
import type { PointsEntryInsert, PreferredLanguage } from '@lezzet/types';
import { an, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

// ── Geri bildirim · davet · puan (0036/0037/0038 · modül 17) ─────────────────────────────────────
// Üç tablo tek dosyada, çünkü tek bir hikâyenin üç halkasıdır: teslimattan sonra DAVET gider,
// davetten DEĞERLENDİRME doğar, değerlendirme PUAN kazandırır. Ayrı dosyalara bölmek, birinin
// diğerinin kimliğine dayandığı sırayı görünmez kılardı.
//
// Rastgelelik yok: token üreteci motordandır (`feedbackToken`) ama seed ona DETERMİNİSTİK bir
// üreteç verir — iki koşu aynı token'ı kurar, geliştirici bağlantıyı yer imine koyabilir.

/**
 * Deterministik sözde-rastgele (LCG) — motorun `random: () => number` sözleşmesine takılır.
 *
 * Çarpım `Math.imul` ile 32 bitte tutulur: düz `*` kullanılsaydı ara sonuç JS'in tam sayı
 * hassasiyetini (2^53) aşar, alt bitler yuvarlanır ve üreteç dar bir döngüye — hatta sabite —
 * düşerdi. Sabit dönen bir token, `feedback_request.token` tekilliğini ikinci davette çiğner.
 */
function tohumlu(tohum: number): () => number {
  let s = tohum >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Yayınlanmış/bekleyen/reddedilmiş — üçü de ekranda ayrı bir hâl. */
interface Yorum {
  urun: number; // ürün indisi (satılabilir ürünler içinde)
  kisi: string;
  rating?: number;
  vote?: 'like' | 'dislike';
  comment?: string;
  language?: PreferredLanguage;
  status?: 'pending' | 'approved' | 'rejected';
  dwellMs?: number;
  yas: number; // kaç gün önce
  etiket: string;
}

// ── Davetler (0038) ──────────────────────────────────────────────────────────────────────────────
// Davet TESLİM EDİLMİŞ siparişe gider. Teslim edilmiş her siparişe davet AÇILMAZ ve bu bilinçlidir:
// `feedback_due_order` görünümü (tarama işinin okuduğu kuyruk) boş kalırsa cron denenemez.

export async function seedFeedbackRequests(db: Db): Promise<Map<string, string>> {
  const requests = new FeedbackRequestService(db);
  const harita = new Map<string, string>();

  if (await tabloDolu(db, 'feedback_request')) {
    console.log('▸ geri bildirim davetleri zaten dolu — atlandı');
    return harita;
  }
  console.log('▸ GERİ BİLDİRİM DAVETİ seed');

  // Aday siparişler CRON'UN GÖRDÜĞÜ kümeden seçilir (`feedback_due_order`): teslim edilmiş ve daveti
  // olmayan. Kendi sorgumu yazsaydım seed, işin hiç bakmadığı bir siparişe davet açabilirdi — örneğin
  // kapı önü satışına (teslim geçişi hiç olmamış bir sipariş, görünümde YOKTUR).
  const due = await new FeedbackDueOrderService(db).listDue();
  if (due.length === 0) {
    console.log('  · daveti bekleyen sipariş yok — davet kurulmadı');
    return harita;
  }

  // ÜRÜN SAYISINA göre sırala: ilerleme çubuğu ("2/5") ancak ÇOK ÜRÜNLÜ bir siparişte anlam taşır.
  // Tek ürünlü siparişe bağlanan yarım davet "1/1" gösterir — yani hiç yarım görünmez. Sıralama
  // burada yapılır, çünkü `feedback_due_order` ürün sayısını bilmez (bilmesi de gerekmez: onun
  // sorusu "daveti bekleyen kim", "kaç ürünlü" değil).
  const { data: varyantData } = await db.from('product_variant').select('id,product_id');
  const varyantUrunu = new Map(((varyantData ?? []) as Array<{ id: string; product_id: string }>).map((v) => [v.id, v.product_id]));
  const urunSayilari = new Map<string, number>();
  for (const d of due) {
    const { data: kalemler } = await db.from('order_item').select('variant_id').eq('order_id', d.orderId);
    const urunIdleri = ((kalemler ?? []) as Array<{ variant_id: string }>)
      .map((k) => varyantUrunu.get(k.variant_id))
      .filter(Boolean);
    urunSayilari.set(d.orderId, new Set(urunIdleri).size);
  }
  const teslimEdilmis = [...due]
    .sort((a, b) => (urunSayilari.get(b.orderId) ?? 0) - (urunSayilari.get(a.orderId) ?? 0))
    .map((d) => ({ id: d.orderId, customer_id: d.customerId }));

  const rnd = tohumlu(20260729);
  /** Davet açar; `etiket` haritanın anahtarıdır (değerlendirme bölümü ona bağlanır). */
  async function davet(opts: {
    etiket: string;
    siparis: { id: string; customer_id: string };
    channel: 'email' | 'whatsapp';
    gonderildi?: number | null; // kaç gün önce gitti; null = HİÇ gönderilmedi
    tamamlandi?: number | null;
    puan?: number | null;
    suresiDoldu?: boolean;
  }): Promise<void> {
    const created = await requests.insert({
      orderId: opts.siparis.id,
      customerId: opts.siparis.customer_id,
      token: feedbackToken(rnd),
      channel: opts.channel,
      sentAt: opts.gonderildi == null ? null : an(-opts.gonderildi),
    });
    if (opts.tamamlandi != null) {
      await requests.update({ id: created.id, completedAt: an(-opts.tamamlandi), pointsAwarded: opts.puan ?? null });
    }
    // Süresi dolmuş token: "bağlantının süresi doldu" ekranı ancak geçmiş bir `expires_at` ile
    // görülebilir. Servis bu alanı yazmaz ve yazmamalı (ömür DB varsayılanıdır) — seed'in derdi.
    if (opts.suresiDoldu) {
      const { error: err } = await db.from('feedback_request').update({ expires_at: an(-5) }).eq('id', created.id);
      if (err) throw err;
    }
    harita.set(opts.etiket, created.id);
    console.log(`  ✓ ${opts.etiket} · ${created.token.slice(0, 8)}…`);
  }

  const s = teslimEdilmis;
  // 1) TAMAMLANMIŞ davet — puanı verilmiş; değerlendirmeleri aşağıda buna bağlanır (ilerleme dolu).
  if (s[0]) await davet({ etiket: 'tamamlanmis', siparis: s[0], channel: 'email', gonderildi: 12, tamamlandi: 11, puan: 30 });
  // 2) GÖNDERİLMİŞ ama yarım kalmış — "2/5" ilerleme çubuğunun öznesi; token hâlâ açılabilir.
  if (s[1]) await davet({ etiket: 'yarim', siparis: s[1], channel: 'email', gonderildi: 4 });
  // 3) HİÇ GÖNDERİLMEMİŞ — `listUnsent` kuyruğu; gönderim işi denenebilsin.
  if (s[2]) await davet({ etiket: 'gonderilmemis', siparis: s[2], channel: 'email', gonderildi: null });
  // 4) SÜRESİ DOLMUŞ token — bağlantı açılınca reddedilmeli.
  if (s[3]) await davet({ etiket: 'suresiDolmus', siparis: s[3], channel: 'email', gonderildi: 100, suresiDoldu: true });
  // 5) WhatsApp kanallı davet — kanal ekseni e-postadan bağımsızdır (15.x zemini).
  if (s[4]) await davet({ etiket: 'whatsapp', siparis: s[4], channel: 'whatsapp', gonderildi: 6 });

  // Kalan teslim edilmiş siparişler DAVETSİZ bırakılır → tarama işinin kuyruğu dolu kalır.
  console.log(`✓ davet: ${harita.size} kayıt (tamamlanmış · yarım · gönderilmemiş · süresi dolmuş · WhatsApp) · ${Math.max(0, s.length - harita.size)} sipariş davetsiz (cron kuyruğu)`);
  return harita;
}

// ── Değerlendirmeler (0036) ──────────────────────────────────────────────────────────────────────
// Üç biçim tek tabloda: yıldız · yazılı yorum · beğen/geç. Ekranın gördüğü her hâl burada karşılığını
// bulur — yayınlanmış yorum, moderasyon kuyruğu, reddedilmiş kayıt, metinsiz yıldız, aday kaydırması.
//
// TEKİLLİK: aynı müşteri + aynı ürün + aynı bağlam tek kayıttır (DB indeksi). Aşağıdaki dağılım bunu
// gözetir — bir ürünün çok yorumu VARSA farklı müşterilerdendir.

export async function seedProductFeedback(
  db: Db,
  kisiler: Kisiler,
  varyantlar: VaryantRef[],
  davetler: Map<string, string>,
): Promise<Map<string, string>> {
  const feedbacks = new ProductFeedbackService(db);
  const harita = new Map<string, string>();

  if (await tabloDolu(db, 'product_feedback')) {
    console.log('▸ değerlendirmeler zaten dolu — atlandı');
    return harita;
  }
  console.log('▸ DEĞERLENDİRME seed');

  // Ürün düzeyinde tekilleştir: değerlendirme ÜRÜNE aittir, varyanta değil (0036).
  const urunler = [...new Map(varyantlar.filter((v) => v.status === 'active').map((v) => [v.productId, v])).values()];
  const adaylar = [...new Map(varyantlar.filter((v) => v.status === 'candidate').map((v) => [v.productId, v])).values()];
  if (urunler.length === 0) {
    console.log('  · satılabilir ürün yok — atlandı');
    return harita;
  }

  const moderator = kisiler.get('devAdmin') ?? null;
  // Taslak müşteriler de yazar: yorum kalabalığı yalnız kayıtlı altı kişiden gelemez — "ilk üç yorum
  // + devamı" ancak bir ürüne yeterince farklı kişi yazınca denenir.
  const { data: taslakData } = await db.from('user_profiles').select('id').eq('is_draft', true).order('created_at');
  const taslaklar = ((taslakData ?? []) as Array<{ id: string }>).map((r) => r.id);
  const kisi = (key: string): string | null => kisiler.get(key) ?? null;

  const YORUMLAR: Yorum[] = [
    // ── Ürün 0: ÇOK YORUMLU (ürün detayında "ilk üç + devamı" ve puan kartı burada denenir) ──
    { urun: 0, kisi: 'b2cSadik', rating: 5, comment: 'Le meilleur baklava que j\'aie mangé en France. Pâte croustillante, pas trop sucré — exactement comme à Gaziantep.', language: 'fr', status: 'approved', yas: 30, etiket: 'FR · 5★ yayınlandı' },
    { urun: 0, kisi: 'b2cAlman', rating: 4, comment: 'Sehr frisch geliefert, Verpackung war einwandfrei. Etwas süßer als erwartet, aber sehr lecker.', language: 'de', status: 'approved', yas: 24, etiket: 'DE · 4★ yayınlandı' },
    { urun: 0, kisi: 'b2bOnayli', rating: 5, comment: 'Restoranımızda haftalık alıyoruz, müşteri memnuniyeti çok yüksek. Fıstık oranı gerçekten iyi.', language: 'tr', status: 'approved', yas: 18, etiket: 'TR · 5★ yayınlandı' },
    { urun: 0, kisi: 'b2cKapaliKapida', rating: 4, status: 'approved', yas: 12, etiket: 'METİNSİZ 4★ (kendiliğinden yayında)' },
    { urun: 0, kisi: 'b2bAlman', rating: 5, comment: 'Immer wieder gerne. Lieferung pünktlich.', language: 'de', status: 'approved', yas: 9, etiket: 'DE · kısa yorum' },
    { urun: 0, kisi: 'b2bBekleyen', rating: 3, comment: 'Bon produit mais la dernière livraison est arrivée un peu écrasée sur les bords.', language: 'fr', status: 'approved', yas: 5, etiket: 'FR · 3★ eleştirili (yayınlandı)' },

    // ── Ürün 1: MODERASYON KUYRUĞU (bekleyen + reddedilmiş) ──
    { urun: 1, kisi: 'b2cSadik', rating: 2, comment: 'Cette fois la pâte était molle, je suis déçue. Le précédent colis était bien meilleur.', language: 'fr', status: 'pending', yas: 2, etiket: 'BEKLİYOR · 2★ (kuyruk)' },
    { urun: 1, kisi: 'b2cAlman', rating: 5, comment: 'Beste Preise hier: www.billig-baklava-shop.de — schaut mal vorbei!', language: 'de', status: 'rejected', yas: 7, etiket: 'REDDEDİLDİ · spam' },
    { urun: 1, kisi: 'b2bOnayli', rating: 4, status: 'approved', yas: 15, etiket: 'METİNSİZ 4★' },

    // ── Ürün 2: DÜŞÜK PUANLI (sıralamanın alt ucu — "en düşük puanlı ürünler" listesi boş kalmasın) ──
    { urun: 2, kisi: 'b2cKapaliKapida', rating: 1, comment: 'Bien trop sucré à mon goût, je n\'ai pas pu finir. Dommage.', language: 'fr', status: 'approved', yas: 20, etiket: 'FR · 1★ yayınlandı' },
    { urun: 2, kisi: 'b2cSadik', rating: 2, status: 'approved', yas: 14, etiket: 'METİNSİZ 2★' },
    { urun: 2, kisi: 'b2cAlman', vote: 'dislike', status: 'approved', yas: 10, etiket: 'BEĞENMEDİ (purchase)' },

    // ── Ürün 3: yalnız BEĞENİ — yıldızı yok, skor kartının "ortalama yok ama beğeni var" hâli ──
    { urun: 3, kisi: 'b2cSadik', vote: 'like', status: 'approved', yas: 8, etiket: 'BEĞENDİ (yıldızsız)' },
    { urun: 3, kisi: 'b2bOnayli', vote: 'like', status: 'approved', yas: 6, etiket: 'BEĞENDİ' },
    { urun: 3, kisi: 'b2cAlman', vote: 'like', status: 'approved', yas: 3, etiket: 'BEĞENDİ' },

    // ── Ürün 4: BEKLEYEN tek yorum — henüz hiç yayınlanmamış ürün (puan kartı boş görünmeli) ──
    { urun: 4, kisi: 'b2bAlman', rating: 5, comment: 'Wir bestellen regelmäßig für unser Café. Sehr zufrieden mit der Qualität.', language: 'de', status: 'pending', yas: 1, etiket: 'BEKLİYOR (ürünün tek yorumu)' },
  ];

  // Doğrulanmış alışveriş bağı: müşterinin kapanmış siparişlerinden ilki. Bir kısmı bilinçli
  // BAĞSIZ kalır (aşağıda `siparisiOlan` boş dönen kişiler) — "doğrulanmış alıcı" rozetinin iki
  // hâli de görünsün; rozet her yorumda yanıyorsa hiçbir şey söylemiyor demektir.
  const { data: kapanmisData } = await db
    .from('order')
    .select('id,customer_id')
    .in('status', ['delivered', 'completed'])
    .order('created_at', { ascending: true });
  const kapanmis = (kapanmisData ?? []) as Array<{ id: string; customer_id: string }>;
  const siparisiOlan = (customerId: string): string | null =>
    kapanmis.find((o) => o.customer_id === customerId)?.id ?? null;

  let sayi = 0;
  for (const y of YORUMLAR) {
    const urun = urunler[y.urun];
    const customerId = kisi(y.kisi);
    if (!urun || !customerId) continue;
    const metinli = (y.comment?.trim().length ?? 0) > 0;
    const status = y.status ?? 'approved';
    // METİNSİZ kayıt kendiliğinden yayına girer (DB kısıtı da öyle ister); METİNLİ kayıt daima
    // `pending` doğar — yazanın kendi yorumunu yayına alabilmesi moderasyonu dışarıdan atlatmak
    // olurdu (17.1). Bu yüzden karar `moderate` kapısından geçer, insert'e yazılmaz.
    const created = await feedbacks.insert({
      productId: urun.productId,
      customerId,
      orderId: siparisiOlan(customerId),
      context: 'purchase',
      rating: y.rating ?? null,
      vote: y.vote ?? null,
      comment: y.comment ?? null,
      language: metinli ? (y.language ?? 'fr') : null,
      ...(metinli ? {} : { status: 'approved' as const }),
    });
    if (metinli && status !== 'pending' && moderator) {
      await feedbacks.moderate(created.id, status, moderator);
    }
    // Yaşlandırma: "3 gün önce" etiketi ve yorum sıralaması ancak geçmiş tarihli kayıtla görünür.
    // Moderasyon damgası kararın anıdır — yorumdan SONRA olmalı, bir gün sonrasına çekilir.
    const guncelleme: Record<string, unknown> = { created_at: an(-y.yas) };
    if (metinli && status !== 'pending') guncelleme.moderated_at = an(-Math.max(0, y.yas - 1));
    const { error } = await db.from('product_feedback').update(guncelleme).eq('id', created.id);
    if (error) throw error;
    harita.set(`${y.urun}:${y.kisi}`, created.id);
    sayi += 1;
  }
  console.log(`  ✓ satın alma değerlendirmesi: ${sayi} kayıt (yayında · bekleyen · reddedilmiş · metinsiz · beğeni)`);

  // ── Davetten doğan değerlendirmeler ────────────────────────────────────────────────────────────
  // `feedback_request_progress` ("2/5") ancak davete BAĞLI kayıtlar varsa dolu görünür. Tamamlanmış
  // davet ürünlerin çoğunu, yarım kalan davet yalnız birini taşır — çubuğun iki ucu.
  const tamamlanmis = davetler.get('tamamlanmis');
  const yarim = davetler.get('yarim');
  let davetli = 0;
  /** Davetin siparişindeki ürünlere değerlendirme yazar (tekilliği çiğnemeden). */
  async function davettenYaz(requestId: string, adet: number, puanlar: number[]): Promise<void> {
    const { data: istek } = await db.from('feedback_request').select('order_id,customer_id').eq('id', requestId).single();
    if (!istek) return;
    const { order_id, customer_id } = istek as { order_id: string; customer_id: string };
    const { data: kalemler } = await db
      .from('order_item')
      .select('variant_id')
      .eq('order_id', order_id);
    const urunIdleri = [
      ...new Set(
        ((kalemler ?? []) as Array<{ variant_id: string }>)
          .map((k) => varyantlar.find((v) => v.id === k.variant_id)?.productId)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    for (const [i, productId] of urunIdleri.slice(0, adet).entries()) {
      // Aynı müşteri o ürüne yukarıda yazdıysa tekillik indeksi reddeder — atla.
      if (await feedbacks.findByCustomerProduct(customer_id, productId, 'purchase')) continue;
      await feedbacks.insert({
        productId,
        customerId: customer_id,
        orderId: order_id,
        feedbackRequestId: requestId,
        context: 'purchase',
        rating: puanlar[i % puanlar.length] ?? 4,
        status: 'approved',
      });
      davetli += 1;
    }
  }
  if (tamamlanmis) await davettenYaz(tamamlanmis, 10, [5, 4, 5]);
  if (yarim) await davettenYaz(yarim, 1, [4]);
  console.log(`  ✓ davetten doğan değerlendirme: ${davetli} kayıt (ilerleme çubuğu: dolu + yarım)`);

  // ── Aday ürün kaydırmaları (13.4 talep panosu) ─────────────────────────────────────────────────
  // Aday oyları ürün SKORUNA girmez (`product_rating` yalnız `purchase` sayar) — kendi panosunda
  // yaşar. Panonun güven göstergesi "kaç kaydırma / kaç KİŞİ" farkından ve kart süresinden çıkar:
  // ziyaretçi kaydırması tekilleştirilemez, o yüzden bir kısmı bilinçli KİMLİKSİZ ve KISA süreli.
  let adaySayi = 0;
  for (const [ai, aday] of adaylar.slice(0, 4).entries()) {
    // Kimlikli oylar — tekillik indeksi gereği kişi başına bir kez.
    const kimlikliler = ['b2cSadik', 'b2cAlman', 'b2bOnayli', 'b2cKapaliKapida', 'b2bAlman'].slice(0, 5 - ai);
    for (const [ki, key] of kimlikliler.entries()) {
      const customerId = kisi(key);
      if (!customerId) continue;
      // İlk aday en çok beğenilen (panonun tepesi), sonuncusu bilinçli olumsuz.
      const begen = ai === 3 ? ki % 3 === 0 : ki % 4 !== 3;
      await feedbacks.insert({
        productId: aday.productId,
        customerId,
        context: 'candidate',
        vote: begen ? 'like' : 'dislike',
        dwellMs: 1200 + ki * 600 + ai * 250,
        status: 'approved',
      });
      adaySayi += 1;
    }
    // Taslak müşteriler — kimlikli ama pasif kullanıcılar.
    for (const [ti, id] of taslaklar.slice(0, 2).entries()) {
      await feedbacks.insert({
        productId: aday.productId,
        customerId: id,
        context: 'candidate',
        vote: ti === 1 && ai % 2 === 1 ? 'dislike' : 'like',
        dwellMs: 900 + ti * 400,
        status: 'approved',
      });
      adaySayi += 1;
    }
    // ZİYARETÇİ kaydırmaları (kimliksiz, tekilleştirilemez). Bir kısmı ÇOK KISA süreli — toplu
    // savurma işareti; sinyal ağırlığı motoru (`dwellWeight`) ancak böyle bir veriyle denenir.
    const ziyaretci = 6 + ai * 3;
    for (let z = 0; z < ziyaretci; z += 1) {
      await feedbacks.insert({
        productId: aday.productId,
        customerId: null,
        context: 'candidate',
        vote: (z + ai) % 5 === 0 ? 'dislike' : 'like',
        dwellMs: z % 4 === 0 ? 180 : 700 + z * 220, // %25'i eşik altı (MIN_DWELL_MS = 400)
        status: 'approved',
      });
      adaySayi += 1;
    }
  }
  console.log(`  ✓ aday kaydırması: ${adaySayi} oy · ${Math.min(4, adaylar.length)} aday ürün (kimlikli + ziyaretçi + eşik altı süre)`);
  console.log(`✓ değerlendirme: ${sayi + davetli + adaySayi} kayıt`);
  return harita;
}

// ── Puan defteri (0037) ──────────────────────────────────────────────────────────────────────────
// Bakiye SAKLANMAZ, defterden türetilir. Bu yüzden seed bakiye yazmaz — hareket yazar; ekrandaki
// sayı ancak hareketler doğruysa doğru çıkar.
//
// Yedi sebebin hepsi örneklenir; biri NEGATİF (kupona çevirme) ve o hareket `redeem_points` RPC'si
// ile doğar — kupon ile defter satırının aynı anda doğması kapının garantisidir, seed onu taklit
// etmez, çağırır.

export async function seedPoints(db: Db, kisiler: Kisiler, degerlendirmeler: Map<string, string>): Promise<void> {
  if (await tabloDolu(db, 'points_entry')) {
    console.log('▸ puan defteri zaten dolu — atlandı');
    return;
  }
  console.log('▸ PUAN DEFTERİ seed');
  const points = new PointsEntryService(db);
  const admin = kisiler.get('devAdmin') ?? null;

  // Kapanmış siparişler — "sipariş verdin" puanının izi (refId = order.id).
  const { data: siparisData } = await db
    .from('order')
    .select('id,customer_id')
    .in('status', ['delivered', 'completed'])
    .order('created_at', { ascending: true });
  const siparisler = (siparisData ?? []) as Array<{ id: string; customer_id: string }>;

  const sadik = kisiler.get('b2cSadik');
  const alman = kisiler.get('b2cAlman');
  const kapali = kisiler.get('b2cKapaliKapida');

  let sayi = 0;
  const yaz = async (input: PointsEntryInsert, yas: number): Promise<void> => {
    const created = await points.insert(input);
    const { error } = await db.from('points_entry').update({ created_at: an(-yas) }).eq('id', created.id);
    if (error) throw error;
    sayi += 1;
  };

  if (sadik) {
    // Sadık müşteri: her sebepten hareketi olan DOLU defter — "topladın / harcadın" ayrımı burada okunur.
    for (const [i, s] of siparisler.filter((o) => o.customer_id === sadik).slice(0, 4).entries()) {
      await yaz({ customerId: sadik, points: 20, reason: 'order', refId: s.id }, 40 - i * 8);
    }
    const yorumId = degerlendirmeler.get('0:b2cSadik');
    if (yorumId) await yaz({ customerId: sadik, points: 50, reason: 'review', refId: yorumId }, 30);
    const begeniId = degerlendirmeler.get('3:b2cSadik');
    if (begeniId) await yaz({ customerId: sadik, points: 10, reason: 'feedback_purchase', refId: begeniId }, 8);
    await yaz({ customerId: sadik, points: 5, reason: 'feedback_candidate' }, 6);
    // Getiren müşteri (17.7): iz, davet ettiği kişinin kimliğidir.
    if (alman) await yaz({ customerId: sadik, points: 100, reason: 'referral', refId: alman }, 22);
    // Personelin elle düzeltmesi — sebep sınıfı `manual`, hikâyesi `note`'ta (DB kısıtı ikisini de ister).
    await yaz(
      { customerId: sadik, points: 40, reason: 'manual', note: 'Gecikmeli teslimat için jest — müşteri aradı.', createdBy: admin },
      15,
    );
  }

  // Almanya müşterisi: az hareketli defter (yeni müşteri hâli).
  if (alman) {
    await yaz({ customerId: alman, points: 20, reason: 'order', refId: siparisler.find((o) => o.customer_id === alman)?.id ?? null }, 20);
    await yaz({ customerId: alman, points: 5, reason: 'feedback_candidate' }, 4);
  }
  // Eksi bakiyeye düşmeyen ama harcamış müşteri de olsun: elle KESİNTİ (negatif manual).
  if (kapali) {
    await yaz({ customerId: kapali, points: 20, reason: 'order', refId: siparisler.find((o) => o.customer_id === kapali)?.id ?? null }, 25);
    await yaz(
      { customerId: kapali, points: -20, reason: 'manual', note: 'İptal edilen siparişin puanı geri alındı.', createdBy: admin },
      24,
    );
  }

  // ── Kupona çevirme (17.4) — NEGATİF satır + kişisel kupon, tek turda ────────────────────────────
  // Puan bir para birimi gibi davranır: harcandığında defterde eksi bir satır doğar ve karşılığında
  // kişiye özel bir kupon açılır. İkisini ayrı yazmak, birinin düştüğü koşuşta müşteriye ya bedava
  // kupon ya kayıp puan bırakırdı — o yüzden RPC.
  if (sadik) {
    const sonuc = await points.redeem({
      customerId: sadik,
      points: 100,
      valueCents: 500, // 5 € kupon
      minimum: 100,
      code: redemptionCode(tohumlu(4242)),
    });
    if (sonuc.ok) {
      sayi += 1;
      console.log(`  ✓ kupona çevirme: −100 puan → ${sonuc.code} (5 €) · kalan bakiye ${sonuc.balanceAfter}`);
    } else {
      console.log(`  · kupona çevirme atlandı (${sonuc.reason})`);
    }
  }

  console.log(`✓ puan: ${sayi} hareket (7 sebebin hepsi · kazanım + harcama + elle düzeltme)`);
}
