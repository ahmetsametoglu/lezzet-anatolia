import { NeighborInviteClaimService, NeighborInviteService, OrderService, SettingsService, UserProfileService } from '@lezzet/database';
import {
  deliveryRunWindow,
  NEIGHBOR_INVITE_MAX_USES,
  ORDER_CUTOFF_DEFAULT,
  ORDER_CUTOFF_KEY,
  PREP_CUTOFF_DEFAULT,
  PREP_CUTOFF_KEY,
  readableCode,
  type DeliveryRunWindow,
} from '@lezzet/domain-core';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { NeighborInvite } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkReferrerById } from './referral';

/*
  KOMŞU DAVETİ (17.10) — davetin İKİNCİ türü.

  ── GETİREN DAVETİNDEN NEYİ FARKLI ──────────────────────────────────────────
  `customer/referral.ts` hesapsız birini MÜŞTERİ yapmayı ödüllendirir: anahtarı kişi, ömrü sonsuz,
  bir kez kurulur. Burası var olan bir SEFERE ikinci bir sipariş eklemeyi ödüllendirir: anahtarı
  `(bölge, gün)`, ömrü o günün kesim saatine kadar, davet başına birkaç kez kullanılır. Davet edilen
  kişi zaten müşterimiz olabilir (kullanıcı kararı 11.08) — o hâlde getiren ödülü hiç doğmaz ama
  komşu ödülü doğar. İkisi AYNI turda da doğabilir ve bu çift ödeme değildir: bir müşteri kazanıldı
  VE bir sefere sipariş eklendi.

  ── NEDEN ORTAK PAKETTE ─────────────────────────────────────────────────────
  Akışın üç ucu var ve üçü de iki yüzeyden çağrılıyor: daveti AÇMA (sipariş sonrası ekran),
  KARŞILAMA (bağlantının indiği sayfa) ve SEFERE BAĞLAMA (checkout). Web'de kalsaydı mobil kendi
  kopyasını yazardı — 17.9'da tam olarak bunun bedeli ölçüldü.

  ── ÖDÜL BURADA DEĞİL ───────────────────────────────────────────────────────
  Puan yazımı `feedback/points.ts` → `awardNeighborPoints`ta ve tetiği ödeme (`order/payment.ts`
  → `finalize`). Bu dosya daveti kurar ve bağlar; ödülün ne zaman doğduğu para tarafının kararı.
*/

/** Bağlantı belirteci — geri bildirim davetiyle aynı uzunluk ve alfabe (CSPRNG, O/0 ve I/1 yok). */
const TOKEN_LENGTH = 16;

// Kesim anahtarı ve varsayılanı ARTIK BURADA DEĞİL: `domain-core/delivery-days` tutuyor (kuralı
// uygulayan dosya). Yerel kopya `resolveDelivery` ile "aynı olduğunu" künyesinde söylüyordu — yani
// kopya olduğunu kendisi kabul ediyordu; kesim kuralı hazırlık saatini de okumaya başlayınca ikinci
// bir anahtar daha kopyalanacaktı.

/** Davetin paylaşılabilir TAM adresi. Dil PAYLAŞANIN dilidir (`inviteUrl` künyesindeki aynı gerekçe). */
export function neighborInviteUrl(token: string, locale: Locale): string {
  return localizedUrl('/neighbor/[token]', locale, { token });
}

export type OpenNeighborInviteOutcome =
  | { status: 'ok'; invite: NeighborInvite }
  | { status: 'not_found' }
  /** Sipariş başkasının — davet ancak kendi siparişinden açılır. */
  | { status: 'not_owner' }
  /** Kargo siparişi: sefer diye bir şey yok, çağrılacak bir gün de yok. */
  | { status: 'not_route' }
  /** Sefer geçti ya da bugünün kesim saati doldu — çağrılacak bir şey kalmadı. */
  | { status: 'run_closed'; window: DeliveryRunWindow };

