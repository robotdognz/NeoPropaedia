export type RecommendationCardBadgeTone = 'accent' | 'neutral';

export interface RecommendationCardBadge {
  label: string;
  tone?: RecommendationCardBadgeTone;
}

export type RecommendationCardFlagTone = 'success' | 'warning' | 'info' | 'muted' | 'topic';

export interface RecommendationCardFlag {
  label: string;
  tone?: RecommendationCardFlagTone;
}

export function recommendationBadge(
  label: string,
  tone: RecommendationCardBadgeTone = 'neutral',
): RecommendationCardBadge {
  return { label, tone };
}

export function recommendationFlag(
  label: string,
  tone: RecommendationCardFlagTone = 'muted',
): RecommendationCardFlag {
  return { label, tone };
}
