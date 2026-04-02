import { h } from 'preact';
import { slugify } from '../../utils/helpers';
import { linkifyRationaleReferences } from '../../utils/rationaleLinks';
import { formatWikipediaWordCount } from '../../utils/wikipediaCatalog';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';
import ReadingRecommendationCard from './ReadingRecommendationCard';

export interface WikipediaCardProps {
  title: string;
  displayTitle?: string;
  wordCount?: number;
  rationale?: string;
  baseUrl: string;
  sectionCode?: string;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  badges?: RecommendationCardBadge[];
  whyTitle?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export default function WikipediaCard({
  title,
  displayTitle,
  wordCount,
  rationale,
  baseUrl,
  sectionCode,
  matchPercent,
  flags,
  badges,
  whyTitle = 'Why this article?',
  checked,
  onCheckedChange,
}: WikipediaCardProps) {
  const metadata = formatWikipediaWordCount(wordCount) ?? null;

  return (
    <ReadingRecommendationCard
      title={displayTitle || title}
      href={`${baseUrl}/wikipedia/${slugify(title)}`}
      metadata={metadata}
      matchPercent={matchPercent}
      flags={flags}
      badges={badges}
      whyTitle={rationale ? whyTitle : undefined}
      whyContent={rationale ? <p class="text-gray-600">{linkifyRationaleReferences(rationale, baseUrl, sectionCode)}</p> : undefined}
      checked={checked}
      onCheckedChange={onCheckedChange}
      checkboxAriaLabel={`Mark ${title} as read`}
    />
  );
}
