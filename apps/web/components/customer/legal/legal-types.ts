import type { ComponentProps } from 'react';
import type { Link } from '@/i18n/navigation';

// Statik/yasal sayfa şablonunun sözleşmesi (08.8) — view DEĞİL, tip modülü.

/**
 * Metnin DOKUSU — tasarımın "tek şablon, üç doku" kuralı (`Musteri - Statik.dc.html`, etkileşim
 * sözleşmesi).
 *
 * Doku bir stil seçimi değil, içeriğin şekli: hukuki metin bölüm başlıkları + gövde paragraflarıdır,
 * bilgi sayfası araya bilgi bandı alır, SSS ise soru-cevap çiftlerinden oluşur ve içinde ARANIR.
 * Şablonun üçünü de tek gövdeden çizmesi tasarımın açık isteği — üç ayrı sayfa yazmak, bir gün
 * birinin "Bu sayfada" gezinmesinin ötekinden farklı davranması demekti.
 */
export type LegalTexture = 'prose' | 'faq';

/** Metin bölümü — `id` hem başlık çapası hem "Bu sayfada" gezinmesinin hedefi. */
export interface LegalSection {
  id: string;
  heading: string;
  /** Paragraflar. Dizi, çünkü hukuki metin tek bloklu değildir ve satır arası anlam taşır. */
  body: string[];
  /**
   * Madde listesi — bazı bölümler (haklarınız, iade koşulları) doğal olarak sayılabilir.
   * Paragrafın içine gömülse okunmazdı; hukuki metinde "kaç madde var" görünür olmalı.
   */
  bullets?: string[];
}

/** Soru-cevap çifti — SSS dokusunun birimi. */
export interface LegalQuestion {
  id: string;
  question: string;
  answer: string;
}

/**
 * Sayfanın altındaki bilgi bandı — tasarımda zeytin zeminli 💡 kutusu.
 *
 * **Statik sayfa çıkmaz sokak olmamalı** (içerik envanteri §2): buraya belirli bir soruyla gelen
 * ziyaretçi cevabı bulamazsa gidecek bir yer görmeli. Bant bu yüzden isteğe bağlı değil bir alışkanlık;
 * yine de tipte `?` çünkü SSS'nin kendi çıkış kutusu var (tasarımda ayrı, kesikli çerçeveli).
 */
export interface LegalNotice {
  text: string;
  links: { label: string; href: ComponentProps<typeof Link>['href'] }[];
}

/**
 * Bir statik belgenin TAMAMI — sayfa bunu kurar, şablon yalnız çizer.
 *
 * `updatedAt` zorunlu ve bu bilinçli: içerik envanteri *"yasal metinlerde hangi sürümün geçerli
 * olduğu belli olmalı"* diyor, tasarım da her sayfada başlığın altına koyuyor. İsteğe bağlı olsaydı
 * bir gün biri unuturdu ve okuyan hangi sürüme baktığını bilemezdi.
 */
export interface LegalDocument {
  texture: LegalTexture;
  title: string;
  /** ISO tarih — biçimleme sayfanın dilinde, şablonun içinde yapılır. */
  updatedAt: string;
  sections: LegalSection[];
  questions?: LegalQuestion[];
  notice?: LegalNotice;
}
