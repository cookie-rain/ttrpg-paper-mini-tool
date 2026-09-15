/** Converts a zero-based index to spreadsheet-style letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function indexToLetters(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** Derives a readable figure name from a file name: "dark_elf-ranger.png" -> "Dark Elf Ranger". */
export function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim();
  return base.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase()) || 'Figure';
}
