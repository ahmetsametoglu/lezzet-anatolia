import { MeSchema } from '@lezzet/types';
import type { UserRole } from '@lezzet/types';

import type { Me } from '../lib/api/me';

/*
  Testler için `/api/v1/me` cevabı; gövde şemadan geçirilir ki sözleşme değişince fixture koşuda da kırılsın ve testler
  yanlış bir cevabı doğruymuş gibi taşımasın. /me kuran her test bunu çağırır, kendi kopyasını yazmaz.
*/

/**
 * Rolleri verilen, geri kalanı nötr bir profil. `overrides` fixture'ın kurduğu TAM künyeli dünyayı
 * bozmak içindir: "telefonu yok" gibi EKSİK hâlleri, o hâli ölçen test kendisi kurar — fixture
 * kendi varsayılanını eksik bırakırsa onu ölçmeyen her test de o eksikliği taşır.
 */
export function meFixture(roles: UserRole[], overrides: Partial<Me> = {}): Me {
  return MeSchema.parse({
    id: '00000000-0000-0000-0000-00000000beef',
    type: 'individual',
    name: 'Musa K.',
    email: 'musa@ornek.test',
    /* Fixture bir DÜNYA kurar ve varsayılanı TAM künyeli müşteridir (paket fixture'ının aynı
       kuralı): eksik künye hâli, onu ölçen testin `overrides`ıyla kurulur. */
    phone: '+33600000000',
    preferredLanguage: 'tr',
    country: 'FR',
    roles,
    b2bApproved: null,
    b2bPending: false,
    marketingConsent: {},
    referralCode: null,
    companyInfo: null,
    vatNumber: null,
    createdAt: '2026-08-08T09:00:00.000Z',
    ...overrides,
  });
}
