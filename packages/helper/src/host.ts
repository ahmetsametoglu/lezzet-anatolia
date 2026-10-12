/** Ad yerel makineyi mi gösteriyor; port ayrılır, IPv6 köşeli parantezle gelir. */
export function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

/** Adres yerel makineyi mi gösteriyor; okunamayan adres yerel sayılmaz ki belirsizlik açık kapıya yorulmasın. */
export function isLocalUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return isLocalHost(new URL(raw).host);
  } catch {
    return false;
  }
}
