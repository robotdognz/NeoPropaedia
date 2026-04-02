import { useEffect, useState } from 'preact/hooks';
import {
  getStoredWikipediaLevel,
  subscribeWikipediaLevel,
  type WikipediaKnowledgeLevel,
} from '../utils/wikipediaLevel';

export function useWikipediaLevel(): WikipediaKnowledgeLevel {
  const [wikiLevel, setWikiLevel] = useState<WikipediaKnowledgeLevel>(() => getStoredWikipediaLevel());

  useEffect(() => {
    setWikiLevel(getStoredWikipediaLevel());
    return subscribeWikipediaLevel((level) => setWikiLevel(level));
  }, []);

  return wikiLevel;
}
