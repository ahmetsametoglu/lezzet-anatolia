const BACK_VOWELS = 'aıouâàôû';
const FRONT_VOWELS = 'eiöüéèêëäîï';
const VOICELESS = 'fstkçşhp';

/** Adın bulunma eki: son ünlüye ve son harfin sertliğine uyar ("Strasbourg'da", "Kehl'de", "Paris'te", "14 Kasım'da"). */
export function locative(name: string): string {
  const letters = [...name.trim().toLocaleLowerCase('tr')];
  const vowel = [...letters].reverse().find((letter) => BACK_VOWELS.includes(letter) || FRONT_VOWELS.includes(letter));
  const consonant = VOICELESS.includes(letters.at(-1) ?? '') ? 't' : 'd';
  return `'${consonant}${vowel !== undefined && BACK_VOWELS.includes(vowel) ? 'a' : 'e'}`;
}
