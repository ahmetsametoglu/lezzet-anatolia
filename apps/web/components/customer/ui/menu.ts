/**
 * Açılır menü yüzeyi ve satırı — v1'in hesap menüsünden (13.09): beyaz kart, kum-300 kenar, 18px
 * köşe, 8px iç boşluk, v1 gölgesi; satır 12px köşe, 10/12 ped, kalın metin.
 *
 * Hesap menüsü ile kitin seçim alanı (`FormSelectField`) aynı yüzeyi çiziyor; iki kopya bir gün iki
 * ayrı gölgeye ve köşeye kayardı. Satırın RENGİ ve üzerine gelme zemini çağıranda kalır: "Çıkış yap"
 * terracotta, seçili seçenek zeytin — sınıf dizgisinde iki renk yan yana yazılırsa Tailwind hangisini
 * uygulayacağını kaynak sırasına göre seçer, dizgi sırasına göre değil.
 */
export const menuPanelClass = 'flex flex-col gap-0.5 rounded-card border border-sand-300 bg-card p-2 shadow-menu';

export const menuItemClass = 'cursor-pointer rounded-xl px-3 py-2.5 font-sans text-body-sm font-semibold transition-colors';
