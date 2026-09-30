import { brand } from '@lezzet/brand';

/**
 * Layout'un `title.template` değeri: sekme başlığına marka ekini basar. Next şablonu layout'la aynı segmentteki sayfaya uygulamaz;
 * ana sayfa da bu yüzden `(home)` grubunda duruyor.
 */
export const TITLE_TEMPLATE = `%s · ${brand.name}`;
