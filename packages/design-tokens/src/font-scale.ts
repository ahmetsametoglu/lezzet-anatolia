/** Müşterinin seçtiği yazı boyutu; native temanın ve web telefon görünümünün yazı durakları aynı çarpanla büyür. */
export const FONT_SCALES = ['small', 'normal', 'large'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** %90 · %100 · %115: büyük adım gözle seçilir bir fark olsun diye. */
export const FONT_SCALE_FACTOR: Readonly<Record<FontScale, number>> = { small: 0.9, normal: 1, large: 1.15 };

/** Web telefon görünümünün yazı durakları bu CSS değişkeniyle çarpılır; tanımsızsa çarpan 1'dir. */
export const FONT_SCALE_VAR = '--font-scale';
