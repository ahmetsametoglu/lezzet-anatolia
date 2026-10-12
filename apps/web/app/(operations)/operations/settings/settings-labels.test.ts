import { describe, expect, it } from 'vitest';
import { DISTANCE_SALE_SETTINGS } from '@lezzet/domain-core';
import { SETTING_BY_KEY } from './settings-catalog';
import { formatSettingValue } from './settings-labels';

// Yıl binlik ayraçla yazılırsa "2.026 yıl" diye okunur ve operatör başka bir yılın kayıtlı olduğunu sanır.
describe('formatSettingValue', () => {
  it('açılış yılı ayraçsız ve birimsiz yazılır', () => {
    const def = SETTING_BY_KEY.get(DISTANCE_SALE_SETTINGS.openingYear.key);
    expect(def && formatSettingValue(def, 2026)).toBe('2026');
  });
});
