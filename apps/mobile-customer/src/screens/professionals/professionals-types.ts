import type { B2bApplicationInput } from '@lezzet/domain-core';
import type { LocalizedCopy } from '@lezzet/i18n';
// YALNIZ tip için: `Messages` sözlüğün şeklinden türer, bu modül metnin kendisini okumaz —
// `import type` sözlüğü paketten de uzak tutar (JSON yalnız ekran dosyasında bağlanır).
import type messages from '@lezzet/i18n/customer/professionals';

/* Profesyonel başvurusunun ekrana özel tipleri: sözlüğün tipi ve boş formun şekli; kurallar `@lezzet/domain-core`ta, web ile aynı motor. */

export type Messages = LocalizedCopy<typeof messages>;

/** Boş form — iki yol da aynı şekli taşır, `kind` hangi alanların görüneceğini söyler. */
export function emptyApplication(): B2bApplicationInput {
  return {
    kind: 'siret',
    siret: '',
    legalName: '',
    vatNumber: '',
    contactName: '',
    email: '',
    phone: '',
    line1: '',
    postalCode: '',
    city: '',
  };
}
