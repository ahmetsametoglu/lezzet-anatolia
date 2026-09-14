import { handOffOAuthCode, onOAuthCode, takeOAuthCode } from './oauth-handoff';

/*
  GOOGLE DÖNÜŞÜNÜN DEVRİ (21.312) — iki yol, tek devir: açık ekran haberi dinleyiciden alır, soğuk açılışta ekran
  devri montajda okur. İkisinde de devir BİR KEZ tüketilir: aynı PKCE kodu ikinci kez değiştirilmeye çalışılsa
  sağlayıcı reddeder ve ekran başarılı girişin ardından "tamamlanamadı" derdi.
*/

beforeEach(() => {
  takeOAuthCode();
});

describe('Google dönüşünün devri', () => {
  it('devir okununca silinir — aynı kod iki kez değiştirilmez', () => {
    handOffOAuthCode('pkce-1');

    expect(takeOAuthCode()).toEqual({ code: 'pkce-1' });
    expect(takeOAuthCode()).toBeNull();
  });

  it('kodsuz dönüş de bir devirdir — ekran "tamamlanamadı" diyebilsin', () => {
    handOffOAuthCode(null);

    expect(takeOAuthCode()).toEqual({ code: null });
  });

  it('açık ekran haberi dinleyiciden alır; abonelik kapanınca haber gelmez', () => {
    const listener = jest.fn();
    const stop = onOAuthCode(listener);

    handOffOAuthCode('pkce-2');
    stop();
    handOffOAuthCode('pkce-3');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeOAuthCode()).toEqual({ code: 'pkce-3' });
  });
});
