import { describe, expect, it } from 'vitest';
import { messageSenderFor, metaCloudSender } from './meta-sender';
import { unconfiguredSender } from './send';

/**
 * **"YAPILANDIRILMIŞ MI" KURALI** (15.8) — tek satırlık bir fonksiyon, ama taşıdığı karar ucuz değil.
 *
 * ── NEDEN SINANIYOR ─────────────────────────────────────────────────────────
 * İki tüketicisi var (backend cron'u, web action'ı) ve ikisi de env'den okuduğu değeri buraya
 * veriyor. Kural yanlış çalışırsa arıza SESSİZ olur: boş jetonla gerçek sürücü kurulur, sürücü her
 * çağrıda Meta'dan `190` yer ve teşhis "sağlayıcı hatası" diye okunur — oysa sebep bizim
 * yapılandırmamızdır. `unconfiguredSender` bunu adıyla söyler (`not_configured`) ve özerk motor da
 * o ada bakıp modu DEĞİŞTİRMEMEYE karar veriyor (`runAutonomousConversationReply` künyesi).
 *
 * Yani bu üç iddia, "jeton yok" hâlinin doğru adı taşımasını çiviliyor — yanlış ad, kuyruktaki her
 * sohbetin gereksiz yere insana devredilmesine kadar gidiyordu.
 */
describe('messageSenderFor — jeton var mı, sürücü hangisi', () => {
  it('jeton VARSA gerçek Cloud API sürücüsü döner', () => {
    expect(messageSenderFor('EAAG-gerçek-jeton').name).toBe(metaCloudSender({ token: 'x' }).name);
  });

  it('jeton YOKSA reddeden sürücü döner — sessizce "gönderdim" diyen bir sahte değil', () => {
    expect(messageSenderFor(undefined)).toBe(unconfiguredSender);
    expect(messageSenderFor(null)).toBe(unconfiguredSender);
  });

  it('BOŞ ve boşluklu dizge de "jeton yok" sayılır', () => {
    // `.env`'de `META_ACCESS_TOKEN=` satırı bırakmak jeton koymaktan farksız görünür ama değildir:
    // boş dizge doğruluk sınavını geçen bir değer olsaydı, gerçek sürücü jetonsuz kurulurdu.
    expect(messageSenderFor('')).toBe(unconfiguredSender);
    expect(messageSenderFor('   ')).toBe(unconfiguredSender);
  });
});
