import { describe, expect, it } from 'vitest';
import { awaitsOurReply, ticketMeta, ticketTitle } from './ticket';

const day = (iso: string) => iso.slice(0, 10);

describe('ticketMeta', () => {
  it('açık talepte son mesaj yazılır — liste o sıraya göre dizili', () => {
    const meta = ticketMeta(
      { status: 'open', createdAt: '2026-09-01T10:00', lastMessageAt: '2026-09-03T10:00' },
      'Genel',
      'son: {date}',
      day,
    );
    expect(meta).toBe('Genel · 2026-09-01 · son: 2026-09-03');
  });

  it('çözülmüş talepte son mesaj yazılmaz', () => {
    const meta = ticketMeta(
      { status: 'resolved', createdAt: '2026-09-01T10:00', lastMessageAt: '2026-09-03T10:00' },
      'Genel',
      'son: {date}',
      day,
    );
    expect(meta).toBe('Genel · 2026-09-01');
  });
});

describe('ticketTitle', () => {
  it('konu boşsa yalnız tür kalır, asılı ayraç yok', () => {
    expect(ticketTitle('Soru', '  ', '{type} · {subject}')).toBe('Soru');
    expect(ticketTitle('Eksik ürün', 'Gözleme', '{type} · {subject}')).toBe('Eksik ürün · Gözleme');
  });
});

describe('awaitsOurReply', () => {
  it('son söz müşterinin ve talep açıksa not görünür', () => {
    expect(awaitsOurReply('open', true)).toBe(true);
  });

  it('işletme cevap verdiyse not kalkar — söz verilen haber zaten gitti', () => {
    expect(awaitsOurReply('in_progress', false)).toBe(false);
  });

  it('çözülmüş talepte not görünmez, mesajsız talepte de', () => {
    expect(awaitsOurReply('resolved', true)).toBe(false);
    expect(awaitsOurReply('open', null)).toBe(false);
  });
});
