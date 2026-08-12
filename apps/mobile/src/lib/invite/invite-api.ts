import { z } from 'zod';
import { InviteWelcomeSchema, type InviteWelcomeView } from '@lezzet/types';

import { authorizedFetch, maybeAuthorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from '../api/client';
import { clearInvite, readInvite } from './invite-store';

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
 * **Kod ne olursa olsun tüketilir** (sunucu cevabına bakılmadan): reddedilmiş bir davet cihazda
 * kalsaydı, aynı telefondan giriş yapan herkes onu yeniden denerdi ve hiçbiri tutmazdı.
 */
export async function claimPendingInvite(): Promise<void> {
  const referralCode = await readInvite();
  if (referralCode === null) return;

  await authorizedFetch('/api/v1/me/invite/claim', z.literal(true), { method: 'POST', body: { referralCode } });
  await clearInvite();
}
