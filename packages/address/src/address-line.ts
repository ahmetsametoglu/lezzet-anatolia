interface AddressLineParts {
  line1?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/** Kayıtlı adresin tek satırı: sokak, varsa kat/daire, posta kodu ve şehir. Boş parça atlanır, çünkü siparişe yazılmış anlık görüntü eksik alan taşıyabilir. */
export function addressLine(address: AddressLineParts): string {
  const place = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [address.line1, address.line2, place].filter(Boolean).join(', ');
}
