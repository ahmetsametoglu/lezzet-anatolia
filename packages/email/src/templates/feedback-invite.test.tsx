import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import type { FeedbackInviteNotification, PreferredLanguage } from '@lezzet/types';
import { FeedbackInviteEmail, feedbackInviteSubject } from './feedback-invite';

/**
 * Değerlendirme daveti (17.2). Sınanan dört şey: **metin müşterinin dilinde çıkıyor**, **davet
 * bağlantısı mailde**, **tek eylem var** (ikinci bir davet düğmesi yok), **puan MİKTARI vaat
 * edilmiyor** — sonuncusu bilinçli bir karar ve sessizce bozulabilecek türden.
 */

const base: FeedbackInviteNotification = {
  customerName: 'Ayşe Kaya',
  locale: 'tr',
  orderReferenceNo: 'LZA-1234',
  deliveredOn: '22 Temmuz 2026',
  productCount: 3,
  feedbackUrl: 'https://example.test/tr/degerlendirme/ABCDEFGH12345678',
  notificationPreferencesUrl: 'https://example.test/tr/hesap/bildirim-tercihleri',
};

const props = { brandName: 'Lezzet Anatolia', postalAddress: 'Lezzet Anatolia · Strasbourg' };

function html(data: Partial<FeedbackInviteNotification> = {}): Promise<string> {
  return render(FeedbackInviteEmail({ data: { ...base, ...data }, ...props }));
}

describe('FeedbackInviteEmail', () => {
  it('davet bağlantısı ve sipariş referansı mailde', async () => {
    const output = await html();

    expect(output).toContain(base.feedbackUrl);
    expect(output).toContain('LZA-1234');
    expect(output).toContain('22 Temmuz 2026');
  });

  it('tek eylem: davet bağlantısı bir kez geçer', async () => {
    // Mailin işi bir kapı açmak. İkinci bir birincil bağlantı (katalog, hesap) tıklamayı böler;
    // aynı adresin iki kez geçmesi de "hangisine basayım" sorusunu doğurur.
    const output = await html();
    expect(output.split(base.feedbackUrl).length - 1).toBe(1);
  });

  it('puan MİKTARI vaat edilmez', async () => {
    // Puan tamamlamada verilir ve günlük tavana/müşteri türüne bağlıdır. Metne bir sayı sızarsa
    // tutulamayabilecek bir söz veriliyor demektir — bu test o sızıntının bekçisi.
    for (const locale of ['tr', 'fr', 'de'] as const) {
      const body = (await html({ locale })).replace(/<[^>]+>/g, ' ');
      expect(body).not.toMatch(/\d+\s*(puan|points?|Punkte)/i);
    }
  });

  it('metin müşterinin dilinde', async () => {
    const expected: Record<PreferredLanguage, string> = {
      tr: 'Değerlendirmeye başla',
      fr: 'Donner mon avis',
      de: 'Jetzt bewerten',
    };
    for (const locale of ['tr', 'fr', 'de'] as const) {
      expect(await html({ locale })).toContain(expected[locale]);
    }
  });

  it('ürün sayısı tek ise çoğul cümle kurulmaz', async () => {
    // "1 ürünü beğenip beğenmediğinizi tek tek işaretleyin" hem yanlış hem de mailin vaat ettiği
    // eforu büyütür; tek ürünlü sipariş azınlık değil, sık.
    expect(await html({ productCount: 1 })).toContain('Tek dokunuşla');
  });

  it('konu başlığı dile göre', async () => {
    expect(feedbackInviteSubject(base)).toBe('Aldıklarınız nasıldı?');
    expect(feedbackInviteSubject({ ...base, locale: 'fr' })).toBe('Vos produits vous ont-ils plu ?');
  });
});