/**
 * Siparişin komşu davetini açar — **varsa aynısını döner** (idempotent).
 *
 * `getOrCreateReferralCode` deseninin aynısı: müşterilerin çoğu komşusunu çağırmaz, her siparişe
 * peşinen bir davet satırı yazmak kullanılmayacak kayıt üretmek olurdu. İkinci çağrı yeni bir
 * bağlantı doğurmaz — doğursaydı müşterinin daha önce paylaştığı bağlantı sessizce ölürdü.
 *
 * **Kargo siparişinde davet açılmaz** ve bu bir kısıtlama değil, kavramın kendisi: kargoda "aynı
 * sefer" diye bir şey yok, taşıyıcı zaten paket başına ücretlendiriyor. Komşuyu çağırmanın hiçbir
 * tarafa kazandırdığı bir şey olmazdı.
 */
export async function openNeighborInvite(
  db: SupabaseClient,
  input: { orderId: string; customerId: string },
): Promise<OpenNeighborInviteOutcome> {
  const order = await new OrderService(db).getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.customerId !== input.customerId) return { status: 'not_owner' };
  if (order.deliveryType !== 'route' || !order.deliveryZoneId || !order.deliveryDate) return { status: 'not_route' };

  const invites = new NeighborInviteService(db);
  const existing = await invites.findByOrder(order.id);
  // Var olan davet, penceresi kapansa bile AYNEN döner: ekranın söyleyeceği cümleyi pencere
  // belirler (`readNeighborWelcome`), ama paylaşılmış bir bağlantı burada ikinci kez üretilmez.
  if (existing) return { status: 'ok', invite: existing };

  const window = await runWindowOf(db, order.deliveryDate, order.deliveryZoneId);
  if (window !== 'open') return { status: 'run_closed', window };

  const invite = await invites.insert({
    token: readableCode(TOKEN_LENGTH),
    inviterId: order.customerId,
    orderId: order.id,
    deliveryZoneId: order.deliveryZoneId,
    deliveryDate: order.deliveryDate,
    // Sınır AÇIKÇA geçiliyor, veritabanı varsayılanına bırakılmıyor (13.08): müşteri yüzeyi
    // *"o güne en fazla 3 komşu"* diyecek ve o sayıyı motorun uyguladığı yerden okumalı
    // (`NEIGHBOR_INVITE_MAX_USES` künyesi). Migration'daki `default 3` artık yedek.
    maxUses: NEIGHBOR_INVITE_MAX_USES,
  });
  return { status: 'ok', invite };
}

export type NeighborWelcome =
  | {
      status: 'ok';
      /** Davet edenin YALNIZ adı (ilk sözcük) — bağlantı tanımadığımız kanallarda dolaşıyor. */
      inviterName: string;
      /** Komşuya söz verilen gün — davetin doğduğu andaki sefer, siparişin bugünkü hâli değil. */
      deliveryDate: string;
      deliveryZoneId: string;
      inviteId: string;
    }
  /** Belirteç tanınmıyor — yanlış kopyalanmış olabilir. */
  | { status: 'unknown' }
  /** Ziyaretçi kendi bağlantısını açtı. */
  | { status: 'self' }
  /** Sefer geçti / bugünün kesim saati doldu — davet artık bir söz veremiyor. */
  | { status: 'run_closed'; window: DeliveryRunWindow; deliveryDate: string }
  /** Davetin kullanım hakkı doldu (`maxUses`). */
  | { status: 'full'; deliveryDate: string };

/**
 * Davet bağlantısının karşılama durumu.
 *
 * **Süzgeç servis değil BURASI** ve gerekçe `NeighborInviteService.findByToken` künyesinde: geçmiş
 * bir seferin daveti OKUNABİLMELİ ki komşuya "bu sefer geçti ama alışverişe devam edebilirsin"
 * denebilsin. Servis satırı verir, cümleyi kuracak kararı bu kapı verir.
 *
 * **Sıralama:** önce "bu benim bağlantım", sonra pencere, sonra doluluk. Kendi bağlantısını açan
 * müşteriye "kullanım hakkı doldu" demek doğru ama işe yaramaz bir cümle olurdu; ona söylenecek şey
 * bağlantısının ÇALIŞTIĞIDIR.
 */
