import { z } from 'zod';

/** İki pazarın (FR, DE) resmî posta kodu biçimi: tam beş rakam; CEDEX eki ve ülke öneki kodun parçası değildir. */
export const POSTAL_CODE_PATTERN = /^\d{5}$/;

/** Posta kodu yazan her şemanın alanı: kural tek yerde durur, üçüncü bir ülke açılırsa burada dallanır. */
export const PostalCodeSchema = z.string().regex(POSTAL_CODE_PATTERN);
