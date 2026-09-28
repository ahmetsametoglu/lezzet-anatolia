import { describe, expect, it } from 'vitest';
import { CONVERSATION_DEFAULT_HANDLER_FALLBACK, TICKET_DEFAULT_HANDLER_FALLBACK, resolveDefaultHandler } from './default-handler';

// Ayar satırı jsonb tutar; kayıt modsuz doğamaz, bozuk değer o ayarın fabrika değerine düşer.
describe('resolveDefaultHandler', () => {
  it('üç mod aynen geçer', () => {
    expect(resolveDefaultHandler('human', CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe('human');
    expect(resolveDefaultHandler('hybrid', CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe('hybrid');
    expect(resolveDefaultHandler('ai', TICKET_DEFAULT_HANDLER_FALLBACK)).toBe('ai');
  });

  it('tanınmayan ya da boş değer FABRİKA değerine düşer — sıfıra ya da hataya değil', () => {
    expect(resolveDefaultHandler('robot', CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(null, CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(undefined, CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
    expect(resolveDefaultHandler(42, CONVERSATION_DEFAULT_HANDLER_FALLBACK)).toBe(CONVERSATION_DEFAULT_HANDLER_FALLBACK);
  });

  it('her ayar kendi fabrika değerine düşer — talep sohbetin değerini almaz', () => {
    expect(resolveDefaultHandler('robot', TICKET_DEFAULT_HANDLER_FALLBACK)).toBe(TICKET_DEFAULT_HANDLER_FALLBACK);
  });
});