export async function readNeighborWelcome(db: SupabaseClient, token: string, viewerId?: string | null): Promise<NeighborWelcome> {
  const invite = await new NeighborInviteService(db).findByToken(token);
  if (!invite) return { status: 'unknown' };
  if (viewerId && viewerId === invite.inviterId) return { status: 'self' };

  const window = await runWindowOf(db, invite.deliveryDate, invite.deliveryZoneId);
  if (window !== 'open') return { status: 'run_closed', window, deliveryDate: invite.deliveryDate };

  const used = await countNeighborInviteUses(db, invite.id);
  if (used >= invite.maxUses) return { status: 'full', deliveryDate: invite.deliveryDate };

  const inviter = await new UserProfileService(db).getById(invite.inviterId);
  return {
    status: 'ok',
    inviterName: firstName(inviter?.name ?? ''),
    deliveryDate: invite.deliveryDate,
    deliveryZoneId: invite.deliveryZoneId,
    inviteId: invite.id,
  };
}

/* `claimNeighborInvite` KALKTI (12.08 kararı). Belirteci checkout'a kadar taşıyıp orada doğrulayan
   kapıydı; yerini ikisi aldı: kabul artık kimlik doğduğu an KİŞİYE yazılıyor
   (`acceptNeighborInvite`) ve sipariş anında seferle eşleşen kabul aranıyor
   (`matchNeighborInviteForOrder`). Ayrılmasının sebebi kullanıcının sorusu: davet yalnız çerezde
   yaşarken, web'de hesap açıp uygulamayı sonra yükleyen kişi onu sessizce kaybediyordu. */

/**
 * **Daveti KİŞİYE yazar** (kullanıcı sorusu 12.08) — çerezin bittiği yer.
 *
 * Kullanıcının tarif ettiği yolculuk şuydu: *"ister önce gitsin, hesap açsın, gezinsin, sonra
 * mobil uygulamayı yüklesin — sepete geldiğinde bunu görebilmeli."* Davet yalnız çerezde
 * yaşarken bu üç yerden birden kopuyordu: web'de hesap açıp uygulamayı yükleyen kişide davet yok,
 * başka cihazdan giren kaybediyor, çerezi temizleyen siliyordu.
 *
 * Kabul kişiye yapışınca hepsi kendiliğinden çözülüyor: uygulama sonradan yüklense de daveti
 * sunucudan okur, sepette cümle kurulabilir, komşunun günü önseçili gelir ve iki yüzey AYNI kaydı
 * okur — biri unutamaz.
 *
 * **İDEMPOTENT:** aynı kişi aynı daveti iki kez kabul ederse ikinci satır açılmaz (veride de
 * unique). Pencere kapalıysa ya da davet doluysa kabul YAZILMAZ — ölü bir daveti kişiye yapıştırmak,
 * sepette çalışmayan bir cümle göstermek olurdu.
 *
 * **Kendi davetini kabul edemez:** karşılama sayfası zaten `self` diyor, ama kapı da tutuyor —
 * ekran değişse bile veri bozulmasın.
 */
export async function acceptNeighborInvite(
  db: SupabaseClient,
  input: { token: string; customerId: string },
): Promise<{ status: 'ok'; inviteId: string } | { status: 'rejected'; reason: 'unknown' | 'self' | 'run_closed' | 'full' }> {
  const invite = await new NeighborInviteService(db).findByToken(input.token);
  if (!invite) return { status: 'rejected', reason: 'unknown' };
  if (invite.inviterId === input.customerId) return { status: 'rejected', reason: 'self' };

  const claims = new NeighborInviteClaimService(db);
  // Zaten kabul edilmişse pencere/doluluk yeniden sorulmaz: kabul geçmişte olmuş bir olaydır ve
  // ikinci kez "hâlâ geçerli mi" diye sormak, aynı tıklamayı iki farklı cevaba götürürdü.
  const existing = await claims.find(invite.id, input.customerId);
  if (existing) return { status: 'ok', inviteId: invite.id };

  if ((await runWindowOf(db, invite.deliveryDate, invite.deliveryZoneId)) !== 'open') return { status: 'rejected', reason: 'run_closed' };
  if ((await countNeighborInviteUses(db, invite.id)) >= invite.maxUses) return { status: 'rejected', reason: 'full' };

  await claims.insert({ inviteId: invite.id, customerId: input.customerId });

  /**
   * ── KOMŞUSUNU ÇAĞIRAN, YENİ MÜŞTERİ DE GETİRMİŞ OLABİLİR (kullanıcı kararı 17.08) ──
   * Ölçülen boşluk: `referred_by`yi yazan tek yol getiren daveti kodundan geçiyordu
   * (`attachReferralOnLogin` → `referralCode`), oysa komşu daveti bağlantısı kod değil **token**
   * taşıyor. Sonuç, komşu davetiyle gelip kaydolan kişinin *"kimsenin getirmediği müşteri"* olarak
   * doğmasıydı: davet gerçek bir yeni müşteri kazandırdığı hâlde 500 puanlık getiren ödülü hiç
   * doğmuyordu. `feedback/points.ts` künyesi bunun tersini vaat ediyordu — kod eksikti, künye değil.
   *
   * **İki ödül AYRI şeyi ölçer ve birlikte doğabilir** (★ karar 2f): komşu ödülü SEFERE bağlıdır
   * (o güne ikinci sipariş = durak başına maliyet düşer), getiren ödülünün seferle ilgisi YOKTUR —
   * kullanıcının cümlesi: *"o kişi o sefer veya başka sefer veya benimle çok alakasız posta kodunda
   * dahi oturabilir… bir tane başarılı sipariş gerçekleştirmesi lazım."*
   *
   * Bağ ortak kapıdan kuruluyor, kural kopyalanmıyor: `linkReferrerById` zaten kendini getireni,
   * zaten bağlı olanı ve **zaten müşteri olanı** eliyor. Yani bu satır ancak gerçekten yeni bir
   * müşteride bağ kurar; ödül yine kendi anında (parası alındığında) doğar.
   *
   * **Kabulü DÜŞÜRMEZ:** bağ kurulamazsa komşu daveti yine kabul edilmiştir.
   */
  await linkReferrerById(db, input.customerId, invite.inviterId);

  return { status: 'ok', inviteId: invite.id };
}

