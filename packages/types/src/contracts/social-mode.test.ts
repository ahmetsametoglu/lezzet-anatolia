import { describe, expect, it } from 'vitest';
import { ConversationHandlerEnum, TicketHandlerEnum } from '../primitives/enums.schema';
import { SocialModeRequestSchema, SocialModeResponseSchema } from './social-api.schema';

/*
  Sohbetin yürütücü modu (15.13 · test dalgası 15.18).

  Buradaki asıl korunan şey bir ASİMETRİ: istek daralmış, yanıt genişti kalmış. İkisi yanlışlıkla
  eşitlenirse iki ayrı arıza doğar — yanıt daralırsa eski `ai` satırları okunamaz hâle gelir,
  istek genişlerse arkasında motoru olmayan bir mod yeniden yazılabilir olur.
*/

describe('ConversationHandlerEnum', () => {
  it('sohbette İKİ mod var, talepte ÜÇ', () => {
    expect(ConversationHandlerEnum.options).toEqual(['human', 'hybrid']);
    expect(TicketHandlerEnum.options).toEqual(['human', 'hybrid', 'ai']);
  });

  it('talep enum’u DARALTILMADI — orada üç modun üçünün de motoru var', () => {
    // Sohbetteki daraltma taleplere sızarsa özerk cevaplayıcı sessizce erişilemez olurdu.
    expect(TicketHandlerEnum.safeParse('ai').success).toBe(true);
  });
});

describe('sosyal mod sözleşmesi', () => {
  it('İSTEK `ai`yi reddeder — arkasında motoru olmayan mod yazılamaz', () => {
    expect(SocialModeRequestSchema.safeParse({ mode: 'human' }).success).toBe(true);
    expect(SocialModeRequestSchema.safeParse({ mode: 'hybrid' }).success).toBe(true);
    expect(SocialModeRequestSchema.safeParse({ mode: 'ai' }).success).toBe(false);
  });

  it('YANIT `ai`yi kabul eder — kolon eski satırları taşıyabilir, okuma yolu onları göstermeli', () => {
    expect(SocialModeResponseSchema.safeParse({ mode: 'ai' }).success).toBe(true);
  });

  it('bilinmeyen değer iki yönde de reddedilir', () => {
    expect(SocialModeRequestSchema.safeParse({ mode: 'robot' }).success).toBe(false);
    expect(SocialModeResponseSchema.safeParse({ mode: 'robot' }).success).toBe(false);
  });
});
