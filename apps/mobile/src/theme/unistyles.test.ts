import { customerColors, customerRadius, customerText } from '@lezzet/design-tokens';

import { lightTheme } from './unistyles';

// Bağlantı kanıtı: tema değerleri design-tokens paketinden GELİYOR — beklenenler de paketten
// türetilir (ham değer teste de yazılmaz), böylece token değişince test tanım gereği ayak uydurur.
describe('Unistyles teması ↔ @lezzet/design-tokens bağlantısı', () => {
  it('renkler paketin müşteri kümesinin aynısıdır', () => {
    expect(lightTheme.colors).toBe(customerColors);
    expect(lightTheme.colors.ink).toBe(customerColors.ink);
  });

  it('px kademeleri sayıya (dp) çevrilir, em harf aralığı olduğu gibi kalır', () => {
    expect(lightTheme.radius.card).toBe(Number.parseFloat(customerRadius.card));
    expect(lightTheme.text.h1).toBe(Number.parseFloat(customerText.h1));
    expect(lightTheme.text['h1--line-height']).toBe(Number(customerText['h1--line-height']));
    expect(lightTheme.text['eyebrow--letter-spacing']).toBe(customerText['eyebrow--letter-spacing']);
  });
});
