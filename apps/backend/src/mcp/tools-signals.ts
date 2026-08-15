import {
  AccountService,
  AnalyticsProductDailyService,
  AnalyticsSearchDailyService,
  ConversationInboxService,
  DeliveryZoneService,
  MoneyMovementService,
  PostalCodeDemandService,
  ProductFeedbackService,
  ProductService,
  TicketService,
  serviceDb,
} from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * Talep sinyalleri ve müşteri nabzı (22.1 · Faz A) — kullanıcının açıkça istediği iki gündem
 * kalemini besleyen ham veri: **"haftalık yeni rota önerisi"** (hangi posta kodu soruluyor ama
 * kapsanmıyor) ve **"müşteri taleplerine göre paket önerisi"** (ne aranıyor, ne bakılıp
 * alınmıyor, hangi aday ürün isteniyor).
 *
 * **Sinyal veridir, karar değil.** Araç "şu kodu bölgeye ekle" demez, "şu kod 14 kez soruldu,
 * kapsanmıyor" der; öneriyi model kurar, kararı patron verir (onay kuyruğu Faz B).
 *
 * **Kimlik yok** (`AI_ADMIN_ASSISTANT §6`): talep sayacı zaten anonim; yazışma ve talep tarafında
 * yalnız SAYIM ve durum kırılımı okunur — konuşma metni, müşteri adı, telefon hiçbir araca girmez.
 * Bu, MCP asistanının mesajlaşmadaki rolünün GÖZLEM olmasının kod karşılığıdır (§7 tablosu).
 */

