import { describe, expect, it } from 'vitest';
import { whatsappNumbersKey, whatsappRecheckDue } from './whatsapp-link';

const now = 1_000_000;
const empty = whatsappNumbersKey([]);

describe('whatsappRecheckDue', () => {
  it('basılmamış bağlamada dönüş sunucuya gitmez', () => {
    expect(whatsappRecheckDue(null, empty, now)).toBe(false);
  });

  it('kodun ömrü içinde ve liste değişmemişken dönüş yeniden okur', () => {
    expect(whatsappRecheckDue({ expiresAt: now + 1, startedWith: empty }, empty, now)).toBe(true);
  });

  it('kodun ömrü bitince dönüş okumaz', () => {
    expect(whatsappRecheckDue({ expiresAt: now - 1, startedWith: empty }, empty, now)).toBe(false);
  });

  it('liste değiştiyse bağ görülmüştür, dönüş okumaz', () => {
    const linked = whatsappNumbersKey(['+33600000000']);
    expect(whatsappRecheckDue({ expiresAt: now + 1, startedWith: empty }, linked, now)).toBe(false);
  });

  it('basıldığı anda liste bilinmiyorsa ömür boyunca okur', () => {
    const linked = whatsappNumbersKey(['+33600000000']);
    expect(whatsappRecheckDue({ expiresAt: now + 1, startedWith: null }, linked, now)).toBe(true);
  });
});
