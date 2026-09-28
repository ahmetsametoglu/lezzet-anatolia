import { describe, expect, it } from 'vitest';
import { isSendKey } from './use-composer-field.hook';

// Yazışma kutularının klavye kuralı; kural kayarsa ya çok satırlı cevap yazılamaz ya da yarım mesaj gider.
describe('isSendKey', () => {
  const key = { key: 'Enter', shiftKey: false, isComposing: false };

  it('yalın Enter gönderir', () => {
    expect(isSendKey(key)).toBe(true);
  });

  it('Shift+Enter göndermez, satır atlar', () => {
    expect(isSendKey({ ...key, shiftKey: true })).toBe(false);
  });

  it('harf birleştirme sürerken Enter göndermez', () => {
    expect(isSendKey({ ...key, isComposing: true })).toBe(false);
  });

  it('başka tuş göndermez', () => {
    expect(isSendKey({ ...key, key: 'a' })).toBe(false);
  });
});
