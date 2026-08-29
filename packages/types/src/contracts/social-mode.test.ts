import { describe, expect, it } from 'vitest';
import { ConversationHandlerEnum, TicketHandlerEnum } from '../primitives/enums.schema';
import { SocialModeRequestSchema, SocialModeResponseSchema } from './social-api.schema';

/*
  Sohbetin yürütücü modu (15.13 · 15.8 · test dalgası 15.18).

  ── BU DOSYA BİR TUR BOYUNCA ASİMETRİYİ KORUYORDU ─────────────────────────────
  İstek daraltılmıştı (`ai` reddediliyordu), yanıt genişti — çünkü sohbette özerk motor yoktu ama
  kolon o değeri taşıyabiliyordu. Daraltma **29.08'de kaldırıldı** (kullanıcı kararı): motor
  (`runAutonomousConversationReply`), cron taraması (`support-ai.ts` `handledBy === 'ai'`) ve
  gönderim kanalı (Meta jetonu, canlı doğrulandı) — üçü de ölçüldü.

  Şimdi korunan şey SİMETRİ ve o da bedava değil: iki uç yanlışlıkla ayrışırsa arıza sessiz olur.
  İstek daralırsa operatör modu seçemez ama sebebini hiçbir yerde göremez; yanıt daralırsa `ai`
  satırları okunamaz hâle gelir ve gelen kutusu o sohbetleri hiç göstermez.
*/

describe('ConversationHandlerEnum', () => {
  it('sohbet ve talep AYNI üç modu taşır — sohbetteki daraltma kalktı (29.08)', () => {
    expect(ConversationHandlerEnum.options).toEqual(['human', 'hybrid', 'ai']);
    expect(TicketHandlerEnum.options).toEqual(['human', 'hybrid', 'ai']);
  });

  it('talep enum’u tek KAYNAK — sohbet ondan türüyor, ikinci bir liste yazılmadı', () => {
    /* İki liste elle yazılsaydı biri gün gelip ötekinden sapardı ve sapma sessiz olurdu: mobil
       ekran `ConversationHandlerEnum.options`tan mod düğmelerini ÇİZİYOR (`social-conversation-
       screen.tsx`), yani eksik bir değer orada görünmeyen bir düğme demektir. */
    expect(ConversationHandlerEnum.options).toEqual(TicketHandlerEnum.options);
  });
});

describe('sosyal mod sözleşmesi', () => {
  it('İSTEK üç modu da kabul eder — `ai` artık arkasında motoru olan bir mod', () => {
    for (const mode of ['human', 'hybrid', 'ai']) {
      expect(SocialModeRequestSchema.safeParse({ mode }).success, `${mode} reddedildi`).toBe(true);
    }
  });

  it('YANIT da üçünü taşır — okuma yolu hiç daralmamıştı, öyle kalmalı', () => {
    for (const mode of ['human', 'hybrid', 'ai']) {
      expect(SocialModeResponseSchema.safeParse({ mode }).success, `${mode} okunamadı`).toBe(true);
    }
  });

  it('bilinmeyen değer iki yönde de reddedilir', () => {
    // Genişleme "her şeyi kabul et" demek değil: `ticket_handler` kolonu bu üçünden başkasını
    // taşıyamaz ve sözleşme de taşımamalı.
    expect(SocialModeRequestSchema.safeParse({ mode: 'robot' }).success).toBe(false);
    expect(SocialModeResponseSchema.safeParse({ mode: 'robot' }).success).toBe(false);
  });
});