/**
 * **"Puan yolda"** — davet EDENİN henüz yazılmamış komşu ödülleri (★ karar 3 · MB-57).
 *
 * Kullanıcının kuralı: *"komşu siparişi verdiği anda davet edene «komşun sipariş verdi — 100 puan
 * yolda, ödeme alınınca hesabına geçecek» gösterilir; puan yazılmaz ama görünür olur."* Beklemenin
 * kendisi doğaldır (ödül başkasının parasına bağlı), **görünmez olması** kusurdu: müşteri komşusunu
 * çağırıyor, komşu sipariş veriyor ve ekranda hiçbir şey değişmiyordu.
 *
 * ── DEFTERE YAZILMAZ, TÜRETİLİR ─────────────────────────────────────────────
 * Bekleyen ödül `points_entry`ye girmez ve girmemeli: defter *"ne oldu"*yu tutar, *"ne olabilir"*i
 * değil. Bakiye satırların toplamı olduğu için sanal bir satır bakiyeyi de yalan söyletirdi. Aynı
 * sebeple ekranda da listeye karışmaz — geçmişin ÜSTÜNDE ayrı bir blok olarak durur.
 *
 * ── ÖLÇÜT ÖDÜLÜN KENDİ KOŞULUDUR ────────────────────────────────────────────
 * Sipariş verilmiş (iptal değil) ama parası alınmamış (`payment_status <> 'paid'`). Ödül tam da o
 * geçişte doğuyor (`order/payment.ts` → `finalize`), yani "yolda" olan küme, ödülün beklediği
 * kümenin aynısı. Kendi davetini kullanan sipariş elenir — ödül de elenirdi.
 *
 * **Getiren ödülü için karşılığı YOK ve bilinçli:** ★ karar 3 "yolda" durumunu yalnız komşu ödülü
 * için tanımlıyor. Getiren tarafında bekleme çok daha uzun ve belirsiz (davet edilen kişi hiç
 * sipariş vermeyebilir); orada bir söz vermek, tutulmayabilecek bir söz olurdu.
 */
export interface PendingNeighborAward {
  /** Davet edilen komşunun YALNIZ adı (ilk sözcük) — ekranın kuracağı cümlenin öznesi. */
  neighborName: string;
  deliveryDate: string;
}

