'use client';

import { useState, useCallback } from 'react';
import ImageUpload from '@/components/ImageUpload';
import ImageList from '@/components/ImageList';
import AnalysisResult from '@/components/AnalysisResult';
import AggregationView from '@/components/AggregationView';
import MarketInsightView from '@/components/MarketInsightView';
import StrategyOptionsView from '@/components/StrategyOptionsView';
import PlanningHooksView from '@/components/PlanningHooksView';
import { Extraction, Aggregation } from '@/types/schema';
import {
  generateDummyExtraction,
  generateDummyAggregation,
  generateFullInsights,
} from '@/lib/dummy-data';
import { getImageSize } from '@/lib/image-utils';

interface Banner {
  id: string;
  imageUrl: string;
  extraction: Extraction;
  imageWidth: number;
  imageHeight: number;
}

export default function Home() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ appealAxis?: string; component?: string }>({});
  const [aggregationFilters, setAggregationFilters] = useState<{
    appealAxis?: string;
    component?: string;
    brand?: string;
  }>({});
  const [activeTab, setActiveTab] = useState<
    'analysis' | 'aggregation' | 'insight' | 'strategy' | 'planning'
  >('analysis');
  const [highlightedBannerIds, setHighlightedBannerIds] = useState<Set<string>>(new Set());

  const handleUpload = useCallback(async (files: File[]) => {
    const newBanners: Banner[] = await Promise.all(
      files.map(async (file, index) => {
        const imageUrl = URL.createObjectURL(file);
        const bannerId = `banner_${Date.now()}_${index}`;
        
        // 画像サイズを取得
        const { width, height } = await getImageSize(imageUrl);

        const extraction = generateDummyExtraction(bannerId, imageUrl);

        return {
          id: bannerId,
          imageUrl,
          extraction,
          imageWidth: width,
          imageHeight: height,
        };
      })
    );

    setBanners((prev) => [...prev, ...newBanners]);
    if (newBanners.length > 0 && !selectedId) {
      setSelectedId(newBanners[0].id);
    }
  }, [selectedId]);

  const selectedBanner = banners.find((b) => b.id === selectedId);

  // 集計データ（B）とC1, C2, Dを生成
  const aggregation = banners.length > 0 ? generateDummyAggregation(banners.map((b) => b.extraction)) : null;
  const fullInsights = aggregation && banners.length > 0
    ? generateFullInsights(banners.map((b) => b.extraction), aggregation)
    : null;

  const handleExport = () => {
    if (banners.length === 0) return;

    const exportData = {
      extractions: banners.map((b) => b.extraction), // A
      aggregation: aggregation, // B
      // C1, C2, D は必要に応じて追加可能
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `banner-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">競合バナー分析アプリ</h1>
        <div className="flex items-center gap-4">
          {banners.length > 0 && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              エクスポート (A/B JSON)
            </button>
          )}
        </div>
      </header>

      {/* メインコンテンツ */}
      {banners.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <ImageUpload onUpload={handleUpload} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* 左サイドバー: 画像一覧 + フィルタ */}
          <div className="w-80 bg-white border-r flex flex-col">
            <ImageList
              banners={banners}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filters={filters}
              onFilterChange={setFilters}
              highlightedBannerIds={highlightedBannerIds}
            />
          </div>

          {/* 右側: 分析結果 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* タブ */}
            <div className="bg-white border-b flex overflow-x-auto">
              <button
                className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'analysis'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('analysis')}
              >
                個別分析 (A)
              </button>
              <button
                className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'aggregation'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('aggregation')}
              >
                集計 (B)
              </button>
              <button
                className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'insight'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('insight')}
              >
                市場インサイト (C1)
              </button>
              <button
                className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'strategy'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('strategy')}
              >
                戦略オプション (C2)
              </button>
              <button
                className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'planning'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('planning')}
              >
                企画フック (D)
              </button>
            </div>

            {/* タブコンテンツ */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'analysis' && selectedBanner ? (
                <AnalysisResult
                  extraction={selectedBanner.extraction}
                  imageUrl={selectedBanner.imageUrl}
                  imageWidth={selectedBanner.imageWidth}
                  imageHeight={selectedBanner.imageHeight}
                />
              ) : activeTab === 'aggregation' && aggregation ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">集計結果 (Aggregation B)</h2>
                  <AggregationView
                    aggregation={aggregation}
                    filters={aggregationFilters}
                    onFilterChange={setAggregationFilters}
                  />
                </div>
              ) : activeTab === 'insight' && fullInsights ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">市場インサイト (Market Insight C1)</h2>
                  <MarketInsightView
                    insights={fullInsights.marketInsights}
                    onHighlightBanners={(bannerIds) =>
                      setHighlightedBannerIds(new Set(bannerIds))
                    }
                    highlightedBannerIds={highlightedBannerIds}
                  />
                </div>
              ) : activeTab === 'strategy' && fullInsights ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">戦略オプション (Strategy Options C2)</h2>
                  <StrategyOptionsView options={fullInsights.strategyOptions} />
                </div>
              ) : activeTab === 'planning' && fullInsights ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">企画フック (Planning Hooks D)</h2>
                  <PlanningHooksView hooks={fullInsights.planningHooks} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  {activeTab === 'analysis'
                    ? '画像を選択してください'
                    : '分析結果がありません'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
