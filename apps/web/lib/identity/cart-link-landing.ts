import type { CartLinkPurpose } from '@lezzet/types';

/**
 * Sohbet bağlantısının KAPI KARARI — saf, DB'siz, testli (15.16 · 15.21).
 *
 * Bağlantı iki amaçla gönderilir ve ikisi aynı kapıdan (`/auth/cart-link`) geçer:
 *   · **sepet** — ajanın ya da operatörün sohbette kurduğu sepet; hedef sepet sayfası.
 *   · **hesap** — sepetsiz sohbeti hesaba bağlama (kullanıcı tasarımı 08.09: müşteri KENDİSİ
 *     bağlar — e-posta koduyla giriş, aynı ekranda kod); hedef hesap sayfası.
 *
 * Amaç ADRESTEN okunur (`?to=hesap`) ve öyle kalıyor: hesap bağlantısı hesap sayfasına üretilir
 * (`cart_link.purpose = 'account'` → `/fr/compte?link=…`, `cart/link.ts`), sayfa kapıya `to=hesap`
 * ile devreder. Satırdaki amaç kapıda OKUNMAZ ve bilinçli: kapı jetonu doğrulamaz, varlığını
 * sızdırmamak için (`route.ts` künyesi). Adres kurcalanırsa olacak tek şey yanlış sayfaya varmaktır —
 * jeton yine tek kullanımlık ve girişe bağlı.
 *
 * Oturum varsa doğrudan hedefe (jeton kapıda tüketildi); yoksa giriş sayfasına, hedefi `next`te,
 * amacı `reason`da — giriş sayfası cümlesini oradan seçer ("sepetinizi görmek için" ≠
 * "sohbetinizi bağlamak için"). Çerezdeki jeton girişte tüketilir (`invite-handoff`).
 */

/** Bağlantı adresindeki amaç değeri — sepet şeridi hesap amaçlı bağlantıyı bununla üretir. */
export const CART_LINK_TO_ACCOUNT = 'hesap';

export function cartLinkPurposeOf(to: string | null | undefined): CartLinkPurpose {
  return to === CART_LINK_TO_ACCOUNT ? 'account' : 'cart';
}

export interface CartLinkLandingInput {
  purpose: CartLinkPurpose;
  signedIn: boolean;
  /** Dile göre çözülmüş yollar — karar yolları bilmez, alır. */
  cartPath: string;
  accountPath: string;
  loginPath: string;
}

/** Kapının göndereceği site-içi yol (origin'siz). */
export function cartLinkLanding(input: CartLinkLandingInput): string {
  const target = input.purpose === 'account' ? input.accountPath : input.cartPath;
  if (input.signedIn) return target;
  const reason = input.purpose === 'account' ? 'baglanti' : 'sepet';
  return `${input.loginPath}?next=${encodeURIComponent(target)}&reason=${reason}`;
}

/**
 * Bağlanma SONUCUNUN müşteriye söylenecek hâli — hesap sayfasının kısa ömürlü bildirimi.
 *
 * Tüketim sonucu (`claimCartLink`) altı hâl döner; müşterinin ayırt etmesi gereken dört cümle:
 *   `linked` (bağlandı; birleşme/devir de müşteri için "bağlandı"dır) · `own` (zaten bağlıydı) ·
 *   `foreign` (sohbet BAŞKA hesaba bağlı — insana düşer, sessizce ezilmez) · `invalid` (süresi dolmuş
 *   ya da kullanılmış). Tanınmayan bir sonuç `invalid` sayılır: yanlış bir "bağlandı" demek, olmayan
 *   bir bağa güvendirmek olurdu.
 */
export type ChatLinkNotice = 'linked' | 'own' | 'foreign' | 'invalid';

const NOTICES: readonly ChatLinkNotice[] = ['linked', 'own', 'foreign', 'invalid'];

export function chatLinkNoticeOf(claimStatus: string): ChatLinkNotice {
  if (claimStatus === 'linked' || claimStatus === 'merged' || claimStatus === 'transferred') return 'linked';
  if (claimStatus === 'own') return 'own';
  if (claimStatus === 'foreign_identity') return 'foreign';
  return 'invalid';
}

/** Çerezden okunan ham değer → bildirim; bilinmeyen değer bildirim DEĞİLDİR (`null`). */
export function parseChatLinkNotice(value: string | null | undefined): ChatLinkNotice | null {
  return value && (NOTICES as readonly string[]).includes(value) ? (value as ChatLinkNotice) : null;
}