export async function readPendingNeighborAwards(db: SupabaseClient, inviterId: string): Promise<PendingNeighborAward[]> {
  const invites = await new NeighborInviteService(db).listByInviter(inviterId);
  if (invites.length === 0) return [];

  const byId = new Map(invites.map((invite) => [invite.id, invite]));
  const orders = await new OrderService(db).listByNeighborInvites([...byId.keys()]);

  const bekleyen = orders.filter(
    (order) => order.status !== 'cancelled' && order.paymentStatus !== 'paid' && order.customerId !== inviterId,
  );
  if (bekleyen.length === 0) return [];

  // Ad TEK sorguda: sipariş başına profil okumak, hesap ekranını komşu sayısı kadar tura sokardı.
  const profiles = await new UserProfileService(db).listByIds([...new Set(bekleyen.map((order) => order.customerId))]);
  const nameById = new Map(profiles.map((profile) => [profile.id, firstName(profile.name)]));

  return bekleyen.flatMap((order) => {
    const invite = byId.get(order.neighborInviteId ?? '');
    const name = nameById.get(order.customerId);
    return invite && name ? [{ neighborName: name, deliveryDate: invite.deliveryDate }] : [];
  });
}

/** Müşterinin BEKLEYEN komşu daveti — sepetin, gün seçiminin ve ana ekranın okuduğu şey. */
export interface PendingNeighborInvite {
  inviteId: string;
  /** Davet edenin YALNIZ adı (ilk sözcük). */
  inviterName: string;
  deliveryDate: string;
  deliveryZoneId: string;
}

/**
 * **Bekleyen davet** — kabul edilmiş ama henüz siparişe dönmemiş, seferi hâlâ açık olan.
 *
 * "Bekliyor" SAKLANMIYOR, türetiliyor (migration künyesi): davet künyesini taşıyan iptal-olmayan
 * bir sipariş varsa o kabul tüketilmiştir; sefer penceresi kapandıysa da beklemenin anlamı yoktur.
 * Üçüncü bir damga tutmak, iptal edilen siparişte elle geri alınacak bir durum daha demekti.
 *
 * **En YAKIN sefer döner**, çünkü aynı kişiyi iki komşusu iki ayrı sefere çağırabilir ve ekranın
 * kuracağı cümle tek: en yakın gün, müşterinin ilk karşılaşacağı gündür. Checkout ise cümleye
 * değil SEFERE bakar (`claimNeighborInvite`) — orada seçim günün kendisinden gelir.
 *
 * `null` = bekleyen yok; ekran hiçbir şey çizmez.
 */
export async function readPendingNeighborInvite(db: SupabaseClient, customerId: string): Promise<PendingNeighborInvite | null> {
  const claims = await new NeighborInviteClaimService(db).listByCustomer(customerId);
  if (claims.length === 0) return null;

  const invites = await new NeighborInviteService(db).listByIds(claims.map((c) => c.inviteId));
  // Sefer günü yakından uzağa: ekranın söyleyeceği gün, müşterinin ilk karşılaşacağı gün.
  const sorted = [...invites].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  for (const invite of sorted) {
    if ((await runWindowOf(db, invite.deliveryDate, invite.deliveryZoneId)) !== 'open') continue;
    // Bu daveti zaten siparişe dönüştürmüşse bekleyen bir şey yok. Kendi siparişine bakılıyor:
    // başka komşunun aynı davetten verdiği sipariş bu kişinin davetini tüketmez.
    const orders = await new OrderService(db).listByNeighborInvite(invite.id);
    if (orders.some((order) => order.customerId === customerId && order.status !== 'cancelled')) continue;

    const inviter = await new UserProfileService(db).getById(invite.inviterId);
    return {
      inviteId: invite.id,
      inviterName: firstName(inviter?.name ?? ''),
      deliveryDate: invite.deliveryDate,
      deliveryZoneId: invite.deliveryZoneId,
    };
  }
  return null;
}

/**
 * Bu siparişin seferine uyan KABUL EDİLMİŞ davet — checkout'un sorusu (12.08 sonrası).
 *
 * `claimNeighborInvite`in yerini aldı ve fark şu: orada kaynak ÇEREZDEKİ belirteçti, burada kişiye
 * yazılmış kabul. Çerez artık yalnız kimliksiz ziyaretçinin köprüsü — kimlik doğduğu an kabul
 * kişiye geçiyor (`acceptNeighborInvite`), yani sipariş anında sorulacak yer kişinin kendi kaydı.
 *
 * **Sefer eşleşmesi hâlâ zorunlu** ve bu işin tamamının sebebi: davet BELLİ bir sefere yapıldı.
 * Komşu iki hafta sonrasına sipariş verirse ortada komşuluk da yok, tasarruf da.
 */
