/**
 * Serbest arama teriminin PostgREST filtre dizesine gömülebilir hâli.
 *
 * PostgREST süzgeçleri düz metin olarak taşınır ve `,` `(` `)` o dilin AYRAÇLARIDIR: arama kutusuna
 * yazılan bir virgül, sorguyu iki süzgece bölerdi. Çift tırnak de değer sarmalayıcısıdır, içeride
 * kalırsa sarmalamayı kapatır. İkisi de ayıklanır — terim daralır, sorgu bozulmaz.
 *
 * **Bu bir güvenlik kaçışı DEĞİL, dil kaçışıdır.** SQL enjeksiyonuna karşı koruyan şey PostgREST'in
 * kendisi (değerler parametreleşir); buradaki iş, operatörün yazdığı metnin süzgeç dilbilgisini
 * bozmasını engellemek.
 *
 * Üç serviste (ürün · sipariş · profil) aynı satır olarak duruyordu. Tek yerde durmasının bedeli bir
 * fonksiyon çağrısı; ayrı durmasının bedeli, bir gün birinde `.` de ayıklanınca diğer ikisinin
 * sessizce farklı davranması.
 */
export function ilikeTerm(term: string | null | undefined): string {
  return (term ?? '').trim().replace(/"/g, '').replace(/[(),]/g, ' ');
}

/**
 * `alan.ilike."*terim*"` — PostgREST'in harf-ayrımsız içerir süzgeci. `*` onun jokeri (`%` değil).
 * Tırnak ŞART: joker ve boşluk içeren değer sarmalanmadan yazılırsa ayrıştırıcı erken kesilir.
 */
export function ilikeContains(field: string, safeTerm: string): string {
  return `${field}.ilike."*${safeTerm}*"`;
}
