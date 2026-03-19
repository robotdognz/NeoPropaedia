export function normalizeLookupText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function vsiLookupKey(title: string, author: string): string {
  return `${normalizeLookupText(title)}::${normalizeLookupText(author)}`;
}

export function macropaediaLookupKey(title: string): string {
  return normalizeLookupText(title);
}
