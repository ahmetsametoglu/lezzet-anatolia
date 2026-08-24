import { createHash } from 'node:crypto';
import { AnalyticsEventService, UserProfileService } from '@lezzet/database';
import { dailySalt, type PlaceWarehouses } from '@lezzet/application';
import {
  AnalyticsInputSchema,
  type AnalyticsEventInsert,
  type AnalyticsInput,
  type Channel,
  type Country,
  type PreferredLanguage,
} from '@lezzet/types';
import { scrubMessage } from '@lezzet/observability/mask';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  NATIVE OLAY KAPISI (24.08 · MB-63) — uçların çağırdığı TEK fonksiyon.

  ── NEDEN WEB'İN KAPISI DEĞİL ───────────────────────────────────────────────
  İlk taslak "kapıyı ortak pakete taşıyalım, yoksa kuralı iki yerde yazarız" diyordu. ÖLÇÜM
  ÇÜRÜTTÜ ve kaydı burada duruyor ki aynı yanlış bir daha kurulmasın: `record.ts`teki kuralların
  native'de KARŞILIĞI YOK.

      prefetch düşürme → yok (kavram yok) · bot UA süzgeci → yok (uygulamaya bot girmez)
      headers()/getLocale() → yok (Hono) · routePattern → yok (URL yok)
      normalizeUtm → yok (kampanya bağlantısı yok) · detectDevice → yok (hep mobil)
      IP+UA oturum anahtarı → KULLANILAMAZ (aşağıda)

  Gerçekten ortak olan her şey ZATEN ortak pakette: sözleşme (`types`), personel süzgeci ve defter
  servisi (`database`), temizleyici (`observability`), alıcı/yer çözümü (`application`) ve günlük
  tuz (`application/analytics/salt` — ORAYA TAŞINDI, kopyalanmadı). Geriye kalan satır kurulumudur.

  ── KURAL YİNE TEK KAPIDA ───────────────────────────────────────────────────
  `ANALYTICS §4`ün uyarısı ("kural atıcılara dağılırsa biri unutur ve unutulduğunda HATA VERMEZ,
  yalnız payda sessizce şişer") burada da geçerli: uçlar yalnız NE OLDUĞUNU söyler, neyin sayılacağına
  bu dosya karar verir.

  ── ÖLÇÜM AKIŞI KESMEZ ──────────────────────────────────────────────────────
  Fonksiyon fırlatmaz ve beklenmesi gerekmez (`void recordNativeEvent(...)`). Hata yutulur ama
  sessiz değil: `captureError` ile iz bırakır (CLAUDE §1 — sessiz catch yok).
*/

/**
 * ── OTURUM ANAHTARI: NATIVE'DE WEB'İN FORMÜLÜ ÇALIŞMAZ ──────────────────────
 *
 * Web `hash(günlük_tuz ‖ kırpılmış_ip ‖ ua ‖ site)` kullanıyor. Native'de bu formülün iki girdisi
 * de AYIRT EDİCİ DEĞİL: `ua` aynı sürümün her kurulumunda birebir aynı, kırpılmış IP ise mobil
 * operatörde binlerce kişiyi tek bloğun arkasına topluyor. Uygulasaydık bütün kurulumlar TEK
 * oturuma çökerdi ve bu, ölçülmemiş bir sayıyı ölçülmüş gibi göstermek olurdu.
 *
 * Bugünkü dürüst hâl:
 * · **Girişli müşteri** → `hash(günlük_tuz ‖ müşteri ‖ native)`. Web kadar anonim: tuz her gün
 *   döner ve eskisi saklanmaz, yani anahtar ertesi gün geri hesaplanamaz. Kimlik defterde DURMAZ
 *   (`ANALYTICS §2` — kimlik kolonu yok); yalnız anahtarın türetiminde kullanılır.
 * · **Misafir** → günün tek ortak anahtarı. Ayırt edici bir sinyal YOK ve uydurmuyoruz.
 *
 * **Bedeli açıkça yazılı:** native misafir oturumları TEK anahtara çöküyor, yani `session_count`
 * native tarafında bir TABANDIR — gerçek sayı bundan büyüktür, küçük değil. Bu bir yalan değil,
 * eksik ölçümdür ve yönü bilinir (CLAUDE §1: "ölçülemeyen değer sıfır değildir"). Gerçek misafir
 * oturumu ancak kurulum başına rastgele bir değer istemciden geldiğinde ölçülebilir; o karar
 * kullanıcıya ait ve bugün ERTELENDİ (kapsam ürün/paket sayımı, oturum sayımı değil).
 */
function sessionKeyOf(salt: string, customerId: string | null): string {
  const kimlik = customerId ?? 'guest';
  return createHash('sha256').update(`${salt}|${kimlik}|native`).digest('hex').slice(0, 32);
}

/** Serbest metnin tek girdiği yer — temizlik TEK kapıda (web kapısının aynı sınırı). */
const SEARCH_QUERY_MAX = 100;
function cleanQuery(raw: string): string {
  return scrubMessage(raw.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ')).slice(0, SEARCH_QUERY_MAX);
}

export interface NativeEventContext {
  db: SupabaseClient;
  /**
   * Kanal — `ANALYTICS §3`: *"sunucuda çözülü, karışık ölçüm yalan söyler."*
   *
   * **TAM `PricingViewer` İSTENMİYOR ve bu ölçülmüş bir karar:** paket ucu kimliği bilerek
   * okumuyor (*"paket YALNIZ B2C'dedir ve tek fiyat taşır — kişiselleşecek bir fiyat yok,
   * `readViewer` çağırmak boşa bir tur olurdu"*, o dosyanın künyesi). Kapı alıcı nesnesi
   * dayatsaydı o uç ölçüm uğruna gereksiz bir tur atmak zorunda kalırdı. Kapının gerçekten
   * ihtiyacı olan iki şey var; onları çağıran, BİLDİĞİ kadarıyla verir.
   */
  channel: Channel;
  /** Personel süzgeci için — `null` = misafir. Kimliği bilmeyen uç `null` geçer. */
  customerId: string | null;
  place: PlaceWarehouses;
  /**
   * Ekranın dili — `null` = uç dil ALMIYOR (ör. yer çözümü: cevabı dile bağlı değil).
   *
   * Uydurulmuş bir dil, boş dilden KÖTÜDÜR: "tr" yazan bir satır, Fransız müşterinin isteğini
   * Türkçe sayardı ve dil kırılımı sessizce yanlış olurdu. Web kapısının aynı kararı — orada da
   * dil çözülemezse `null` yazılıyor ("uydurulmuş bir dil, boş dilden kötüdür").
   */
  locale: PreferredLanguage | null;
  /**
   * Çözülmüş yerin ÜLKESİ — `null` = yer çözülmedi.
   *
   * **Zorunlu ama boş olabilir, ve ayrım kasıtlı:** `PlaceWarehouses` ülke taşımıyor (depo
   * kimliğidir, coğrafya değil) ve ucun elinde zaten yer cevabı var. Alanı opsiyonel yapsaydık
   * unutan uç sessizce ülkesiz olay yazardı; zorunlu yapınca `null` bile olsa BİR KARAR olur.
   *
   * IP'den TÜRETİLMEZ — web kapısının aynı kararı: `CountryEnum` yalnız `FR|DE` ve IP'den türeyen
   * bir ülke kolonu tam ISO listesi isterdi (Belçika'dan gelen ziyaretçi bu kolona yazılamazdı).
   */
  country: Country | null;
}

/**
 * Olayı deftere yazar. **Fırlatmaz, beklenmesi gerekmez.**
 *
 * Çağrı biçimi: `void recordNativeEvent(ctx, { type: 'product_view', … })`
 */
export async function recordNativeEvent(ctx: NativeEventContext, input: AnalyticsInput): Promise<void> {
  try {
    const girdi = AnalyticsInputSchema.parse(input);

    /* PERSONEL ÖLÇÜLMEZ (`ANALYTICS §1`): operasyon yüzeyi iş akışıdır, niyet sinyali değil — ve
       çalışan izlemeye dönüşür. Native'de personel MÜŞTERİ yüzeyine de girebiliyor (kabuk çift
       yönlü, 21.97), yani süzgeç web'dekinden daha gerekli. */
    if (ctx.customerId !== null && (await new UserProfileService(ctx.db).isStaff(ctx.customerId))) return;

    const salt = await dailySalt(ctx.db);
    const satir: AnalyticsEventInsert = {
      type: girdi.type,
      sessionKey: sessionKeyOf(salt, ctx.customerId),
      /* YOL YAZILMAZ ve bu bir eksik değil: native'de URL yoktur, rota kalıbı da yoktur. Web'in
         `path`i kampanya/rota analizinin taşıyıcısı; native'de karşılığı olmayan bir alanı
         uydurulmuş bir değerle doldurmak, boş bırakmaktan kötüdür. */
      path: null,
      subjectType: 'subjectType' in girdi ? girdi.subjectType : null,
      subjectId: 'subjectId' in girdi ? girdi.subjectId : null,
      productId: 'productId' in girdi ? (girdi.productId ?? null) : null,
      channel: ctx.channel,
      warehouseId: ctx.place.warehouseId ?? ctx.place.shippingWarehouseId ?? null,
      availability: 'availability' in girdi ? girdi.availability : null,
      blockedReason: 'reason' in girdi ? girdi.reason : null,
      /* Native'de cihaz HER ZAMAN mobil — türetilecek bir şey yok. Ayrımı `surface` taşıyor. */
      device: 'mobile',
      surface: 'native',
      /* Ülke ÇÖZÜLMÜŞ YERDEN gelir, IP'den değil (web kapısının aynı kararı: `CountryEnum` yalnız
         FR/DE ve IP'den türeyen bir ülke kolonu tam ISO listesi isterdi). Yer çözülmediyse null. */
      country: ctx.country,
      language: ctx.locale,
      meta: girdi.type === 'search' ? { query: cleanQuery(girdi.query), resultCount: girdi.resultCount } : null,
    };

    await new AnalyticsEventService(ctx.db).insert(satir);
  } catch (err) {
    const { captureError } = await import('@lezzet/observability');
    void captureError(err, { source: 'mobile-api', context: { at: 'recordNativeEvent', type: input.type } });
  }
}
