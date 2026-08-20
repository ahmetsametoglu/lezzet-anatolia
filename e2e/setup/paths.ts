/**
 * Saklanan oturum dosyalarının yolu — kurulum projesi YAZAR, operasyon projesi OKUR. Tek yerde
 * durması şart: iki tarafa ayrı ayrı yazılsaydı biri değişince öteki sessizce eski dosyayı okur ve
 * koşu "neden yetkisizim" diye kızarırdı.
 *
 * `.test-results/` altında, çünkü orası zaten `.gitignore`da ve her koşunun artefaktı orada
 * toplanıyor. Oturum çerezi repoya GİTMEZ.
 */
export const OPERATIONS_STORAGE_STATE = '.test-results/e2e-auth/operations.json';
