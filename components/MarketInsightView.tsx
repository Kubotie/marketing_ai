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

              {/* 1. 想定されているペルソナ前提（人の不安・制約） */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">
                  【1. 想定されているペルソナ前提（人の不安・制約）】
                </div>
                <div className="text-sm text-gray-800 mb-1">{insight.persona_assumption.assumption}</div>
                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  根拠: {insight.persona_assumption.evidence}
                </div>
              </div>

              {/* 2. 観測された競合の選択（事実 + 根拠） */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">
                  【2. 観測された競合の選択（事実 + 根拠）】
                </div>
                <div className="text-sm text-gray-800 mb-1">
                  <span className="font-medium">{insight.competitor_choice.choice}</span>
                </div>
                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  根拠: {insight.competitor_choice.evidence}
                </div>
                {insight.competitor_choice.bbox_references &&
                  insight.competitor_choice.bbox_references.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      BBox参照: {insight.competitor_choice.bbox_references.length}件
                    </div>
                  )}
              </div>

              {/* 3. なぜその選択が合理的か（仮説） */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">
                  【3. なぜその選択が合理的か（仮説）】
                </div>
                <div className="text-sm text-gray-800">{insight.rationality_hypothesis}</div>
              </div>

              {/* 4. 当たり前になっている可能性（外すとリスク） */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">
                  【4. 当たり前になっている可能性（外すとリスク）】
                </div>
                <div className="text-sm font-medium text-orange-700">{insight.taken_for_granted_risk}</div>
              </div>

              {/* バナー/LP企画に使うための問い（Planning Hooks） */}
              {insight.planning_hooks && insight.planning_hooks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-600 mb-2">
                    【バナー/LP企画に使うための問い】
                  </div>
                  <div className="space-y-2">
                    {insight.planning_hooks.map((hook, hookIdx) => (
                      <div key={hookIdx} className="bg-blue-50 border border-blue-200 rounded p-3">
                        <div className="text-sm font-semibold text-blue-900 mb-1">{hook.question}</div>
                        <div className="text-xs text-blue-700">{hook.context}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* クリックヒント */}
              <div className="mt-3 text-xs text-gray-500 italic">
                クリックで根拠となるバナーをハイライト
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
