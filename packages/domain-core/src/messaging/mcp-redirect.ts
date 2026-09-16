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

export function isAllowedRedirectUri(uri: string): boolean {
  return uri === CLAUDE_APP_CALLBACK || LOOPBACK.test(uri);
}
