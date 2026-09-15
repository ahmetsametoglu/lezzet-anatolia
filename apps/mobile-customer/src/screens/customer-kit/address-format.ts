import type { MeAddress } from '@/lib/api/addresses';

/** Etiketsiz adreste başlık şehirdir; uydurma etiket yazılmaz. */
export function addressTitle(address: MeAddress): string {
  return address.label ?? address.city;
}
