/*
  @lezzet/react-hooks — iki yüzeyin PAYLAŞTIĞI React davranışları.

  NE GİRER: yüzeyden bağımsız, saf React ile ifade edilebilen ETKİLEŞİM kararları — "yazarken
  öneri getir"in gecikme/önbellek/yarış üçlüsü gibi. Bunlar ne iş kuralıdır (o `domain-core`),
  ne veri okumadır (o `database`), ne de çizimdir; ikisi arasında kalan ve iki yüzeyde de aynı
  olması GEREKEN davranıştır.

  NE GİRMEZ: ekran, stil, metin. Paketin React dışında bağımlılığı YOK ve React de
  `peerDependency` — ne `react-native` ne `next` bilir. Bir gün bir şey ikisinden birini
  bilmek zorunda kalırsa, o şey buraya ait değildir.
*/

export { useDebouncedLookup } from './use-debounced-lookup.hook';
export type { LookupResult } from './use-debounced-lookup.hook';
