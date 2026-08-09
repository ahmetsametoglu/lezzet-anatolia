/*
  @lezzet/address-fr — Fransa adres araması (Base Adresse Nationale).

  BAĞIMSIZ ve İKİ YÜZEYE BİRDEN bakar (kullanıcı kararı 09.08): web formu da native uygulamanın
  adres çekmecesi de aynı kapıdan okur. Bunun için paket bilerek YALIN tutuldu — yalnız `zod`a
  bağlı, node-only hiçbir şey (logger, fs, node:fetch) yok; `fetch` + `AbortController` her iki
  ortamda da var.

  NE YAPAR: serbest metinden adres önerisi (`searchAddresses`) ve koordinattan adres
  (`reverseAddress`). NE YAPMAZ: gecikmeli çağrı (debounce), önbellek, ekran durumu — bunlar
  yüzeyin kararıdır ve iki yüzeyde farklı olabilir. Paket fırlatmaz; her başarısızlık ADLI döner.

  SINIR: servis IP başına saniyede 50 istek kabul ediyor. Sunucudan çağrılırsa tüm müşteriler tek
  IP'yi paylaşır (ve bir anda 50'yi aşmak mümkündür), cihazdan çağrılırsa herkes kendi IP'sini
  kullanır. Kararı çağıran verir — ayrıntı `ban-client.ts` künyesinde.

  KAYNAK GÖSTERİMİ: veri Etalab 2.0 lisansı altında ve künye zorunlu. Bunu ÇİZEN yüzeydir;
  adres önerisi gösteren her ekran "Base Adresse Nationale" künyesini taşımalı.
*/

export { MIN_QUERY_LENGTH, reverseAddress, searchAddresses } from './ban-client';
export type { AddressLookup, AddressSearchInput, ReverseAddressInput } from './ban-client';
export { addressLineOf } from './address';
export type { AddressKind, AddressSuggestion } from './address';
