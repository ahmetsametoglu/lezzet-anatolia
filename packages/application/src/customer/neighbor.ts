import { NeighborInviteClaimService, NeighborInviteService, OrderService, SettingsService, UserProfileService } from '@lezzet/database';
import {
  deliveryRunWindow,
  isProfessionalCustomer,
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
import type { NeighborInvite, Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkReferrerById } from './referral';

/*
  Komşu daveti, davetin ikinci türü: getiren daveti (`customer/referral.ts`) hesapsız birini müşteri yapmayı, bu ise var olan bir
  sefere (bölge, gün) o günün kesim saatine kadar ikinci bir sipariş eklemeyi ödüllendirir; davet edilen zaten müşteri olabilir ve iki
  ödül aynı turda doğabilir, çünkü ayrı şeyleri ölçerler. Açma, karşılama ve sefere bağlama iki yüzeyden çağrıldığı için ortak pakette;
  puan yazımı burada değil, ödemenin tetiğiyle `feedback/points.ts`te.
*/

/** Bağlantı belirteci — geri bildirim davetiyle aynı uzunluk ve alfabe (CSPRNG, O/0 ve I/1 yok). */
const TOKEN_LENGTH = 16;

/** Davetin paylaşılabilir TAM adresi. Dil PAYLAŞANIN dilidir (`inviteUrl` künyesindeki aynı gerekçe). */
export function neighborInviteUrl(token: string, locale: Locale): string {
  return localizedUrl('/neighbor/[token]', locale, { token });
}

export type OpenNeighborInviteOutcome =
  /** `created`: davet bu çağrıda açıldı, henüz kimse yararlanmadı. */
  | { status: 'ok'; invite: NeighborInvite; created: boolean }
  | { status: 'not_found' }
  /** Sipariş başkasının — davet ancak kendi siparişinden açılır. */
  | { status: 'not_owner' }
  /** Kargo siparişi: sefer diye bir şey yok, çağrılacak bir gün de yok. */
  | { status: 'not_route' }
  /** Profesyonel müşteri: davet puan vaat eder ve tüketici promosyonu ona kapalıdır (`isProfessionalCustomer`). */
  | { status: 'not_eligible' }
  /** Sefer geçti ya da bugünün kesim saati doldu — çağrılacak bir şey kalmadı. */
  | { status: 'run_closed'; window: DeliveryRunWindow };

/**
 * Siparişin komşu davetini açar, varsa aynısını döner: her siparişe peşinen davet yazmak kullanılmayacak kayıt üretirdi, ikinci
 * çağrının yeni bağlantı doğurması ise paylaşılmış bağlantıyı sessizce öldürürdü. Kargo siparişinde davet açılmaz, çünkü kargoda
 * "aynı sefer" yoktur ve komşuyu çağırmak kimseye bir şey kazandırmaz.
 */
export async function openNeighborInvite(
  db: SupabaseClient,
  input: { orderId: string; customerId: string; order?: Order },
): Promise<OpenNeighborInviteOutcome> {
  const order = input.order ?? (await new OrderService(db).getById(input.orderId));
  if (!order) return { status: 'not_found' };
  if (order.customerId !== input.customerId) return { status: 'not_owner' };
  if (order.deliveryType !== 'route' || !order.deliveryZoneId || !order.deliveryDate) return { status: 'not_route' };

  const invites = new NeighborInviteService(db);
  // Pencere yalnız yeni davet açılacaksa gerekir ama var olan davetle aynı turda okunur: sipariş sonrası ekran bu zinciri bekliyor.
  const [existing, window, customer] = await Promise.all([
    invites.findByOrder(order.id),
    runWindowOf(db, order.deliveryDate, order.deliveryZoneId),
    new UserProfileService(db).getById(order.customerId),
  ]);
  if (isProfessionalCustomer(customer)) return { status: 'not_eligible' };
  // Var olan davet, penceresi kapansa bile AYNEN döner: ekranın söyleyeceği cümleyi pencere
  // belirler (`readNeighborWelcome`), ama paylaşılmış bir bağlantı burada ikinci kez üretilmez.
  if (existing) return { status: 'ok', invite: existing, created: false };
  if (window !== 'open') return { status: 'run_closed', window };

  const invite = await invites.insert({
    token: readableCode(TOKEN_LENGTH),
    inviterId: order.customerId,
    orderId: order.id,
    deliveryZoneId: order.deliveryZoneId,
    deliveryDate: order.deliveryDate,
    // Sınır açıkça geçilir, veritabanı varsayılanına bırakılmaz: müşteri yüzeyi "o güne en fazla 3 komşu" der ve sayıyı motorun
    // uyguladığı yerden okumalı (`NEIGHBOR_INVITE_MAX_USES`).
    maxUses: NEIGHBOR_INVITE_MAX_USES,
  });
  return { status: 'ok', invite, created: true };
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
  /** Sefer geçti ya da bugünün kesim saati doldu: davet bir söz veremez. */
  | { status: 'run_closed'; window: DeliveryRunWindow; deliveryDate: string }
  /** Davetin kullanım hakkı doldu (`maxUses`). */
  | { status: 'full'; deliveryDate: string };

/**
 * Davet bağlantısının karşılama durumu; süzgeç servis değil burasıdır, çünkü geçmiş seferin daveti de okunmalı ki komşuya "bu sefer
 * geçti ama alışverişe devam edebilirsin" denebilsin. Sıra önce "bu benim bağlantım", sonra pencere, sonra doluluktur: kendi
 * bağlantısını açana söylenecek şey bağlantının çalıştığıdır.
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

/**
 * Daveti kişiye yazar: davet yalnız çerezde yaşasaydı web'de hesap açıp uygulamayı sonra yükleyen, başka cihazdan giren ya da çerezi
 * temizleyen onu kaybederdi; kişiye yapışınca iki yüzey aynı kaydı okur. Kabul idempotenttir ve pencere kapalıysa, davet doluysa ya
 * da kişi kendi davetini kabul ediyorsa yazılmaz, çünkü ölü bir daveti kişiye yapıştırmak sepette çalışmayan bir cümle olurdu.
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
  if (existing) {
    /* Tekrar tıklama seçimi değiştirir: müşteri önceki davet bağlantısına yeniden tıklayarak o daveti seçebilmeli. Kabulün kendisi
       tekrarlanmaz (veride tek satır); tazelenen yalnız seçim damgası ve varsa ret. */
    await claims.reselect(existing.id);
    return { status: 'ok', inviteId: invite.id };
  }

  if ((await runWindowOf(db, invite.deliveryDate, invite.deliveryZoneId)) !== 'open') return { status: 'rejected', reason: 'run_closed' };
  if ((await countNeighborInviteUses(db, invite.id)) >= invite.maxUses) return { status: 'rejected', reason: 'full' };

  await claims.insert({ inviteId: invite.id, customerId: input.customerId });

  /**
   * Komşu davetiyle gelip kaydolan kişi yeni müşteriyse davet edene getiren bağı da kurulur: bağlantı kod değil belirteç taşıdığı için
   * bu yol olmadan o kişi "kimsenin getirmediği müşteri" olarak doğardı. `linkReferrerById` kendini getireni, zaten bağlı olanı ve
   * zaten müşteri olanı eler; bağ kurulamazsa kabul yine geçerlidir.
   */
  await linkReferrerById(db, input.customerId, invite.inviterId);

  return { status: 'ok', inviteId: invite.id };
}

