import { describe, expect, it } from 'vitest';
import { CONVERSATION_DEFAULT_HANDLER_FALLBACK, resolveDefaultHandler } from './default-handler';

// 15.30 — ayar satırı jsonb tutar; sohbet modsuz doğamaz, bozuk değer fabrika değerine düşer.
describe('resolveDefaultHandler', () => {
  it('üç mod aynen geçer', () => {
    expect(resolveDefaultHandler('human')).toBe('human');
    expect(resolveDefaultHandler('hybrid')).toBe('hybrid');
    expect(resolveDefaultHandler('ai')).toBe('ai');
  });

  it('tanınmayan ya da boş değer FABRİKA değerine düşer — sıfıra ya da hataya değil', () => {
    expect(resolveDefaultHandler('robot')).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(null)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(undefined)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(42)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
  });
});
