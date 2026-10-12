import { describe, expect, it } from 'vitest';
import { PennylaneError } from './errors';
import { readInvoiceTemplates } from './invoice-templates';
import { memoryPennylane } from './memory-pennylane.testkit';

describe('fatura şablonu seçicisinin listesi', () => {
  // Okunamayan liste boş dönseydi seçici yalnız varsayılan şablonu sunar, Pennylane'de hiç şablon yokmuş gibi görünürdü.
  it('Pennylane okunamazsa liste boş değil sebebiyle döner; anahtar yoksa bağlı değil döner', async () => {
    const pennylane = memoryPennylane();
    const qualite = pennylane.addInvoiceTemplate('QUALITE');
    const lezzet = pennylane.addInvoiceTemplate('Lezzet Anatolie');
    expect(await readInvoiceTemplates(pennylane.port)).toEqual({
      status: 'ok',
      templates: [
        { id: lezzet, name: 'Lezzet Anatolie' },
        { id: qualite, name: 'QUALITE' },
      ],
    });

    pennylane.failNext('listInvoiceTemplates', new PennylaneError({ code: 'network', message: 'Pennylane yanıt vermedi' }));
    expect(await readInvoiceTemplates(pennylane.port)).toEqual({ status: 'failed', message: 'Pennylane yanıt vermedi' });
    expect(await readInvoiceTemplates(null)).toEqual({ status: 'not_configured' });
  });
});
