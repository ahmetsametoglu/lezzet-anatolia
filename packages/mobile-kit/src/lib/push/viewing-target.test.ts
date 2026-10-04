import { isViewing, markViewing } from './viewing-target';

describe('öndeki bildirim hedefi', () => {
  // Açık yazışmanın bildirimi gösterilirse ya da ekran kapandıktan sonra da susturulursa kırmızıya döner.
  it('yalnız öndeki hedefin bildirimi susar; ekran arkaya düşünce yeniden gösterilir', () => {
    const release = markViewing('ticket', 't-1');

    expect(isViewing({ targetType: 'ticket', targetId: 't-1' })).toBe(true);
    expect(isViewing({ targetType: 'ticket', targetId: 't-2' })).toBe(false);
    expect(isViewing({ targetType: 'order', targetId: 't-1' })).toBe(false);

    release();
    expect(isViewing({ targetType: 'ticket', targetId: 't-1' })).toBe(false);
  });
});
