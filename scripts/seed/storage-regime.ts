import type { LocalizedText, ProductStorageType } from '@lezzet/types';

/**
 * Saklama rejimi metnin de kargo izninin de TEK kaynağı: iki alan ayrı yazılınca "−18 °C'de
 * saklayın" yazan ürün kargoya verilir. Katalog beslemesi de gerçek besleme de buradan okur —
 * tablo iki dosyada yaşasaydı bir gün ayrışır ve ayrıştığı gün ürün kendi künyesiyle çelişirdi.
 */
export type SaklamaRejimi = 'donuk' | 'soguk-zincir' | 'sogutulmus' | 'raf';

/**
 * Belgenin saklama cümlesi "−18 °C" diyor mu; `shippable` ve `storageType` aynı sonuca buradan
 * varır. Tek yönlüdür: yazmıyorsa "bilmiyoruz", alan yazılmaz.
 */
export const BEYAN_DONUK = /-\s*18\s*°?\s*c/i;

/**
 * Metin, kargo izni ve saklama türü aynı satırdan çıkar ki birbiriyle çelişemesin. `donuk` ile
 * `soguk-zincir` aynı saklama türüdür; ayrıldıkları yer kargo iznidir.
 */
export const SAKLAMA: Record<SaklamaRejimi, { metin: LocalizedText; shippable: boolean; storageType: ProductStorageType }> = {
  // Donuk ama kargolanabilir: yalıtımlı kutu 24-48 saatlik yolu kaldırır — kataloğun ana kütlesi.
  donuk: {
    metin: {
      tr: '−18 °C’de saklayın. Çözdürdükten sonra **tekrar dondurmayın**; 24 saat içinde tüketin.',
      fr: 'Conserver à −18 °C. **Ne pas recongeler** après décongélation ; à consommer sous 24 heures.',
      de: 'Bei −18 °C lagern. Nach dem Auftauen **nicht wieder einfrieren**; innerhalb von 24 Stunden verzehren.',
    },
    shippable: true,
    storageType: 'frozen',
  },
  // Kesintisiz soğuk zincir: çözülmeyi hiç kaldırmaz, kendi aracımızla gider. Dondurmanın rejimi.
  'soguk-zincir': {
    metin: {
      tr: '−18 °C’de, **kesintisiz soğuk zincirde** saklayın. Kısmi çözülme ürünü bozar; kargoyla gönderilmez.',
      fr: 'Conserver à −18 °C en **chaîne du froid ininterrompue**. Une décongélation partielle altère le produit ; non expédiable.',
      de: 'Bei −18 °C in **ununterbrochener Kühlkette** lagern. Teilweises Auftauen verdirbt das Produkt; kein Versand.',
    },
    shippable: false,
    // `donuk` ile AYNI rejim, farklı teslimat: ikisi de −18 °C'de saklanır, biri yolu kaldırır öteki
    // kaldırmaz. İade varsayılanının imha olması ikisinde de doğrudur — kolonun asıl işi bu.
    storageType: 'frozen',
  },
  // Soğutulmuş (0-4 °C), kısa raf ömrü: yolda geçen saat doğrudan tazelikten düşer.
  sogutulmus: {
    metin: {
      tr: '**0-4 °C**’de buzdolabında saklayın. Dondurmayın; ambalajı açıldıktan sonra 48 saat içinde tüketin.',
      fr: 'Conserver au réfrigérateur entre **0 et 4 °C**. Ne pas congeler ; à consommer sous 48 heures après ouverture.',
      de: 'Im Kühlschrank bei **0-4 °C** lagern. Nicht einfrieren; nach dem Öffnen innerhalb von 48 Stunden verzehren.',
    },
    shippable: false,
    storageType: 'chilled',
  },
  // Rafta duran kuru ürün (kuru baklava, simit, kuru pasta): oda sıcaklığı, kargonun en kolayı.
  raf: {
    metin: {
      tr: '**Serin ve kuru** yerde, oda sıcaklığında saklayın. Doğrudan güneş ışığından uzak tutun.',
      fr: 'Conserver dans un endroit **frais et sec**, à température ambiante. Tenir à l’abri du soleil.',
      de: 'An einem **kühlen, trockenen** Ort bei Raumtemperatur lagern. Vor direkter Sonne schützen.',
    },
    shippable: true,
    storageType: 'ambient',
  },
};
