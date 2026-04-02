import wikipediaCatalog from '../data/wikipedia-catalog.json';

const wikipediaLevelByTitle = new Map<string, number>(
  wikipediaCatalog.articles.map((article) => [article.title, article.lowestLevel]),
);

export function wikipediaLevelForTitle(title: string): number {
  return wikipediaLevelByTitle.get(title) ?? 3;
}

export function enrichWikipediaReadingItems<T extends { title: string }>(
  items: T[] | undefined,
): Array<T & { lowestLevel: number }> | undefined {
  return items?.map((item) => ({
    ...item,
    lowestLevel: wikipediaLevelForTitle(item.title),
  }));
}
