import { describe, expect, it } from 'vitest';
import { IntegrationSecretNameEnum } from '@lezzet/types';
import { INTEGRATION_KEY_GROUPS } from './integration-keys-layout';

// Ad listesine eklenen anahtar hiçbir karta konmazsa (Bağlantılar'da görünmez, defter satırı etiketsiz kalır) ya da iki karta konursa
// kırmızıya döner.
describe('Bağlantılar kartları', () => {
  it('her anahtar adı tam bir kartta, tam bir kez durur', () => {
    const placed = INTEGRATION_KEY_GROUPS.flatMap((group) => group.keys.map((key) => key.name));
    expect([...placed].sort()).toEqual([...IntegrationSecretNameEnum.options].sort());
  });
});
