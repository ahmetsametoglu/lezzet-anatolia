import { describe, expect, it } from 'vitest';
import { checkDocumentFile } from './document-file';

describe('belge dosya türü (12.12)', () => {
  it('PDF ve fotoğraf kabul, içerik türü uzantıdan', () => {
    expect(checkDocumentFile('facture-09.PDF')).toEqual({ ok: true, extension: 'pdf', contentType: 'application/pdf' });
    expect(checkDocumentFile('fis.jpg')).toEqual({ ok: true, extension: 'jpg', contentType: 'image/jpeg' });
    expect(checkDocumentFile('bordro.heic')).toMatchObject({ ok: true, contentType: 'image/heic' });
  });

  it('ofis dosyası, arşiv ve uzantısız ad reddedilir', () => {
    expect(checkDocumentFile('fatura.docx')).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(checkDocumentFile('belgeler.zip')).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(checkDocumentFile('fatura')).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});
