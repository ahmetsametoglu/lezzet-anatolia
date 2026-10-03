/**
 * Ayarların ekrandaki yeri: sekme → konu kartı. Sözlük her ayara yalnız kartını yazar, sekme karttan türer; böylece bir ayar iki
 * sekmede birden duramaz.
 */

export type SettingTab = 'order' | 'money' | 'customer';

export const SETTING_TABS: readonly { key: SettingTab; label: string }[] = [
  { key: 'order', label: 'Sipariş & depo' },
  { key: 'money', label: 'Para' },
  { key: 'customer', label: 'Müşteri' },
];

export type SettingSection =
  | 'dayHours'
  | 'basket'
  | 'delivery'
  | 'stock'
  | 'paymentLimits'
  | 'accounts'
  | 'bankFeed'
  | 'cost'
  | 'pointsEarn'
  | 'pointsRedeem'
  | 'feedback'
  | 'handlers'
  | 'trust';

/** Kartın gövdesi: satır listesi, günün saat akışı ya da ödül/ceza çifti. Satır listesi dışındakiler iki sütunu birden kaplar. */
export type SectionLayout = 'rows' | 'dayHours' | 'trust';

export interface SectionDef {
  key: SettingSection;
  label: string;
  tab: SettingTab;
  layout: SectionLayout;
  /** Kartın başlık altı cümlesi; yalnız kartın bütününe dair bir şey söylenecekse yazılır. */
  hint?: string;
}

/** `Record` her bölümün bir tanımı olmasını derleyiciye denetletir; anahtar sırası ekrandaki sıradır. */
const SECTIONS: Record<SettingSection, Omit<SectionDef, 'key'>> = {
  dayHours: {
    label: 'Günün saatleri',
    tab: 'order',
    layout: 'dayHours',
    hint: 'Bir rota gününün dört eşiği, sırasıyla. Dördü de yalnız bölge (rota) bazında istisna alır.',
  },
  basket: { label: 'Sepet eşikleri', tab: 'order', layout: 'rows' },
  delivery: { label: 'Teslim', tab: 'order', layout: 'rows' },
  stock: { label: 'Stok & tazelik', tab: 'order', layout: 'rows' },
  paymentLimits: { label: 'Ödeme sınırları', tab: 'money', layout: 'rows' },
  accounts: {
    label: 'Para hesapları',
    tab: 'money',
    layout: 'rows',
    hint: 'Paranın yazıldığı hesaplar. Kuruluma özgüdür, fabrika değeri yoktur.',
  },
  bankFeed: { label: 'Pennylane', tab: 'money', layout: 'rows' },
  cost: {
    label: 'Birim maliyet',
    tab: 'money',
    layout: 'rows',
    hint: 'Kâr hesabının girdileri. Geçmiş siparişlerin sabitlenmiş rakamlarını değiştirmez.',
  },
  pointsEarn: { label: 'Puan kazanma', tab: 'customer', layout: 'rows' },
  pointsRedeem: { label: 'Kupona çevirme', tab: 'customer', layout: 'rows' },
  feedback: { label: 'Geri bildirim daveti', tab: 'customer', layout: 'rows' },
  handlers: { label: 'Yeni yazışmayı kim yürütür', tab: 'customer', layout: 'rows' },
  trust: {
    label: 'Güven puanı',
    tab: 'customer',
    layout: 'trust',
    hint: 'Yalnız bundan sonra yazılan hareketleri etkiler; geçmiş hareketler yazıldıkları ağırlıkla kalır.',
  },
};

export const SETTING_SECTIONS: readonly SectionDef[] = (Object.keys(SECTIONS) as SettingSection[]).map((key) => ({ key, ...SECTIONS[key] }));

export function sectionTab(key: SettingSection): SettingTab {
  return SECTIONS[key].tab;
}