/**
 * "Puan yolda": davet edenin henüz yazılmamış komşu ödülleri, yani verilmiş (iptal olmayan) ama parası alınmamış komşu siparişleri;
 * ödül tam o ödemede doğduğu için küme ödülün beklediği kümenin aynısıdır ve deftere yazılmaz, türetilir. Getiren ödülü için karşılığı
 * yoktur, çünkü orada bekleme belirsizdir ve verilecek söz tutulmayabilir.
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
 * Bekleyen davet: kabul edilmiş, henüz siparişe dönmemiş ve seferi hâlâ açık olan; "bekliyor" saklanmaz, türetilir, çünkü üçüncü bir
 * damga iptal edilen siparişte elle geri alınacak bir durum daha demekti. Liste günden güne sıralı döner; boşsa ekran hiçbir şey çizmez.
 */
export async function readPendingNeighborInvites(db: SupabaseClient, customerId: string): Promise<PendingNeighborInvite[]> {
  const claims = await new NeighborInviteClaimService(db).listByCustomer(customerId);
  /* Reddedilen seçime girmez; satır durur, çünkü ret de bir olaydır ve yeniden kabul damgayı temizleyip geri alır. */
  const live = claims.filter((claim) => claim.declinedAt === null);
  if (live.length === 0) return [];

  /* Sıra kararın kendisidir: `listByCustomer` kabulleri `chosenAt` azalan getirir, `seen` süzgeci aynı (gün, bölge) için ilk gördüğünü
     tutar ve böylece son kabul edilen kazanır. Ölçüt dizinin geliş sırası değil zaman damgasıdır, yoksa aynı girdi farklı sonuç verirdi. */
  const inviteById = new Map(
    (await new NeighborInviteService(db).listByIds(live.map((c) => c.inviteId))).map((invite) => [invite.id, invite]),
  );

  const pending: PendingNeighborInvite[] = [];
  const seen = new Set<string>();
  for (const claim of live) {
    const invite = inviteById.get(claim.inviteId);
    if (!invite) continue;
    const key = `${invite.deliveryDate}|${invite.deliveryZoneId}`;
    if (seen.has(key)) continue;

    if ((await runWindowOf(db, invite.deliveryDate, invite.deliveryZoneId)) !== 'open') continue;
    // Bu daveti zaten siparişe dönüştürmüşse bekleyen bir şey yok. Kendi siparişine bakılıyor:
    // başka komşunun aynı davetten verdiği sipariş bu kişinin davetini tüketmez.
    const orders = await new OrderService(db).listByNeighborInvite(invite.id);
    if (orders.some((order) => order.customerId === customerId && order.status !== 'cancelled')) continue;

    seen.add(key);
    const inviter = await new UserProfileService(db).getById(invite.inviterId);
    pending.push({
      inviteId: invite.id,
      inviterName: firstName(inviter?.name ?? ''),
      deliveryDate: invite.deliveryDate,
      deliveryZoneId: invite.deliveryZoneId,
    });
  }

  // Ekrana giderken gün yakından uzağa: gün seçici zaten böyle sıralı, bant da onun yanında konuşuyor.
  return pending.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
}

