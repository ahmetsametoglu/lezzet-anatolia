import { describe, expect, it } from 'vitest';
import {
  allowedTicketTransitions,
  canTransitionTicket,
  canTriggerReturn,
  checkTicketDraft,
  isReturnBound,
  statusAfterCustomerReply,
  statusAfterStaffReply,
} from './ticket-flow';

describe('talep durum makinesi', () => {
  it('personel açık talebi işleme alır ya da doğrudan kapatır', () => {
    expect(canTransitionTicket('open', 'in_progress', 'staff')).toEqual({ allowed: true });
    // Tek cevapla kapanan soru için araya "işlemde" adımı zorlanmaz.
    expect(canTransitionTicket('open', 'resolved', 'staff')).toEqual({ allowed: true });
  });

  it('çözülmüş talep iki tarafça da yeniden açılabilir', () => {
    expect(canTransitionTicket('resolved', 'open', 'staff')).toEqual({ allowed: true });
    expect(canTransitionTicket('resolved', 'open', 'customer')).toEqual({ allowed: true });
  });

  it('müşteri kendi talebini çözüldü yapamaz — durum bizim kuyruğumuzun hâli', () => {
    expect(canTransitionTicket('open', 'resolved', 'customer')).toEqual({
      allowed: false,
      reason: 'forbidden_for_actor',
    });
  });

  it('aynı duruma geçiş ve olmayan geçiş ayrı sebeplerdir', () => {
    expect(canTransitionTicket('open', 'open', 'staff')).toEqual({ allowed: false, reason: 'same_status' });
    // `in_progress → in_progress` dışında kalan gerçekten yok olan bir geçiş yoktur; müşteri
    // tarafında açık talepten çıkış hiç bulunmaz.
    expect(canTransitionTicket('open', 'in_progress', 'customer')).toEqual({
      allowed: false,
      reason: 'forbidden_for_actor',
    });
  });

  it('ekran yalnız izinli geçişleri sunar', () => {
    expect(allowedTicketTransitions('open', 'customer')).toEqual([]);
    expect(allowedTicketTransitions('resolved', 'customer')).toEqual(['open']);
    expect(allowedTicketTransitions('in_progress', 'staff')).toEqual(['resolved', 'open']);
  });
});

describe('cevap yazmanın duruma etkisi', () => {
  it('müşteri kapanmış talebe yazarsa talep yeniden açılır', () => {
    expect(statusAfterCustomerReply('resolved')).toBe('open');
  });

  it('açık talepte müşterinin cevabı durumu başa sarmaz', () => {
    expect(statusAfterCustomerReply('in_progress')).toBeNull();
    expect(statusAfterCustomerReply('open')).toBeNull();
  });

  it('personelin cevabı durumu kendiliğinden değiştirmez', () => {
    expect(statusAfterStaffReply('open')).toBeNull();
    expect(statusAfterStaffReply('resolved')).toBeNull();
  });
});

describe('iade tetikleme kapısı', () => {
  it('siparişli ve henüz tetiklenmemiş talepte açıktır', () => {
    expect(canTriggerReturn({ orderId: 'o1', returnTriggeredAt: null })).toEqual({ allowed: true });
  });

  it('siparişsiz talepte tetiklenecek akış yoktur', () => {
    expect(canTriggerReturn({ orderId: null, returnTriggeredAt: null })).toEqual({
      allowed: false,
      reason: 'no_order',
    });
  });

  it('ikinci tetik engellenir — aynı iade için iki akış açılmaz', () => {
    expect(canTriggerReturn({ orderId: 'o1', returnTriggeredAt: '2026-07-20T10:00:00Z' })).toEqual({
      allowed: false,
      reason: 'already_triggered',
    });
  });

  it('tip kısıtlamaz: "soru" talebinden de haklı bir iade çıkabilir', () => {
    expect(canTriggerReturn({ orderId: 'o1', returnTriggeredAt: null })).toEqual({ allowed: true });
    // Tip yalnız kuyruk işaretidir.
    expect(isReturnBound('damaged')).toBe(true);
    expect(isReturnBound('question')).toBe(false);
  });
});

describe('talep açılışının tutarlılığı', () => {
  it('siparişsiz talepte kalem işaretlenemez', () => {
    expect(checkTicketDraft({ source: 'form', orderItemIds: ['i1'] })).toEqual({
      ok: false,
      reason: 'items_without_order',
    });
  });

  it('WhatsApp talebi konuşmasız olamaz', () => {
    expect(checkTicketDraft({ source: 'whatsapp' })).toEqual({ ok: false, reason: 'whatsapp_without_conversation' });
  });

  it('sipariş detayından gelen talep siparişsiz olamaz', () => {
    expect(checkTicketDraft({ source: 'order' })).toEqual({ ok: false, reason: 'order_source_without_order' });
  });

  it('siparişsiz genel soru geçerlidir', () => {
    expect(checkTicketDraft({ source: 'form' })).toEqual({ ok: true });
  });
});
