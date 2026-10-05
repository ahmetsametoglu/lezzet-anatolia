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
  Native olay kapısı, uçların çağırdığı tek fonksiyon: web'in `record.ts` kurallarının (prefetch, bot süzgeci, rota kalıbı, UTM, IP+UA
  oturumu) native'de karşılığı yok, ortak olan her şey zaten ortak pakette. Uçlar yalnız ne olduğunu söyler, neyin sayılacağına bu
  dosya karar verir; fonksiyon fırlatmaz, hata `captureError` ile iz bırakır.
*/

/**
 * Oturum anahtarı: web formülünün girdileri native'de ayırt edici değil (aynı sürümün UA'sı aynı, mobil operatör IP'si binlerce kişiyi
 * toplar), bu yüzden girişlide `hash(günlük_tuz ‖ müşteri ‖ native)`, misafirde günün tek ortak anahtarı kullanılır. Misafir oturumları
 * tek anahtara çöktüğü için native `session_count` bir tabandır, gerçek sayı daha büyüktür.
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
   * Kanal sunucuda çözülür (`ANALYTICS §3`); tam `PricingViewer` istenmez, çünkü paket ucu kimliği okumaz ve ölçüm için fazladan tur
   * atmak zorunda kalırdı.
   */
  channel: Channel;
  /** Personel süzgeci için — `null` = misafir. Kimliği bilmeyen uç `null` geçer. */
  customerId: string | null;
  /** Ölçüm yerden yalnız depoyu yazar; `null` uç yeri çözmüyor demektir. */
  place: Pick<PlaceWarehouses, 'warehouseId' | 'shippingWarehouseId'> | null;
  /**
   * Ekranın dili; `null` uç dil almıyor demektir. Uydurulmuş dil boş dilden kötüdür, "tr" yazan satır Fransız müşterinin isteğini
   * Türkçe sayardı.
   */
  locale: PreferredLanguage | null;
  /**
   * Çözülmüş yerin ülkesi, `null` yer çözülmedi demektir; alan zorunludur ki unutan uç sessizce ülkesiz olay yazmasın. IP'den
   * türetilmez, çünkü kolon yalnız hizmet ülkelerini alır.
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

    /* Personel ölçülmez (`ANALYTICS §1`): operasyon yüzeyi iş akışıdır, niyet sinyali değil; native kabukta personel müşteri yüzeyine
       de girebildiği için süzgeç burada daha da gereklidir. */
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
      warehouseId: ctx.place?.warehouseId ?? ctx.place?.shippingWarehouseId ?? null,
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
