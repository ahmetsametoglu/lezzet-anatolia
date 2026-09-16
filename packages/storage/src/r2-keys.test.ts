import { describe, expect, it } from 'vitest';
import { financeDocumentScope, r2Keys, ticketAttachmentScope } from './r2-keys';

/**
 * Kapı, imzalı okuma adresi üretilmeden önce anahtarın SAHİBİNİ sorar: biçim gevşerse yetkisi olan
 * biri private kovadaki başka bir dosyayı kendi kaydına iliştirip okutur. Üretici ile kapı birlikte
 * sınanır, çünkü biri değişip öteki kalırsa anahtar sessizce tanınmaz olur.
 */
describe('ticketAttachmentScope', () => {
  it('talep ekini kendi talebine geri çözer', () => {
    expect(ticketAttachmentScope(r2Keys.ticketAttachment('t-1', 'p-1', 'foto.JPG'))).toEqual({
      kind: 'ticket',
      ticketId: 't-1',
    });
  });

  it('taslak ekini müşterisine çözer — talep kimliği henüz yok', () => {
    expect(ticketAttachmentScope(r2Keys.ticketDraftAttachment('c-9', 'p-2', 'foto.png'))).toEqual({
      kind: 'draft',
      customerId: 'c-9',
    });
  });

  it('YABANCI anahtarı reddeder: muhasebe belgesi, teslim kanıtı ve sohbet medyası talebe ek olamaz', () => {
    expect(ticketAttachmentScope(r2Keys.financeDocument('d-1', 'fatura.pdf'))).toBeNull();
    expect(ticketAttachmentScope(r2Keys.deliveryProof('o-1', 'p-3', 'imza.png'))).toBeNull();
    expect(ticketAttachmentScope(r2Keys.conversationMedia('k-1', 'm-1', 'ses.ogg'))).toBeNull();
  });

  it('taslak klasörünün KENDİSİ talep sayılmaz — yoksa `drafts` bir talep kimliğiymiş gibi okunurdu', () => {
    expect(ticketAttachmentScope('support/tickets/drafts/foto.jpg')).toBeNull();
  });

  it('klasör derinliği tutmayan anahtar reddedilir', () => {
    expect(ticketAttachmentScope('support/tickets/t-1/alt/foto.jpg')).toBeNull();
    expect(ticketAttachmentScope('support/tickets/foto.jpg')).toBeNull();
  });
});

describe('financeDocumentScope', () => {
  it('belge anahtarını kendi belgesine çözer', () => {
    expect(financeDocumentScope(r2Keys.financeDocument('d-7', 'fis.pdf'))).toBe('d-7');
  });

  it('yabancı ve derinliği tutmayan anahtarı reddeder', () => {
    expect(financeDocumentScope(r2Keys.ticketAttachment('t-1', 'p-1', 'foto.jpg'))).toBeNull();
    expect(financeDocumentScope('finance/documents/d-7/alt/belge.pdf')).toBeNull();
  });
});
