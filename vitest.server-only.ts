// `server-only` paketinin test karşılığı — boş modül.
//
// Gerçek paket, istemci paketine girildiğinde fırlatarak sunucu kodunun tarayıcıya sızmasını
// engeller. Testte istemci paketi yoktur; koruma orada yalnız `lib/**` okumalarının hiç test
// edilememesine yol açıyordu. Koruma gerçek yerinde (Next derlemesi) aynen durur.
export {};
