import { z } from 'zod';
import {
  InviteWelcomeSchema,
  NeighborWelcomeSchema,
  OrderNeighborInviteSchema,
  type InviteWelcomeView,
  type NeighborWelcomeView,
  type OrderNeighborInvite,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch, maybeAuthorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from '../api/client';
import { clearInvite, clearNeighborInvite, readInvite, readNeighborInvite } from './invite-store';

/*
  `GET /api/v1/invite/:code` — davet karşılamasının cihaz ucu. Şema `@lezzet/types`ta ve UÇ DA
  onunla üretiyor (sözleşme tek kaynak); burada yalnız çağrı var.

  ÇAĞRI `maybeAuthorizedFetch`: uç ziyaretçiye açık ama kimlikten YARARLANIR (keşif turunun aynı
  rejimi). Oturum yoksa istek Bearer'sız gider ve 401 dönmez; VARSA sunucu iki hâli ayırt edebilir
  — müşteri kendi bağlantısını açmıştır, ya da zaten müşteriyken bir tanıdığının bağlantısına
  dokunmuştur. `authorizedFetch` kullanılsaydı davetlinin — yani hesabı OLMAYAN kişinin — çağrısı
  ağa hiç çıkmadan 401'e düşerdi ki davetin tamamı o kişi için var.
*/

export function fetchInviteWelcome(code: string): Promise<ApiResult<InviteWelcomeView>> {
  return maybeAuthorizedFetch(`/api/v1/invite/${encodeURIComponent(code)}`, InviteWelcomeSchema);
}

/**
 * **Girişten SONRA çağrılan tek kapı** (21.44): cihazda bekleyen davet varsa hesaba bağlar ve
 * tüketir. Yoksa hiçbir şey yapmaz.
 *
 * ── NEDEN GİRİŞ YOLUNUN İÇİNDE DEĞİL, SONRASINDA ────────────────────────────
 * Kod eskiden `verifyOtp`un gövdesine ekleniyordu ve o çözüm yalnız e-posta yolunu kapsıyordu:
 * Google turu Supabase'e doğrudan gidiyor, o uçtan hiç geçmiyor — davet bağlantısına tıklayıp
 * *"Google ile devam et"* diyen davetli sessizce bağsız kalıyordu. Kapı artık giriş YÖNTEMİNİ
 * bilmiyor: oturum kurulduysa çağrılır, hangi yoldan kurulduğu önemsiz. Yarın WhatsApp açılınca
 * onun için ayrıca bir şey yazılmayacak.
 *
 * **İki çağıranı var ve ikisi de `lib/auth/` içinde** — oturumun GERÇEKTEN kurulduğu iki nokta
 * (`verifyOtp`un `setSession`i, `exchangeOAuthCode`un değişimi). Tek bir yere indirmenin yolu
 * `onAuthStateChange` dinleyicisi olurdu ama o abone oldukça `INITIAL_SESSION` ile de tetikleniyor
 * (sepet deposunun künyesi): her açılışta ölü bir bağlama denemesi eklerdi.
 *
 * **Sonuç DÖNMEZ ve hata FIRLATMAZ:** davet bir kolaylıktır, kimlik değil — bağ kurulmadı diye
 * girişin durması, çözdüğünden büyük bir arıza olurdu. Sunucu da zaten hep `true` döner; reddin
 * gerekçesi orada log'a düşer.
 *
 * **Tüketim YALNIZ çağrı BAŞARIYSA** (web'in `handOffNeighbor`ındaki *"profil yoksa çerez
 * korunur"* kuralının aynısı). Ayrım ince ama önemli:
 *   · Sunucu **200** döndüyse davet gerçekten değerlendirildi — kabul edilmiş ya da gerekçesiyle
 *     reddedilmiş olabilir; ikisinde de tekrar denenecek bir şey yok, kayıt silinir. Reddedilmiş
 *     bir davet cihazda kalsaydı aynı telefondan giriş yapan herkes onu yeniden denerdi.
 *   · **404** (profil henüz yazılmamış — trigger yarışı) ya da **ağ hatası** ise davet HİÇ
 *     sorulmadı. Silmek, kullanıcının şikâyet ettiği sessiz kaybın ta kendisi olurdu: kayıt durur
 *     ve bir sonraki giriş aynı kapıdan geçer.
 */
export async function claimPendingInvite(): Promise<void> {
  const [referralCode, neighborToken] = await Promise.all([readInvite(), readNeighborInvite()]);
  if (referralCode === null && neighborToken === null) return;

  /* İKİSİ TEK GÖVDEDE (21.45): davetli bir arkadaşının bağlantısıyla tanışıp, sonra bir komşusunun
     sefer davetine tıklayıp, en sonunda hesabını açabilir — ikisi de bekliyor olabilir. Ayrı ayrı
     yollasaydık cihaz iki tur atardı ve biri düşerse öteki yarım kalırdı. */
  const result = await authorizedFetch('/api/v1/me/invite/claim', z.literal(true), {
    method: 'POST',
    body: {
      ...(referralCode === null ? {} : { referralCode }),
      ...(neighborToken === null ? {} : { neighborToken }),
    },
  });
  if (result.error !== null) return;

  await Promise.all([referralCode === null ? undefined : clearInvite(), neighborToken === null ? undefined : clearNeighborInvite()]);
}

/** Komşu davetinin karşılama durumu — beş hâl; ekran hangisini çizeceğini bundan bilir. */
export function fetchNeighborWelcome(token: string): Promise<ApiResult<NeighborWelcomeView>> {
  return maybeAuthorizedFetch(`/api/v1/neighbor/${encodeURIComponent(token)}`, NeighborWelcomeSchema);
}

/**
 * Siparişin komşu davetini AÇAR ve paylaşılabilir adresini getirir (21.45) — sipariş tamamlandı
 * ekranının çağırdığı tek uç.
 *
 * **POST, çünkü ilk çağrı daveti ÜRETİYOR** (uç idempotent: ikincisi aynısını döner). Peşinen
 * açılmıyor — müşterilerin çoğu komşusunu çağırmaz ve her siparişe davet satırı yazmak
 * kullanılmayacak kayıt üretmek olurdu.
 *
 * `inviteUrl: null` ARIZA DEĞİL: kargo siparişinde "aynı sefer" yok, kesim saati dolmuş seferde de
 * çağrılacak kimse kalmamıştır. Ekran o hâlde şeridi hiç çizmez.
 */
export function openOrderNeighborInvite(orderId: string, locale: Locale): Promise<ApiResult<OrderNeighborInvite>> {
  return authorizedFetch(`/api/v1/me/invite/neighbor?locale=${locale}`, OrderNeighborInviteSchema, { method: 'POST', body: { orderId } });
}

/**
 * **Komşu davetini reddet** (kullanıcı kararı 21.08) — davet artık gün seçicide görünmez ve
 * sipariş ona bağlanmaz.
 *
 * Kimlik gövdede TAŞINMAZ, Bearer'dan çözülür: başkasının davetini reddettirmek gövdeye yazılacak
 * bir müşteri kimliğiyle mümkün olurdu (uç künyesi). Ret geri alınabilir — aynı bağlantıya yeniden
 * tıklamak kabulü öne alır.
 */
export function declineNeighborInvite(inviteId: string): Promise<ApiResult<boolean>> {
  return authorizedFetch('/api/v1/me/invite/neighbor/decline', z.boolean(), { method: 'POST', body: { inviteId } });
}
