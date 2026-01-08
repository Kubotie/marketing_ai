'use client';

import { MarketInsight } from '@/types/schema';

interface MarketInsightViewProps {
  insights: MarketInsight[];
  onHighlightBanners: (bannerIds: string[]) => void;
  highlightedBannerIds: Set<string>;
}

export default function MarketInsightView({
  insights,
  onHighlightBanners,
  highlightedBannerIds,
}: MarketInsightViewProps) {
  const getCategoryLabel = (category: MarketInsight['category']) => {
    switch (category) {
      case 'high_frequency':
        return '高頻度';
      case 'low_frequency':
        return '低頻度';
      case 'combination':
        return '組み合わせ';
      case 'brand_difference':
        return 'ブランド差分';
      default:
        return '';
    }
  };

  const getCategoryColor = (category: MarketInsight['category']) => {
    switch (category) {
      case 'high_frequency':
        return 'bg-blue-100 border-blue-300';
      case 'low_frequency':
        return 'bg-yellow-100 border-yellow-300';
      case 'combination':
        return 'bg-green-100 border-green-300';
      case 'brand_difference':
        return 'bg-purple-100 border-purple-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="space-y-4">
      {insights.length === 0 ? (
        <div className="text-center text-gray-500 py-8">市場インサイトがありません</div>
      ) : (
        insights.map((insight, idx) => {
          const isHighlighted = insight.supporting_banners.some((id) =>
            highlightedBannerIds.has(id)
          );

          return (
            <div
              key={idx}
              className={`border rounded-lg p-4 transition-all cursor-pointer ${
                isHighlighted
                  ? 'ring-2 ring-blue-500 shadow-lg'
                  : 'hover:shadow-md'
              } ${getCategoryColor(insight.category)}`}
              onClick={() => onHighlightBanners(insight.supporting_banners)}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium px-2 py-1 bg-white rounded">
                  {getCategoryLabel(insight.category)}
                </span>
                <span className="text-xs text-gray-600">
                  {insight.supporting_banners.length}件のバナー
                </span>
              </div>

              {/* ペルソナの前提 */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 mb-1">【1. ペルソナの前提（仮説）】</div>
                <div className="text-sm text-gray-800">{insight.persona_assumption}</div>
              </div>

              {/* 競合の選択 */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-600 mb-1">【2. 競合の選択（事実 + 根拠）】</div>
                <div className="text-sm text-gray-800 mb-1">
                  <span className="font-medium">{insight.competitor_choice.choice}</span>
                </div>
                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  根拠: {insight.competitor_choice.evidence}
                </div>
              </div>

              {/* その合理性 */}
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">【3. その合理性（仮説）】</div>
                <div className="text-sm font-medium text-blue-700">{insight.rationality_hypothesis}</div>
              </div>

              {/* クリックヒント */}
              <div className="mt-2 text-xs text-gray-500 italic">
                クリックで根拠となるバナーをハイライト
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
