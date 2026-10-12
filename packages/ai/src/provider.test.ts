import { describe, expect, it } from 'vitest';
import { pickModel } from './provider';

// Seçim yokken anahtarı olmayan sağlayıcıya gidilirse, seçilen model yerine varsayılan koşarsa ya da seçilen sağlayıcının anahtarı
// yokken başka sağlayıcıya sessizce düşülürse kırmızıya döner.
describe('katmanın modeli', () => {
  it('seçim yokken anahtarı tanımlı ilk sağlayıcının varsayılanı çalışır', () => {
    expect(pickModel('standard', {}, { GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toMatchObject({ ok: true, provider: 'google', chosen: false });
    expect(pickModel('standard', {}, { ANTHROPIC_API_KEY: 'a', GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toMatchObject({
      provider: 'anthropic',
    });
    expect(pickModel('standard', {}, {})).toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('seçilen model kendi sağlayıcısıyla koşar; o sağlayıcının anahtarı yoksa başkasına düşülmez', () => {
    const choices = { cheap: { provider: 'google' as const, model: 'gemini-3.5-flash-lite' } };
    const both = { ANTHROPIC_API_KEY: 'a', GOOGLE_GENERATIVE_AI_API_KEY: 'g' };
    expect(pickModel('cheap', choices, both)).toEqual({ ok: true, provider: 'google', modelId: 'gemini-3.5-flash-lite', chosen: true });
    expect(pickModel('cheap', choices, { ANTHROPIC_API_KEY: 'a' })).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(pickModel('standard', choices, { ANTHROPIC_API_KEY: 'a' })).toMatchObject({ ok: true, provider: 'anthropic', chosen: false });
  });
});
