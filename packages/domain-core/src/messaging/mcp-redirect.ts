/**
 * MCP OAuth'ta izin verilen dönüş adresleri — açık yönlendirmeye karşı ilk süzgeç.
 *
 * Karar saf olduğu için burada: kayıt ucu da yetkilendirme ucu da aynı cevabı vermek zorunda, iki
 * kopya bir gün ayrışır ve ayrıldığı gün biri fazlasını kabul eder. Liste İSTEMCİYE ÖZEL TEK YER;
 * akışın geri kalanı her istemcide ortaktır.
 */

/** Claude Code gibi terminal istemcileri dönüşü kendi açtığı yerel porta alır; port değişkendir. */
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}\/callback$/;

/** Claude uygulamasının (masaüstü, web, mobil) sabit dönüş adresi. */
const CLAUDE_APP_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

/** ChatGPT'nin sabit adresi; yetkilendirme yanıtı `iss` taşıdığı sürece bunu kullanıyor (RFC 9207). */
const CHATGPT_CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';

/**
 * ChatGPT'nin bağlantıya özel adresi — `iss` görmediğinde buna düşüyor ve seçim İSTEMCİNİN, o yüzden
 * ikisi birden tanınıyor. Kimlik tek yol parçasıdır: joker bırakmak `chatgpt.com` altındaki her yolu
 * dönüş adresi yapardı.
 */
const CHATGPT_CONNECTOR_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,64}$/;

export function isAllowedRedirectUri(uri: string): boolean {
  return (
    uri === CLAUDE_APP_CALLBACK || uri === CHATGPT_CALLBACK || CHATGPT_CONNECTOR_CALLBACK.test(uri) || LOOPBACK.test(uri)
  );
}
