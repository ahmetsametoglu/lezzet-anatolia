import { describe, expect, it } from 'vitest';
import { nextMarketingConsent } from './marketing-consent';

const AT = '2026-10-07T10:00:00.000Z';
const CHECKOUT = { granted: true, at: '2026-09-01T08:00:00.000Z', source: 'checkout' };

describe('kampanya izni yazımı', () => {
  // Aynı değer yeniden damgalanırsa ilk onayın tarihi ve kaynağı kaybolur; öbür kanal silinirse onun kanıtı gider.
  it('yalnız değişen kanal damgalanır, öbür kanalın kaydı olduğu gibi kalır', () => {
    expect(nextMarketingConsent({ email: CHECKOUT }, { email: true }, 'account', AT)).toBeNull();
    expect(nextMarketingConsent({ email: CHECKOUT }, { email: true, whatsapp: true }, 'account', AT)).toEqual({
      email: CHECKOUT,
      whatsapp: { granted: true, at: AT, source: 'account' },
    });
  });

  // Kapalı gelen kayıtsız kanal ret sayılırsa "hiç sorulmadı" müşteri "reddetti" olarak görünür.
  it('kayıtsız kanal kapalı gelirse yazılmaz; verilmiş iznin geri çekilmesi damgalanır', () => {
    expect(nextMarketingConsent({}, { email: false }, 'account', AT)).toBeNull();
    expect(nextMarketingConsent({ email: CHECKOUT }, { email: false }, 'email-link', AT)).toEqual({
      email: { granted: false, at: AT, source: 'email-link' },
    });
  });
});