/** Paris takviminde n gün önce (YYYY-AA-GG) — analitik özetler gün taneli. */
function daysAgo(days: number): string {
  const today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const anchor = new Date(`${today}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}

function today(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/**
 * Talep sinyalleri: nereye gidemiyoruz, ne aranıp bulunamıyor, ne çok bakılıp az alınıyor.
 *
 * Üçü de aynı soruya bakar — **karşılanmamış talep** — ama üç ayrı yerden: coğrafya, arama kutusu,
 * ürün sayfası. Tek bir araçta toplanmaları bilinçli: asistan "bu hafta ne yapmalıyım" diye
 * sorduğunda üçünü birden görmeli, üç ayrı çağrı yapıp birleştirmeye çalışmamalı.
 */
export async function demandSignals(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const from = daysAgo(clamped - 1);
  const to = today();

  const [zones, coveredZones, searches, zeroSearches, productSignals] = await Promise.all([
    new PostalCodeDemandService(db).listTop(15),
    // **KAPSAMA DA OKUNUR** (MCP tur 8 raporu §3.2 · ölçüldü 15.08): sayaç ham talebi sayıyor ve
    // kodun zaten dağıtım yaptığımız bir bölgede olup olmadığını BİLMİYORDU. Sonuç, `delivery_map`
    // ile zıt cevaptı — orası 67400'ü "kapsanıyor" derken burası aynı kodu bölge genişletme adayı
    // gibi sunuyordu (29 talep, Illkirch/Ostwald bölgesinde ve aktif). Model o çelişkiyi göremez;
    // gördüğü tek şey yüksek talepli bir koddur ve gereksiz bir `zone_extend` önerir — raporun
    // "en zayıf öneriler" dediği şey tam olarak buydu.
    new DeliveryZoneService(db).listWithCodes({}),
    new AnalyticsSearchDailyService(db).signals(from, to, 15),
    // Sonuçsuz aramalar AYRI sorulur: "aradı ve bulamadı" bir katalog boşluğudur — paket ve yeni
    // ürün önerisinin en dolaysız kanıtı.
    new AnalyticsSearchDailyService(db).signals(from, to, 15, true),
    new AnalyticsProductDailyService(db).signals(from, to, 15),
  ]);

  // Ürün kimlikleri ADA çevrilir: model uuid'yle konuşamaz, patron da öyle.
  const products = productSignals.length > 0 ? await new ProductService(db).listByIds(productSignals.map((s) => s.productId)) : [];
  const nameById = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name, 'tr')]));

  return {
    window: { from, to, days: clamped },
    /**
     * Rota/bölge önerisinin ham sinyali (19.21 · anonim sayaç) — **kapsama işaretli**.
     *
     * Kapsanan kod GİZLENMİYOR, işaretleniyor: oradaki yüksek talep de bir bilgidir (o bölgeye daha
     * sık gitmek, kapasite artırmak). Yanlış olan onu "gidemediğimiz yer" gibi sunmaktı.
     * `coveredBy` bölgenin adını taşıyor — model "zaten Illkirch/Ostwald'da" diyebilsin diye; kod
     * listesi tek başına o cümleyi kurdurmaz.
     */
    postalCodeDemand: zones.map((z) => ({
      postalCode: z.postalCode,
      requestCount: z.requestCount,
      lastSeenAt: z.lastSeenAt,
      coveredBy: coveredZones.find((zone) => zone.postalCodes.some((c) => c.postalCode === z.postalCode))?.name ?? null,
    })),
    searches: searches.map((s) => ({ query: s.query, searchCount: s.searchCount, sessionCount: s.sessionCount })),
    searchesWithoutResult: zeroSearches.map((s) => ({ query: s.query, kind: s.zeroResultKind, searchCount: s.searchCount })),
    // `cartRate` null = "hiç satılabilir hâlde görünmedi" — SIFIR DEĞİL (ölçüm yoksa yokluk yazılır).
    //
    // Adı çözülemeyen satır LİSTEDE DEĞİL, SAYAÇTA (harici MCP denetimi, 09.08 · tur 2): ürün
    // silinince ilgi verisi kalır (`analytics_daily_product`'ın ürüne FK'si yok — bilinçli, ölçüm
    // kaybolmasın diye). Ama adsız bir satır modele hiçbir şey söylemez, yalnız bağlam yer ve üç
    // ayrı "(silinmiş ürün)" satırı listeyi okunmaz kılar. Yine de GİZLENMEZ: sayısı yazılır, ki
    // "ölçüm var ama adı yok" ile "ölçüm yok" birbirine karışmasın.
    productInterest: productSignals
      .filter((s) => nameById.has(s.productId))
      .map((s) => ({
        product: nameById.get(s.productId),
        viewCount: s.viewCount,
        cartCount: s.cartCount,
        cartRate: s.cartRate,
      })),
    unresolvedProductSignals: productSignals.filter((s) => !nameById.has(s.productId)).length,
  };
}

/**
 * Müşteri nabzı — talepler, moderasyon kuyruğu ve YAZIŞMA GÖZLEMİ.
 *
 * Yazışma tarafı bilerek SAYIMDIR: MCP asistanı mesajlaşmayı yönetmez, gözlemler (kullanıcı
 * kararı 09.08 · `AI_CUSTOMER_AGENT §7`). "Kaç konuşma cevap bekliyor" sorusunun cevabı patronun
 * işine yarar; konuşmanın İÇERİĞİ ise müşteri ajanının ve operasyon ekranının alanıdır.
 */
export async function customerPulse() {
  const db = serviceDb();
  const [tickets, pendingReviews, awaitingReply] = await Promise.all([
    new TicketService(db).countByStatus(),
    new ProductFeedbackService(db).countPending(),
    new ConversationInboxService(db).countAwaitingReply(),
  ]);

  return {
    tickets,
    pendingReviews,
    conversations: { awaitingReply },
  };
}

/**
 * **KASA/BANKA DURUMU — bakiyeler + son hareketler + dönem toplamları** (MCP tur 8 raporu §3.11 ·
 * ölçüldü 15.08).
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * `propose_money_movement` vardı ama hesapların durumunu okuyacak hiçbir araç yoktu. Asistan bu
 * türde ancak adminin dikte ettiğini yazabiliyordu — *"kasada birikti, bankaya aktar"* gibi kendi
 * başına kurulmuş tek bir cümle bile mümkün değildi. Raporun kendi öz değerlendirmesi bu türü
 * "TEST" diye işaretledi ve sebebini doğru koydu: veri temelli öneri üretmek bugünkü araçlarla
 * imkânsız.
 *
 * ── SINIR: OKUR, YORUMLAMAZ ─────────────────────────────────────────────────
 * Dönen şey bakiye, son hareketler ve tür başına dönem toplamı. **Kâr, marj ya da nakit tahmini
 * YOK** — `AI_ADMIN_ASSISTANT §6` finans sınırı: asistan para hareketini ÖNERİR, işletmenin
 * finansal yorumunu yapmaz. Toplamlar da ham: "gider arttı" cümlesini kuran taraf modeldir ve o
 * cümle bir öneri gerekçesidir, rapor değil.
 *
 * **Yerel veri sahtedir** (`CLAUDE.md`): buradaki sayılar araç davranışının kanıtıdır, iş çıkarımı
 * değil.
 */
export async function moneyOverview(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const from = daysAgo(clamped - 1);
  const to = today();

  const accountService = new AccountService(db);
  const movements = new MoneyMovementService(db);
  const [accounts, balances, totals, recent] = await Promise.all([
    accountService.list({ activeOnly: true }),
    accountService.balances(),
    movements.periodTotals(from, to),
    // Son hareketler: en yeni 15 — "kasada ne oldu" sorusunun dolaysız cevabı. Sayfalama yok,
    // pencere zaten dar (`CLAUDE §1`: doğal tavanı olan küme).
    movements.ledger({ limit: 15 }),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return {
    window: { from, to, days: clamped },
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      // `null` = bakiye görünümünde satır yok (hiç hareket görmemiş hesap) — SIFIR DEĞİL
      // (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
      balanceCents: balances.get(a.id)?.balanceCents ?? null,
    })),
    /** Tür × yön kırılımı (tahsilat/gider/transfer × giren/çıkan) — ham toplam, yorum yok. */
    periodTotals: totals,
    recentMovements: recent.rows.map((row) => ({
      valueDate: row.valueDate,
      type: row.type,
      // İşaretli tutar: girişte +, çıkışta − ve transferin karşı ucunda ters (`signedAmountCents`
      // künyesi). Ham `amountCents` + `direction` ikilisini modele yorumlatmak, işaret kuralını
      // ikinci kez yazdırmak olurdu.
      signedAmountCents: row.signedAmountCents,
      // Satırın AİT OLDUĞU hesap — transferde `accountId`den farklı olabilir (defter satırı iki
      // hesapta birden doğar).
      account: accountName.get(row.ledgerAccountId) ?? null,
      description: row.description,
    })),
  };
}
