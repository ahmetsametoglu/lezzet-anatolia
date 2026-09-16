import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUri } from './mcp-redirect';

/**
 * Bu testler şu arızada kırmızıya döner: beyaz liste gevşer ve yetkilendirme kodu bizim olmayan bir
 * adrese taşınabilir hâle gelir (hesap devralmanın en kısa yolu).
 */
describe('isAllowedRedirectUri', () => {
  it('Claude uygulamasının dönüş adresini kabul eder', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });

  it('terminal istemcisinin yerel portunu kabul eder', () => {
    expect(isAllowedRedirectUri('http://localhost:54321/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:8976/callback')).toBe(true);
  });

  it('benzeyen ama başka olan alan adlarını reddeder', () => {
    expect(isAllowedRedirectUri('https://claude.ai.saldirgan.com/api/mcp/auth_callback')).toBe(false);
    expect(isAllowedRedirectUri('https://saldirgan.com/api/mcp/auth_callback')).toBe(false);
    // Yol eklenmiş hâli de başka bir adrestir: eşitlik aranıyor, "ile başlıyor" değil.
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback/../../disari')).toBe(false);
  });

  it('yerel görünen ama uzak olan adresleri reddeder', () => {
    expect(isAllowedRedirectUri('http://localhost.saldirgan.com:3000/callback')).toBe(false);
    expect(isAllowedRedirectUri('https://localhost:3000/callback')).toBe(false);
    expect(isAllowedRedirectUri('http://localhost:3000/baska-yol')).toBe(false);
  });
});
