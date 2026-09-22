import type { ComponentProps } from 'react';
import type { Link } from '@/i18n/navigation';

/** Metnin dokusu: hukuki metin bölüm ve paragraftır, SSS soru-cevap çiftidir ve içinde aranır. */
export type LegalTexture = 'prose' | 'faq';

/** Metin bölümü; `id` hem başlık çapası hem "Bu sayfada" gezinmesinin hedefi. */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: readonly string[];
  /** Madde listesi; hukuki metinde kaç madde olduğu görünür olmalı. */
  bullets: readonly string[];
}

/** Soru-cevap çifti — SSS dokusunun birimi. */
export interface LegalQuestion {
  id: string;
  question: string;
  answer: string;
}

/** Sayfanın altındaki çıkış bandı: buraya bir soruyla gelen ziyaretçi cevabı bulamazsa gidecek yeri görür. */
export interface LegalNotice {
  text: string;
  links: { label: string; href: ComponentProps<typeof Link>['href'] }[];
}

/** Bir statik belgenin tamamı — sayfa kurar, şablon yalnız çizer. */
export interface LegalDocument {
  texture: LegalTexture;
  title: string;
  /** "Son güncelleme: 1 Temmuz 2026" — yasal metinde hangi sürüme bakıldığı görünmeli. */
  updatedLine: string;
  sections: readonly LegalSection[];
  questions?: readonly LegalQuestion[];
  notice?: LegalNotice;
}
