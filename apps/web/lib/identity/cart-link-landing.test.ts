import { describe, expect, it } from 'vitest';
import { cartLinkLanding, cartLinkPurposeOf, chatLinkNoticeOf, parseChatLinkNotice } from './cart-link-landing';

/**
 * Sohbet bağlantısının kapı kararı (15.16 · 15.21) — saf, DB'siz.
 *
 * Korunan şey iki amacın AYRIŞMASI: sepetsiz gönderilen bağlantı müşteriyi "sepetinizi görmek
 * için" cümlesiyle girişe ve girişten sonra boş sepete götürmemeli.
 */
const paths = { cartPath: '/fr/panier', accountPath: '/fr/compte', loginPath: '/fr/connexion' };

describe('bağlantının amacı', () => {
  it('yalnız `hesap` değeri hesap amacıdır; boş, bilinmeyen ve sepet → sepet', () => {
    expect(cartLinkPurposeOf('hesap')).toBe('account');
    expect(cartLinkPurposeOf(undefined)).toBe('cart');
    expect(cartLinkPurposeOf(null)).toBe('cart');
    expect(cartLinkPurposeOf('sepet')).toBe('cart');
    expect(cartLinkPurposeOf('HESAP')).toBe('cart');
  });
});

describe('kapının hedefi', () => {
  it('oturum varsa doğrudan amacın sayfasına — sepet ya da hesap', () => {
    expect(cartLinkLanding({ purpose: 'cart', signedIn: true, ...paths })).toBe('/fr/panier');
    expect(cartLinkLanding({ purpose: 'account', signedIn: true, ...paths })).toBe('/fr/compte');
  });

  it('oturum yoksa girişe; hedef `next`te, amaç `reason`da — cümle amaca göre seçilir', () => {
    expect(cartLinkLanding({ purpose: 'cart', signedIn: false, ...paths })).toBe('/fr/connexion?next=%2Ffr%2Fpanier&reason=sepet');
    expect(cartLinkLanding({ purpose: 'account', signedIn: false, ...paths })).toBe('/fr/connexion?next=%2Ffr%2Fcompte&reason=baglanti');
  });
});

describe('bağlanma sonucunun cümlesi', () => {
  it('birleşme ve devir de müşteri için "bağlandı"dır; başka hesap ve bilinmeyen ayrışır', () => {
    expect(chatLinkNoticeOf('linked')).toBe('linked');
    expect(chatLinkNoticeOf('merged')).toBe('linked');
    expect(chatLinkNoticeOf('transferred')).toBe('linked');
    expect(chatLinkNoticeOf('own')).toBe('own');
    expect(chatLinkNoticeOf('foreign_identity')).toBe('foreign');
    expect(chatLinkNoticeOf('invalid')).toBe('invalid');
    // Tanınmayan sonuç "bağlandı" DEĞİLDİR — olmayan bir bağa güvendirmek en pahalı yanlış olurdu.
    expect(chatLinkNoticeOf('something_new')).toBe('invalid');
  });

  it('çerezden yalnız tanınan değer bildirim olur', () => {
    expect(parseChatLinkNotice('linked')).toBe('linked');
    expect(parseChatLinkNotice('foreign')).toBe('foreign');
    expect(parseChatLinkNotice('x')).toBeNull();
    expect(parseChatLinkNotice(null)).toBeNull();
  });
});