/**
 * Davetin reddi: davetli daveti geri çevirir, seçime girmez ve ekranda gösterilmez. Satır silinmez, çünkü ret geri alınabilir: aynı
 * bağlantıya yeniden tıklayınca `acceptNeighborInvite` damgayı temizleyip kaydı öne alır.
 */
export async function declineNeighborInvite(
  db: SupabaseClient,
  input: { inviteId: string; customerId: string },
): Promise<{ status: 'ok' } | { status: 'rejected'; reason: 'unknown' }> {
  const claims = new NeighborInviteClaimService(db);
  const claim = await claims.find(input.inviteId, input.customerId);
  // Kabul etmediği bir daveti reddedemez — reddedilecek bir şey yok.
  if (!claim) return { status: 'rejected', reason: 'unknown' };
  await claims.decline(claim.id);
  return { status: 'ok' };
}

/**
 * Bu siparişin seferine uyan, kişiye yazılmış kabul edilmiş davet; kaynak çerez değil kişinin kendi kaydıdır (`acceptNeighborInvite`).
 * Sefer eşleşmesi zorunludur, çünkü davet belli bir sefere yapıldı: komşu iki hafta sonrasına sipariş verirse ortada komşuluk da
 * tasarruf da yoktur.
 */
export async function matchNeighborInviteForOrder(
  db: SupabaseClient,
  input: { customerId: string; deliveryZoneId: string | null; deliveryDate: string | null },
): Promise<string | null> {
  if (!input.deliveryZoneId || !input.deliveryDate) return null;

  const claims = await new NeighborInviteClaimService(db).listByCustomer(input.customerId);
  // Reddedilen davet siparişe de bağlanmaz — ekranda göstermeyip ödülü yine yazmak çelişki olurdu.
  const live = claims.filter((claim) => claim.declinedAt === null);
  if (live.length === 0) return null;

  const inviteById = new Map(
    (await new NeighborInviteService(db).listByIds(live.map((c) => c.inviteId))).map((invite) => [invite.id, invite]),
  );

  /* Kazanan son kabul edilendir: `listByCustomer` kabulleri `chosenAt` azalan getirdiği için ilk uyan kabul müşterinin en son seçtiğidir.
     Arama davetler üzerinde dönseydi, aynı gün ve bölgeye iki komşu davet ettiğinde ödülün kime yazıldığını veritabanının dönüş sırası
     belirlerdi. */
  const winner = live.find((claim) => {
    const invite = inviteById.get(claim.inviteId);
    return (
      invite !== undefined &&
      invite.deliveryZoneId === input.deliveryZoneId &&
      invite.deliveryDate === input.deliveryDate &&
      invite.inviterId !== input.customerId
    );
  });
  const match = winner ? inviteById.get(winner.inviteId) : undefined;
  if (!match) return null;

  // Kontenjan sipariş ANINDA sorulur: kabul ile sipariş arasında başka komşular daveti doldurmuş
  // olabilir. Kabul kaydı bir hak değil, bir niyettir.
  if ((await countNeighborInviteUses(db, match.id)) >= match.maxUses) return null;
  if ((await runWindowOf(db, match.deliveryDate, match.deliveryZoneId)) !== 'open') return null;
  return match.id;
}

