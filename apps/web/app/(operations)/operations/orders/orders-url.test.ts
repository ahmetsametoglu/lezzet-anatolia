import { describe, expect, it } from 'vitest';
import { parseOrdersUrl } from './orders-url';

/* Bu test şu hatada kırmızıya döner: URL çözümleyicisi teslim türü süzgecini elle yazılmış dar bir listeden okur ve
   panonun "süresi dolan gel-al" köprüsü (`?tab=ready&del=pickup`) sessizce "tümü"ne düşer. */
describe('parseOrdersUrl · teslim türü süzgeci', () => {
  it('gel-al süzgeci korunur, tanınmayan değer varsayılana düşer', () => {
    expect(parseOrdersUrl({ tab: 'ready', del: 'pickup' })).toMatchObject({ tab: 'ready', del: 'pickup' });
    expect(parseOrdersUrl({ del: 'drone' })).toMatchObject({ del: 'all' });
  });
});
