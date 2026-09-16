/**
 * Bağlantı isteğinin hangi alanda düştüğü. Kod ÜRETEN uç (`/oauth/authorize`) ile ÇİZEN sayfa aynı
 * sözlüğü okur; sayfa yalnız buradaki anahtarları basar, sorgudan gelen serbest metni değil —
 * bağlantıyı elinde tutan taraf ekrana kendi cümlesini yazdıramaz.
 */
export const OAUTH_FAILURE_DETAIL = {
  response_type: 'İstek `response_type=code` ile gelmedi',
  pkce: 'PKCE eksik (`code_challenge_method=S256` bekleniyor)',
  code_challenge: '`code_challenge` alanı yok',
  client_id: '`client_id` alanı yok',
  redirect_uri: 'Dönüş adresi izin listesinde değil',
  unknown_client: '`client_id` tanınmadı',
  redirect_not_registered: 'Dönüş adresi bu uygulamada kayıtlı değil',
} as const;

export type OauthFailureDetail = keyof typeof OAUTH_FAILURE_DETAIL;
