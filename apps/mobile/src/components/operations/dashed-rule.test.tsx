import { processColor } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { operationsTheme } from '@/theme/unistyles';
import { OperationsDashedRule } from './dashed-rule';

/*
  KESİKLİ AYRAÇ — çivilenen şey DESENİN KENDİSİ.

  Bu test bir görünüm testi değil, bir ÖLÇÜM bekçisi: desen tasarımdan piksel sayılarak türetildi
  (kesik 9,0 px / boşluk 5,9 px, 1080 px genişlikte → 2,769 ölçekle 3,25 / 2,13 dp). Biri bir gün
  "3,25 tuhaf duruyor, 3 yapayım" derse ayraç sessizce tasarımdan ayrılır ve ayrışma yalnız gözle
  görülür. Sayı burada duruyor ki değiştirmek bilinçli olsun.

  `borderStyle: 'dashed'`e dönmenin niçin yanlış olduğu komponent künyesinde ölçümüyle yazılı.
*/

describe('OperationsDashedRule', () => {
  it('deseni tasarımdan ölçülen değerlerde çizer (3,25 dp kesik / 2,13 dp boşluk)', async () => {
    await render(<OperationsDashedRule testID="rule" />);

    /* `react-native-svg` deseni diziye ayırıyor — iddia yine SAYILARIN kendisi. */
    expect(screen.getByTestId('rule-line')).toHaveProp('strokeDasharray', ['3.25', '2.13']);
  });

  it('kalınlık token’dan gelir — ham piksel yazılmaz', async () => {
    await render(<OperationsDashedRule testID="rule" />);

    expect(screen.getByTestId('rule')).toHaveProp('height', operationsTheme.border.base);
  });

  /* RENK ÇAĞIRANIN: kart içi ayraç `neutral-bg`, koyu yüzeyde başka bir ton gerekir. Varsayılanı
     çivilemek, bir gün token değiştiğinde testin değil ekranın haklı çıkmasını sağlar. */
  it('varsayılan renk kart içi ayracın tonudur; çağıran ezebilir', async () => {
    const { rerender } = await render(<OperationsDashedRule testID="rule" />);
    /* Renk `react-native-svg`nin kendi zarfına giriyor (`{payload, type}`) ve payload RN'in
       işlenmiş sayısı; karşılaştırma aynı kapıdan geçmeli (`processColor`) — yoksa test rengi
       değil, temsilini ölçerdi. */
    expect(screen.getByTestId('rule-line')).toHaveProp('stroke', {
      payload: processColor(operationsTheme.colors['neutral-bg']),
      type: 0,
    });

    await rerender(<OperationsDashedRule testID="rule" color={operationsTheme.colors['on-ink-line']} />);
    expect(screen.getByTestId('rule-line')).toHaveProp('stroke', {
      payload: processColor(operationsTheme.colors['on-ink-line']),
      type: 0,
    });
  });
});