export async function matchNeighborInviteForOrder(
  db: SupabaseClient,
  input: { customerId: string; deliveryZoneId: string | null; deliveryDate: string | null },
): Promise<string | null> {
  if (!input.deliveryZoneId || !input.deliveryDate) return null;

  const claims = await new NeighborInviteClaimService(db).listByCustomer(input.customerId);
  if (claims.length === 0) return null;

  const invites = await new NeighborInviteService(db).listByIds(claims.map((c) => c.inviteId));
  const match = invites.find(
    (invite) =>
      invite.deliveryZoneId === input.deliveryZoneId && invite.deliveryDate === input.deliveryDate && invite.inviterId !== input.customerId,
  );
  if (!match) return null;

  // Kontenjan sipariş ANINDA sorulur: kabul ile sipariş arasında başka komşular daveti doldurmuş
  // olabilir. Kabul kaydı bir hak değil, bir niyettir.
  if ((await countNeighborInviteUses(db, match.id)) >= match.maxUses) return null;
  if ((await runWindowOf(db, match.deliveryDate, match.deliveryZoneId)) !== 'open') return null;
  return match.id;
}

/**
 * Davetin kaç kez kullanıldığı — **sayaçtan değil siparişlerden**.
 *
 * `neighbor_invite` satırında azalan bir sayaç YOK (migration künyesi): sipariş iptal olduğunda
 * sayacın geri alınması gerekirdi ve bir gün biri unuturdu. İptal edilmiş sipariş burada da
 * sayılmaz — "iptal olmuş gibi değil, hiç olmamış gibi" davranılır (indirim kotası sayımının
 * aynı kuralı).
 */
export async function countNeighborInviteUses(db: SupabaseClient, inviteId: string): Promise<number> {
  const orders = await new OrderService(db).listByNeighborInvite(inviteId);
  return orders.filter((order) => order.status !== 'cancelled').length;
}

/**
 * Sefer hâlâ açık mı — eşikler ayardan, kural motordan.
 *
 * **Eşikler ROTA kapsamıyla okunuyor** (`zoneId`, kullanıcı kararı 17.08): davet bir seferin daveti,
 * sefer de bir rotanın. Küresel satırı okumak, rotaya yazılmış kesimi yok sayıp müşteriye *"bu sefere
 * yetişirsin"* demek olurdu — checkout ise aynı günü listesinde göstermezdi. `resolveDelivery` ile
 * aynı iki anahtar ve aynı kapsam: iki yerde ayrılırsa fark yalnız kesim saati civarında görünür.
 *
 * Hazırlık kapanışı da okunuyor çünkü kesimin hangi güne ait olduğunu o belirliyor.
 */
async function runWindowOf(
  db: SupabaseClient,
  deliveryDate: string,
  zoneId: string | null,
): Promise<DeliveryRunWindow> {
  const settings = new SettingsService(db);
  const scope = zoneId ? { zoneId } : {};
  const [cutoffTime, prepCutoffTime] = await Promise.all([
    settings.get<string>(ORDER_CUTOFF_KEY, ORDER_CUTOFF_DEFAULT, scope),
    settings.get<string>(PREP_CUTOFF_KEY, PREP_CUTOFF_DEFAULT, scope),
  ]);
  return deliveryRunWindow({ deliveryDate, now: new Date(), cutoffTime, prepCutoffTime });
}

/** Adın yalnız ilk sözcüğü — `customer/referral.ts`teki aynı kural; ekran isimsiz cümleyi kendi kurar. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * Davet açılırken beklenmedik bir hata olursa akışı düşürmemek için sarılmış hâl — sipariş
 * ekranının çağırdığı yol. Ödül gibi davet de bir KOLAYLIK: açılamadıysa müşteri siparişini yine
 * görebilmeli. Sessiz değil, izli.
 */
export async function tryOpenNeighborInvite(
  db: SupabaseClient,
  input: { orderId: string; customerId: string },
): Promise<NeighborInvite | null> {
  try {
    const outcome = await openNeighborInvite(db, input);
    return outcome.status === 'ok' ? outcome.invite : null;
  } catch (err) {
    logger.warn(
      { context: 'customer/neighbor', orderId: input.orderId, err: err instanceof Error ? err.message : String(err) },
      'komşu daveti açılamadı — sipariş etkilenmedi',
    );
    return null;
  }
}
