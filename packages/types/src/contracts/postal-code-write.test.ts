import { describe, expect, it } from 'vitest';
import { AddressInsertSchema, AddressUpdateSchema } from '../entities/address.schema';
import { ZoneExtendPayloadSchema } from '../entities/assistant-proposal.schema';
import { ConversationSchema } from '../entities/conversation.schema';
import { DeliveryZonePostalCodeSchema } from '../entities/delivery-zone.schema';
import { AddressLookupCheckBodySchema, AddressWriteSchema } from './address-api.schema';

// Posta kodu yazan şemalardan biri ortak kuralı bırakıp gevşek bir kurala dönerse bu test kırmızıya döner.
const WRITE_GATES = {
  AddressInsertSchema: AddressInsertSchema.shape.postalCode,
  AddressUpdateSchema: AddressUpdateSchema.shape.postalCode,
  DeliveryZonePostalCodeSchema: DeliveryZonePostalCodeSchema.shape.postalCode,
  AddressWriteSchema: AddressWriteSchema.shape.postalCode,
  AddressLookupCheckBodySchema: AddressLookupCheckBodySchema.shape.postalCode,
  ConversationSchema: ConversationSchema.shape.postalCode,
  ZoneExtendPayloadSchema: ZoneExtendPayloadSchema.shape.postalCodes.element.shape.postalCode,
};

describe('posta kodu yazan şemalar', () => {
  it.each(Object.entries(WRITE_GATES))('%s yalnız beş rakamı kabul eder', (_name, schema) => {
    for (const bad of ['6700', '670000', '67 000', 'F-67000', '75021 CEDEX 01']) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
    expect(schema.safeParse('67000').success).toBe(true);
  });
});
