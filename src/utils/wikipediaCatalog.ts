import wikipediaCatalog from '../data/wikipedia-catalog.json';

const wikipediaLevelByTitle = new Map<string, number>(
  wikipediaCatalog.articles.map((article) => [article.title, article.lowestLevel]),
);
const wikipediaMetadataByTitle = new Map(
  wikipediaCatalog.articles.map((article) => [article.title, article]),
);
const wordCountFormatter = new Intl.NumberFormat('en-US');

export function wikipediaLevelForTitle(title: string): number {
  return wikipediaLevelByTitle.get(title) ?? 3;
}

export function wikipediaWordCountForTitle(title: string): number | undefined {
  return wikipediaMetadataByTitle.get(title)?.wordCount;
}

export function wikipediaDisplayTitleForTitle(title: string): string | undefined {
  return wikipediaMetadataByTitle.get(title)?.displayTitle;
}

export function formatWikipediaWordCount(wordCount?: number): string | undefined {
  if (!wordCount || wordCount <= 0) return undefined;
  return `${wordCountFormatter.format(wordCount)} words`;
}

export function enrichWikipediaReadingItems<T extends { title: string; displayTitle?: string }>(
  items: T[] | undefined,
): Array<T & { lowestLevel: number; wordCount?: number; displayTitle?: string }> | undefined {
  return items?.map((item) => ({
    ...item,
    lowestLevel: wikipediaLevelForTitle(item.title),
    wordCount: wikipediaWordCountForTitle(item.title),
    displayTitle: 'displayTitle' in item && typeof item.displayTitle === 'string'
      ? item.displayTitle
      : wikipediaDisplayTitleForTitle(item.title),
  }));
}
