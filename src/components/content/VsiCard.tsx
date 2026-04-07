import { h } from 'preact';
import { formatEditionLabel } from '../../utils/readingData';
import { slugify } from '../../utils/helpers';
import { linkifyRationaleReferences } from '../../utils/rationaleLinks';
import { formatVsiWordCount } from '../../utils/vsiCatalog';
import type {
  RecommendationCardBadge,
  RecommendationCardFlag,
} from '../../utils/recommendationCardMeta';
import ReadingRecommendationCard from './ReadingRecommendationCard';

export interface VsiCardProps {
  title: string;
  author?: string;
  rationale?: string;
  baseUrl: string;
  sectionCode?: string;
  publicationYear?: number;
  edition?: number;
  wordCount?: number;
  matchPercent?: number;
  flags?: RecommendationCardFlag[];
  badges?: RecommendationCardBadge[];
  whyTitle?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export default function VsiCard({
  title,
  author,
  rationale,
  baseUrl,
  sectionCode,
  publicationYear,
  edition,
  wordCount,
  matchPercent,
  flags,
  badges,
  whyTitle = 'Why this book?',
  checked,
  onCheckedChange,
}: VsiCardProps) {
  const editionLabel = formatEditionLabel(edition);
  const metadata = [
    author,
    formatVsiWordCount(wordCount),
    editionLabel,
    publicationYear ? String(publicationYear) : null,
  ].filter(Boolean).join(' · ');

  return (
    <ReadingRecommendationCard
      title={title}
      href={`${baseUrl}/vsi/${slugify(title)}`}
      metadata={metadata || null}
      matchPercent={matchPercent}
      flags={flags}
      badges={badges}
      whyTitle={rationale ? whyTitle : undefined}
      whyContent={rationale ? <p class="text-gray-600">{linkifyRationaleReferences(rationale, baseUrl, sectionCode)}</p> : undefined}
      checked={checked}
      onCheckedChange={onCheckedChange}
      checkboxAriaLabel={`Mark ${title}${author ? ` by ${author}` : ''} as completed`}
    />
  );
}
