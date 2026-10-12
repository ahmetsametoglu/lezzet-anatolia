import { describe, expect, it, vi } from 'vitest';
import type { OrderNotification } from '@lezzet/types';
import type { NotifyRecipient } from '../types';
import { whatsappApiDriver } from './whatsapp-api.driver';

/*
  Bu testler şu hatalarda kırmızıya döner: kod Meta'ya authentication şablonunun istediği iki yere (gövde ve kopyala düğmesi) gitmez,
  şablon müşterinin dilinde seçilmez, kodsuz "yolda" WhatsApp'tan gider ya da yapılandırılmamış sürücü olayı üstlenir.
*/

const recipient: NotifyRecipient = { name: 'Ayşe', email: null, phone: null, whatsapp: '+33600000001', locale: 'fr' };
/** Sürücü bildirimden yalnız kodu okur; öteki alanlar bu testin konusu değil. */
const withCode = { deliveryCode: '482913' } as OrderNotification;

function configured() {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));
  return { fetchImpl, driver: whatsappApiDriver({ token: 'jeton', phoneNumberId: '1234567890', fetchImpl }) };
}

describe('whatsappApiDriver', () => {
  it('kod gövdede ve kopyala düğmesinde, şablon müşterinin dilinde gider', async () => {
    const { fetchImpl, driver } = configured();

    expect(await driver.send('order_out_for_delivery', recipient, withCode)).toMatchObject({ status: 'sent', ref: 'wamid.1' });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/1234567890/messages');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      to: '+33600000001',
      type: 'template',
      template: {
        name: 'delivery_code',
        language: { code: 'fr' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
        ],
      },
    });
  });

  it('kodsuz "yolda" WhatsApp\'tan gitmez', async () => {
    const { fetchImpl, driver } = configured();

    expect(await driver.send('order_out_for_delivery', recipient, {} as OrderNotification)).toMatchObject({ status: 'skipped' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('jeton ya da gönderen numara yoksa, numarasız alıcıda ya da başka olayda üstlenmez', () => {
    const { driver } = configured();

    expect(whatsappApiDriver().supports('order_out_for_delivery', recipient)).toBe(false);
    expect(whatsappApiDriver({ token: 'jeton', phoneNumberId: null }).supports('order_out_for_delivery', recipient)).toBe(false);
    expect(driver.supports('order_out_for_delivery', { ...recipient, whatsapp: null })).toBe(false);
    expect(driver.supports('order_confirmed', recipient)).toBe(false);
    expect(driver.supports('order_out_for_delivery', recipient)).toBe(true);
  });
});