/**
 * Davetin kaç kez kullanıldığı, sayaçtan değil siparişlerden: azalan bir sayaç iptal edilen siparişte geri alınmayı gerektirirdi ve bir
 * gün unutulurdu. İptal edilmiş sipariş sayılmaz, indirim kotası sayımının aynı kuralı.
 */
export async function countNeighborInviteUses(db: SupabaseClient, inviteId: string): Promise<number> {
  const orders = await new OrderService(db).listByNeighborInvite(inviteId);
  return orders.filter((order) => order.status !== 'cancelled').length;
}

/**
 * Davetten kaç komşunun daha yararlanabileceği, sıfırın altına düşmeden: tavan davet açılırken dondurulur ve ayar sonradan
 * düşürülebilir, çıplak çıkarma o gün negatif verirdi. Formül iki yüzey aynı sayıyı söylesin diye burada; sıfır "davet yok" değil
 * "davet doldu" demektir, daveti olmayan siparişte bu fonksiyon çağrılmaz.
 */
export async function remainingNeighborInviteUses(
  db: SupabaseClient,
  invite: Pick<NeighborInvite, 'id' | 'maxUses'>,
): Promise<number> {
  return Math.max(0, invite.maxUses - (await countNeighborInviteUses(db, invite.id)));
}

/**
 * Sefer hâlâ açık mı: eşikler rota kapsamıyla ayardan, kural motordan okunur, çünkü küresel satırı okumak rotaya yazılmış kesimi yok
 * sayıp checkout'un göstermediği bir güne "yetişirsin" demek olurdu. Hazırlık kapanışı da okunur, kesimin hangi güne ait olduğunu o
 * belirler.
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
 * Siparişin daveti ve kalan hakkı tek kapıda, iki yüzeyin sipariş sonrası ekranı için; beklenmedik hata akışı düşürmez, çünkü davet bir
 * kolaylıktır ve açılamazsa müşteri siparişini yine görmeli. Hata sessiz değil, iz bırakır.
 */
export async function tryOpenNeighborInvite(
  db: SupabaseClient,
  input: { orderId: string; customerId: string; order?: Order },
): Promise<{ invite: NeighborInvite; remainingUses: number } | null> {
  try {
    const outcome = await openNeighborInvite(db, input);
    if (outcome.status !== 'ok') return null;
    // Yeni açılan davetten henüz kimse yararlanmadı; sayım yalnız var olan davette gerekir.
    const remainingUses = outcome.created ? outcome.invite.maxUses : await remainingNeighborInviteUses(db, outcome.invite);
    return { invite: outcome.invite, remainingUses };
  } catch (err) {
    logger.warn(
      { context: 'customer/neighbor', orderId: input.orderId, err: err instanceof Error ? err.message : String(err) },
      'komşu daveti açılamadı — sipariş etkilenmedi',
    );
    return null;
  }
}
