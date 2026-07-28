import type { NotifyDriver, NotifyResult } from '../types';

/**
 * WhatsApp Business API sürücüsü — **arayüzü hazır, gövdesi boş** (modül 15 doldurur).
 *
 * Neden şimdiden var: sürücü listesinin şekli bu boşlukla test edilir. 15'te iş kodunda tek satır
 * değişmeden bu dosyanın içi dolar — sözleşmenin gerçekten kanal-bağımsız olduğunun kanıtı
 * budur. Şu an her çağrıda `skipped` döner: sessizce "gitti" demek en kötü yalan olurdu.
 */
export function whatsappApiDriver(): NotifyDriver {
  return {
    channel: 'whatsapp_api',
    supports() {
      return false; // Sağlayıcı bağlanmadı (15.x) — hiçbir olayı üstlenmez.
    },
    async send(): Promise<NotifyResult> {
      return { status: 'skipped', channel: 'whatsapp_api', reason: 'driver_not_implemented' };
    },
  };
}
