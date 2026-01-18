'use client';

import { useState, useCallback, useEffect } from 'react';
import ImageUpload from '@/components/ImageUpload';
import ImageList from '@/components/ImageList';
import AnalysisResult from '@/components/AnalysisResult';
import AggregationView from '@/components/AggregationView';
import MarketInsightView from '@/components/MarketInsightView';
import StrategyOptionsView from '@/components/StrategyOptionsView';
import PlanningHooksView from '@/components/PlanningHooksView';
import PersonaView from '@/components/PersonaView';
import PlanningSummaryView from '@/components/PlanningSummaryView';
import { Extraction, Aggregation, Persona, MarketInsight, StrategyOption, PlanningHook } from '@/types/schema';
import {
  generateDummyExtraction,
  generateDummyAggregation,
  generateFullInsights,
} from '@/lib/dummy-data';
import {
  generateDemoExtractions,
  generateDemoPersonas,
  generateDemoMarketInsights,
} from '@/lib/demo-data';
import { generateStrategyOptions, generatePlanningHooks } from '@/lib/insights';
import { getImageSize } from '@/lib/image-utils';
import UnifiedLayout from '@/components/UnifiedLayout';
import { useRouter } from 'next/navigation';
import { createImageAsset, updateImageAsset, getImageAsset } from '@/lib/image-asset-db';
import { useProductStore } from '@/store/useProductStore';
import { createBannerHistory, updateBannerHistory, getBannerHistory, getTabName } from '@/lib/banner-history-db';
import type { BannerHistory } from '@/types/banner-history';
import { useSearchParams } from 'next/navigation';

interface Banner {
  id: string;
  imageUrl: string;
  extraction: Extraction;
  imageWidth: number;
  imageHeight: number;
  imageAssetId?: string; // ImageAsset.imageId（レイアウト保存用）
  originalFile?: File; // 元のFileオブジェクト（自動検出用）
}

/**
 * バナー分析ページ（画像読み込み・AI分析）
 * /banners（/banner-analyzerの置き換え）
 */
export default function BannersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const historyIdParam = searchParams.get('historyId');
  const { activeProduct } = useProductStore();
  
  const [banners, setBanners] = useState<Banner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'aggregation' | 'insight' | 'strategy' | 'planning' | 'summary'>('analysis');
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(historyIdParam || null);
  const [filters, setFilters] = useState<{ appealAxis?: string; component?: string }>({});
  const [aggregationFilters, setAggregationFilters] = useState<{
    appealAxis?: string;
    component?: string;
    brand?: string;
  }>({});

  // ステップIDをタブから取得（右ナビ表示用）
  const getCurrentStepId = (): string | undefined => {
    if (banners.length === 0) return 'analyze';
    if (activeTab === 'analysis') return 'analysis';
    if (activeTab === 'aggregation') return 'insight';
    if (activeTab === 'insight') return 'insight';
    if (activeTab === 'strategy') return 'strategy';
    if (activeTab === 'planning') return 'planning';
    return 'analyze';
  };

  // ステップクリックハンドラー（右ナビから）
  const handleStepClick = (stepId: string) => {
    if (stepId === 'analyze') {
      setActiveTab('analysis');
      setSelectedId(null);
    } else if (stepId === 'analysis') {
      setActiveTab('analysis');
    } else if (stepId === 'insight') {
      setActiveTab('insight');
    } else if (stepId === 'strategy') {
      setActiveTab('strategy');
    } else if (stepId === 'planning') {
      setActiveTab('planning');
    }
  };
  
  const [highlightedBannerIds, setHighlightedBannerIds] = useState<Set<string>>(new Set());
  const [selectedInsightIndex, setSelectedInsightIndex] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [ocrStatus, setOcrStatus] = useState<Record<string, 'idle' | 'processing' | 'completed' | 'error'>>({});
  const [ocrError, setOcrError] = useState<Record<string, string>>({});
  
  // AI生成結果の状態管理（C1/C2/D）
  const [aiMarketInsights, setAiMarketInsights] = useState<any[]>([]);
  const [aiStrategyOptions, setAiStrategyOptions] = useState<any[]>([]);
  const [aiPlanningHooks, setAiPlanningHooks] = useState<any[]>([]);

  // OCR再試行関数
  const retryOCR = useCallback(async (bannerId: string) => {
    const banner = banners.find((b) => b.id === bannerId);
    if (!banner) return;

    // 画像URLからFileを再取得する必要があるが、URL.createObjectURLで作成したURLからは取得できない
    // そのため、ImageAssetから元のファイルを取得するか、別の方法を検討する必要がある
    // 簡易実装: 現在の画像URLを使用して再試行
    setOcrStatus((prev) => ({ ...prev, [bannerId]: 'processing' }));
    setOcrError((prev) => {
      const newErrors = { ...prev };
      delete newErrors[bannerId];
      return newErrors;
    });

    try {
      // 画像URLからBlobを取得
      const response = await fetch(banner.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `banner_${bannerId}.png`, { type: blob.type });

      // OCR実行関数を使用
      const { runOcrOnImage } = await import('@/lib/ocr-client');
      const ocrResults = await runOcrOnImage(file, banner.imageWidth, banner.imageHeight);

      // OCR結果0件の場合は失敗として扱う
      if (ocrResults.length === 0) {
        console.warn('[retryOCR] ⚠️ OCR結果が0件です。');
        setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
        setOcrError((prev) => ({ 
          ...prev, 
          [bannerId]: 'テキストが検出できませんでした。画像の解像度/コントラスト/形式を確認してください。' 
        }));
        return;
      }

      // OCR結果をcomponentsに変換
      const { convertOCRToComponents } = await import('@/lib/ocr-utils');
      const ocrComponents = convertOCRToComponents(ocrResults);

      // Components変換後も0件の場合は失敗
      if (ocrComponents.length === 0) {
        console.warn('[retryOCR] ⚠️ Components変換後も0件です。');
        setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
        setOcrError((prev) => ({ 
          ...prev, 
          [bannerId]: 'テキストが検出できませんでした。画像の解像度/コントラスト/形式を確認してください。' 
        }));
        return;
      }

      // ExtractionのcomponentsにOCR結果を追加（既存のOCR componentsを置き換え）
      const updatedExtraction = {
        ...banner.extraction,
        components: [
          ...banner.extraction.components.filter((c) => !['price', 'cta', 'headline', 'body_text'].includes(c.type)),
          ...ocrComponents,
        ],
      };

      // バナーを更新
      setBanners((prev) =>
        prev.map((b) => (b.id === bannerId ? { ...b, extraction: updatedExtraction } : b))
      );

      setOcrStatus((prev) => ({ ...prev, [bannerId]: 'completed' }));
    } catch (error) {
      console.error('[retryOCR] OCR再試行エラー（詳細）:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        bannerId,
        imageUrl: banner.imageUrl,
      });
      const errorMessage = error instanceof Error ? error.message : 'OCR解析に失敗しました';
      setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
      setOcrError((prev) => ({ ...prev, [bannerId]: errorMessage }));
    }
  }, [banners]);

  const handleUpload = useCallback(async (files: File[]) => {
    // まず画像をアップロードしてプレビュー表示（OCRは後で非同期実行）
    const newBanners: Banner[] = await Promise.all(
      files.map(async (file, index) => {
        const imageUrl = URL.createObjectURL(file);
        const bannerId = `banner_${Date.now()}_${index}`;
        
        // 画像サイズを取得
        const { width, height } = await getImageSize(imageUrl);

        // 初期状態: 空のExtractionを生成（ダミーBBoxは廃止）
        let extraction: Extraction = {
          banner_id: bannerId,
          brand: null,
          channel: null,
          format: '静止画',
          components: [], // 初期は空（AI自動検出で追加）
          appeal_axes: [],
          tone: null,
          notes: '画像をアップロードしました。自動検出を実行してください。',
          confidence: 0.0,
          selected_reason_hypothesis: null,
          avoided_expressions_hypothesis: null,
        };

        // ImageAssetとして保存（画像アップロード完了）
        let imageAssetId: string | undefined;
        try {
          const asset = createImageAsset({
            storageRef: imageUrl,
            productId: activeProduct?.productId,
            hasExtraction: extraction.components.length > 0,
            title: file.name,
          });
          imageAssetId = asset.imageId;
          updateImageAsset(asset.imageId, { notes: `bannerId:${bannerId}` });
        } catch (error) {
          console.error('Failed to save image asset:', error);
        }

        return {
          id: bannerId,
          imageUrl,
          extraction,
          imageWidth: width,
          imageHeight: height,
          imageAssetId, // レイアウト保存用
          originalFile: file, // 元のFileオブジェクト（自動検出用）
        };
      })
    );

    // バナーリストを更新（画像プレビュー表示）
    setBanners((prev) => [...prev, ...newBanners]);
    if (newBanners.length > 0 && !selectedId) {
      setSelectedId(newBanners[0].id);
      setActiveTab('analysis');
    }

    // OCR解析を非同期で実行（失敗してもUIを止めない）
    newBanners.forEach((banner, index) => {
      const bannerId = banner.id;
      const file = files[index];
      
      // OCRステータスを初期化
      setOcrStatus((prev) => ({ ...prev, [bannerId]: 'processing' }));
      setOcrError((prev) => {
        const newErrors = { ...prev };
        delete newErrors[bannerId];
        return newErrors;
      });

      // 非同期でOCR実行（エラーを握りつぶさないが、UIは続行）
      (async () => {
        try {
          // OCR実行関数を使用
          const { runOcrOnImage } = await import('@/lib/ocr-client');
          console.debug('[handleUpload] OCR実行開始:', { bannerId, width: banner.imageWidth, height: banner.imageHeight });
          const ocrResults = await runOcrOnImage(file, banner.imageWidth, banner.imageHeight);
          console.debug('[handleUpload] OCR結果取得:', { ocrResultsLength: ocrResults.length });

          // OCR結果0件の場合は失敗として扱う
          if (ocrResults.length === 0) {
            console.warn('[handleUpload] ⚠️ OCR結果が0件です。テキストが検出できませんでした。');
            setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
            setOcrError((prev) => ({ 
              ...prev, 
              [bannerId]: 'テキストが検出できませんでした。画像の解像度/コントラスト/形式を確認してください。' 
            }));
            return;
          }

          // OCR結果をcomponentsに変換
          const { convertOCRToComponents } = await import('@/lib/ocr-utils');
          const ocrComponents = convertOCRToComponents(ocrResults);
          console.debug('[handleUpload] Components変換完了:', { 
            ocrComponentsLength: ocrComponents.length,
            first3Components: ocrComponents.slice(0, 3).map(c => ({
              type: c.type,
              text: c.text?.substring(0, 20),
              bbox: { x: c.bbox.x, y: c.bbox.y, w: c.bbox.w, h: c.bbox.h },
            })),
          });

          // Components変換後も0件の場合は失敗
          if (ocrComponents.length === 0) {
            console.warn('[handleUpload] ⚠️ Components変換後も0件です。');
            setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
            setOcrError((prev) => ({ 
              ...prev, 
              [bannerId]: 'テキストが検出できませんでした。画像の解像度/コントラスト/形式を確認してください。' 
            }));
            return;
          }

          // ExtractionのcomponentsにOCR結果を追加
          setBanners((prev) =>
            prev.map((b) => {
              if (b.id === bannerId) {
                return {
                  ...b,
                  extraction: {
                    ...b.extraction,
                    components: [
                      ...b.extraction.components.filter((c) => {
                        // OCR由来でないもの（手動BBoxなど）は保持
                        const source = (c as any).source;
                        return source !== 'ocr' && !['price', 'cta', 'headline', 'body_text'].includes(c.type);
                      }),
                      ...ocrComponents.map((c) => ({ ...c, source: 'ocr' })),
                    ]as any[],
                  },
                };
              }
              return b;
            })
          );

          setOcrStatus((prev) => ({ ...prev, [bannerId]: 'completed' }));
        } catch (error) {
          console.error('[handleUpload] OCR解析エラー（詳細）:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            bannerId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });
          const errorMessage = error instanceof Error ? error.message : 'OCR解析に失敗しました';
          setOcrStatus((prev) => ({ ...prev, [bannerId]: 'error' }));
          setOcrError((prev) => ({ ...prev, [bannerId]: errorMessage }));
        }
      })();
    });
  }, [selectedId, activeProduct]);

  const selectedBanner = banners.find((b) => b.id === selectedId);

  // 画像選択時にレイアウトを自動復元
  useEffect(() => {
    if (!selectedBanner?.imageAssetId) return;

    (async () => {
      try {
        const { getBannerLayout } = await import('@/kb/db');
        const { restoreBannerLayout } = await import('@/lib/layout-client');
        const layoutItem = getBannerLayout(selectedBanner.imageAssetId!);
        
        if (layoutItem && layoutItem.payload.type === 'banner_layout') {
          const layoutPayload = layoutItem.payload as any;
          const restoredComponents = restoreBannerLayout(layoutPayload);
          
          // 現在のcomponentsを取得
          const currentExtraction = selectedBanner.extraction;
          
          // OCR由来（source==='ocr'）は保持し、手動BBox（source==='manual'）はlayoutで上書き
          const ocrComponents = currentExtraction.components.filter(
            (comp) => (comp as any).source === 'ocr'
          );
          
          const updatedExtraction = {
            ...currentExtraction,
            components: [...ocrComponents, ...restoredComponents],
          };
          
          // バナーを更新
          setBanners((prev) =>
            prev.map((b) =>
              b.id === selectedBanner.id
                ? { ...b, extraction: updatedExtraction }
                : b
            )
          );
          
          console.debug('[画像選択] レイアウト復元完了:', {
            imageId: selectedBanner.imageAssetId,
            restoredCount: restoredComponents.length,
            ocrCount: ocrComponents.length,
          });
        }
      } catch (layoutError) {
        console.warn('[画像選択] レイアウト復元エラー（無視）:', layoutError);
      }
    })();
  }, [selectedBanner?.imageAssetId, selectedBanner?.id]);

  // デモモードのデータを生成
  const [demoFullData, setDemoFullData] = useState<{
    personas: Persona[];
    marketInsights: MarketInsight[];
    strategyOptions: StrategyOption[];
    planningHooks: PlanningHook[];
    aggregation: Aggregation;
  } | null>(null);

  const loadDemoData = useCallback(async () => {
    const demoExtractionsRaw = generateDemoExtractions();
    // BBoxを正規化座標に変換
    const { normalizeExtractionBboxes } = await import('@/lib/bbox-normalize');
    const demoExtractions = demoExtractionsRaw.map((ext) =>
      normalizeExtractionBboxes(ext, 800, 600)
    );
    
    const demoPersonas = generateDemoPersonas();
    const demoAggregation = generateDummyAggregation(demoExtractions);
    const demoMarketInsights = generateDemoMarketInsights(demoAggregation, demoPersonas);
    const demoStrategyOptions = generateStrategyOptions(demoMarketInsights, demoAggregation, demoPersonas);
    const demoPlanningHooks = generatePlanningHooks(demoStrategyOptions, demoMarketInsights, demoPersonas);

    // デモ用のバナー画像URL（ダミー）
    const demoBanners: Banner[] = demoExtractions.map((ext, idx) => ({
      id: ext.banner_id,
      imageUrl: `https://via.placeholder.com/800x600/4A90E2/FFFFFF?text=Demo+Banner+${idx + 1}`,
      extraction: ext,
      imageWidth: 800,
      imageHeight: 600,
    }));

    setBanners(demoBanners);
    if (demoBanners.length > 0) {
      setSelectedId(demoBanners[0].id);
    }
    setDemoMode(true);

    const data = {
      personas: demoPersonas,
      marketInsights: demoMarketInsights,
      strategyOptions: demoStrategyOptions,
      planningHooks: demoPlanningHooks,
      aggregation: demoAggregation,
    };
    setDemoFullData(data);
    return data;
  }, []);

  // 集計データ（B）とC1, C2, Dを生成（ダミーデータは生成しない）
  const aggregation = demoMode && demoFullData
    ? demoFullData.aggregation
    : null; // ダミー生成を削除

  // 履歴から復元
  useEffect(() => {
    if (!historyIdParam) return;
    
    const history = getBannerHistory(historyIdParam);
    if (!history) {
      console.warn('履歴が見つかりません:', historyIdParam);
      return;
    }

    // バナーを復元（ImageAssetから画像URLを取得）
    (async () => {
      try {
        const restoredBanners: Banner[] = await Promise.all(
          history.banners.map(async (bannerData) => {
            let imageUrl = '';
            if (bannerData.imageAssetId) {
              const imageAsset = getImageAsset(bannerData.imageAssetId);
              if (imageAsset && imageAsset.storageRef) {
                // blob URLが有効かチェック（簡易実装: そのまま使用）
                imageUrl = imageAsset.storageRef;
              }
            }
            
            // ImageAssetから取得できない場合はエラー
            if (!imageUrl) {
              console.warn('画像URLを取得できませんでした:', bannerData.imageAssetId);
              // プレースホルダー画像を使用
              imageUrl = `https://via.placeholder.com/${bannerData.imageWidth}x${bannerData.imageHeight}`;
            }

            return {
              id: bannerData.id,
              imageUrl,
              extraction: bannerData.extraction,
              imageWidth: bannerData.imageWidth,
              imageHeight: bannerData.imageHeight,
              imageAssetId: bannerData.imageAssetId,
            };
          })
        );

        setBanners(restoredBanners);
        setSelectedId(history.selectedId);
        setAiMarketInsights(history.aiMarketInsights || []);
        setAiStrategyOptions(history.aiStrategyOptions || []);
        setCurrentHistoryId(history.historyId);
        
        // タブを復元
        if (history.currentTab !== activeTab) {
          setActiveTab(history.currentTab as any);
        }
      } catch (error) {
        console.error('履歴復元エラー:', error);
        alert('履歴の復元に失敗しました');
      }
    })();
  }, [historyIdParam, activeTab]);

  // 履歴を保存（バナーが変更されたとき）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (banners.length === 0) return;

    // デバウンス: 500ms後に保存
    const timer = setTimeout(() => {
      try {
        const title = `履歴_${new Date().toLocaleDateString('ja-JP')}_${banners.length}件`;
        
        const historyData: any = {
          title,
          currentTab: activeTab,
          banners: banners.map(b => ({
            id: b.id,
            extraction: b.extraction,
            imageWidth: b.imageWidth,
            imageHeight: b.imageHeight,
            imageAssetId: b.imageAssetId,
          })),
          selectedId,
          aggregation: aggregation || null,
          aiMarketInsights,
          aiStrategyOptions,
          fullInsights: (demoMode && demoFullData ? {
            marketInsights: demoFullData.marketInsights || [],
            strategyOptions: demoFullData.strategyOptions || [],
            planningHooks: demoFullData.planningHooks || [],
          } : null) as any,
          strategyOptions: demoMode && demoFullData ? demoFullData.strategyOptions || null : null,
          planningHooks: demoMode && demoFullData ? demoFullData.planningHooks || null : null,
          bannerCount: banners.length,
          lastTabName: getTabName(activeTab),
        };

        if (currentHistoryId) {
          // 既存の履歴を更新
          updateBannerHistory(currentHistoryId, historyData);
          console.log('[履歴保存] 更新:', currentHistoryId);
        } else {
          // 新しい履歴を作成
          const newHistory = createBannerHistory(historyData);
          setCurrentHistoryId(newHistory.historyId);
          console.log('[履歴保存] 作成:', newHistory.historyId);
        }
      } catch (error) {
        console.error('履歴の保存に失敗しました:', error);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [banners, activeTab, selectedId, aggregation, aiMarketInsights, aiStrategyOptions, demoMode, demoFullData, currentHistoryId]);
  
  const fullInsights = demoMode && demoFullData
    ? {
        personas: demoFullData.personas,
        marketInsights: demoFullData.marketInsights,
        strategyOptions: demoFullData.strategyOptions,
        planningHooks: demoFullData.planningHooks,
      }
    : null; // ダミー生成を削除

  return (
    <UnifiedLayout
      stepType="banner"
      currentStepId={getCurrentStepId()}
      onStepClick={handleStepClick}
    >
      <div className="h-full flex flex-col">
        {/* ツールバー */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-end gap-4">
          {banners.length === 0 && (
            <button
              onClick={() => {
                loadDemoData().catch((error) => {
                  console.error('デモデータ読み込みエラー:', error);
                });
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
            >
              デモデータを読み込む
            </button>
          )}
          {banners.length > 0 && demoMode && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm">
              デモモード
            </span>
          )}
        </div>

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
              ocrStatus={ocrStatus}
              ocrError={ocrError}
              onRetryOCR={retryOCR}
            />
          </div>

          {/* 右側: 分析結果 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* タブコンテンツ */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'analysis' && selectedBanner ? (
                <AnalysisResult
                  extraction={selectedBanner.extraction}
                  imageUrl={selectedBanner.imageUrl}
                  imageWidth={selectedBanner.imageWidth}
                  imageHeight={selectedBanner.imageHeight}
                  imageId={selectedBanner.imageAssetId}
                  originalFile={selectedBanner.originalFile}
                  bannerId={selectedBanner.id}
                  productId={activeProduct?.productId}
                  ocrComponents={selectedBanner.extraction.components.filter((comp) =>
                    ['price', 'cta', 'headline', 'body_text'].includes(comp.type)
                  )}
                  onExtractionUpdate={(updatedExtraction) => {
                    setBanners((prev) =>
                      prev.map((b) =>
                        b.id === selectedBanner.id
                          ? { ...b, extraction: updatedExtraction }
                          : b
                      )
                    );
                  }}
                  onSave={async () => {
                    try {
                      const { saveBannerExtraction } = await import('@/lib/kb-client');
                      const title = prompt('バナーのタイトルを入力してください:', `バナー_${selectedBanner.extraction.banner_id}`);
                      if (!title) return;
                      await saveBannerExtraction(selectedBanner.extraction, selectedBanner.imageUrl, {
                        title,
                        source_project_id: activeProduct?.productId,
                      });
                      
                      // ImageAssetも更新
                      const assetNotes = `bannerId:${selectedBanner.id}`;
                      const assets = (await import('@/lib/image-asset-db')).getImageAssets();
                      const asset = assets.find((a) => a.notes?.includes(assetNotes));
                      if (asset) {
                        (await import('@/lib/image-asset-db')).updateImageAsset(asset.imageId, {
                          hasExtraction: true,
                        });
                      }
                      
                      alert('ナレッジベースに保存しました。');
                    } catch (error) {
                      console.error('保存エラー:', error);
                      alert(`保存でエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
                    }
                  }}
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
              ) : activeTab === 'insight' ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">市場インサイト (Market Insight C1)</h2>
                  <MarketInsightView
                    insights={fullInsights?.marketInsights || []}
                    onHighlightBanners={(bannerIds) =>
                      setHighlightedBannerIds(new Set(bannerIds))
                    }
                    highlightedBannerIds={highlightedBannerIds}
                    personas={fullInsights?.personas || []}
                    onNavigateToPersona={(personaId) => {
                      router.push('/personas');
                    }}
                    onSaveInsight={async (insight) => {
                      try {
                        const { saveMarketInsightUnified } = await import('@/lib/kb-client-unified');
                        const title = prompt('インサイトのタイトルを入力してください:', `インサイト_${insight.competitor_choice.choice.substring(0, 20)}`);
                        if (!title) return;
                        await saveMarketInsightUnified(insight, {
                          title,
                          productId: activeProduct?.productId,
                        });
                        alert('ナレッジベースに保存しました。');
                      } catch (error) {
                        console.error('保存エラー:', error);
                        alert(`保存でエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
                      }
                    }}
                    imageId={selectedBanner?.imageAssetId}
                    productId={activeProduct?.productId}
                    extraction={selectedBanner?.extraction}
                    imageWidth={selectedBanner?.imageWidth}
                    imageHeight={selectedBanner?.imageHeight}
                    activeProduct={activeProduct ? {
                      productId: activeProduct.productId,
                      name: activeProduct.name,
                      category: activeProduct.category,
                      description: activeProduct.description,
                      competitors: activeProduct.competitors,
                    } : null}
                    onInsightsUpdate={(insights) => {
                      setAiMarketInsights(insights);
                    }}
                  />
                </div>
              ) : activeTab === 'summary' && fullInsights ? (
                <PlanningSummaryView
                  personas={fullInsights.personas}
                  marketInsights={fullInsights.marketInsights}
                  strategyOptions={fullInsights.strategyOptions}
                  planningHooks={fullInsights.planningHooks}
                  onSaveSummary={async () => {
                    try {
                      // 企画サマリー全体を保存（共通テンプレ統合版）
                      const { saveMarketInsightUnified, saveStrategyOptionUnified, savePlanningHookUnified } = await import('@/lib/kb-client-unified');
                      const title = prompt('企画サマリーのタイトルを入力してください:', `企画サマリー_${new Date().toLocaleDateString('ja-JP')}`);
                      if (!title) return;
                      
                      // 市場インサイトを保存（保存されたIDを追跡）
                      const savedInsightIds: string[] = [];
                      for (const insight of fullInsights.marketInsights) {
                        try {
                          const kbId = await saveMarketInsightUnified(insight, {
                            title: `${title}_インサイト_${insight.competitor_choice.choice.substring(0, 20)}`,
                            productId: activeProduct?.productId,
                          });
                          savedInsightIds.push(kbId);
                        } catch (error) {
                          console.error('インサイト保存エラー:', error);
                        }
                      }
                      
                      // 戦略オプションを保存（保存されたインサイトIDを使用）
                      const savedOptionIds: string[] = [];
                      for (const option of fullInsights.strategyOptions) {
                        try {
                          const kbId = await saveStrategyOptionUnified(option, savedInsightIds, {
                            title: `${title}_Option${option.option_type}_${option.title}`,
                            productId: activeProduct?.productId,
                          });
                          savedOptionIds.push(kbId);
                        } catch (error) {
                          console.error('戦略オプション保存エラー:', error);
                        }
                      }
                      
                      // 企画フックを保存（保存されたインサイトIDを使用）
                      for (const hook of fullInsights.planningHooks) {
                        try {
                          await savePlanningHookUnified(hook, savedInsightIds, {
                            title: `${title}_企画フック_Option${hook.strategy_option}`,
                            productId: activeProduct?.productId,
                          });
                        } catch (error) {
                          console.error('企画フック保存エラー:', error);
                        }
                      }
                      
                      alert('企画サマリーをナレッジベースに保存しました。');
                    } catch (error) {
                      console.error('保存エラー:', error);
                      alert(`保存でエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
                    }
                  }}
                />
              ) : activeTab === 'strategy' ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">戦略オプション (Strategy Options C2)</h2>
                  <StrategyOptionsView
                    options={fullInsights?.strategyOptions || []}
                    personas={fullInsights?.personas || []}
                    onSaveOption={async (option, relatedInsightIds) => {
                      try {
                        const { saveStrategyOptionUnified } = await import('@/lib/kb-client-unified');
                        const title = prompt('戦略オプションのタイトルを入力してください:', `Option${option.option_type}_${option.title}`);
                        if (!title) return;
                        await saveStrategyOptionUnified(option, relatedInsightIds, {
                          title,
                          productId: activeProduct?.productId,
                        });
                        alert('ナレッジベースに保存しました。');
                      } catch (error) {
                        console.error('保存エラー:', error);
                        alert(`保存でエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
                      }
                    }}
                    relatedInsightIds={fullInsights?.marketInsights.map((_, idx) => `insight-${idx}`) || []}
                    imageId={selectedBanner?.imageAssetId}
                    productId={activeProduct?.productId}
                    extraction={selectedBanner?.extraction}
                    imageWidth={selectedBanner?.imageWidth}
                    imageHeight={selectedBanner?.imageHeight}
                    activeProduct={activeProduct ? {
                      productId: activeProduct.productId,
                      name: activeProduct.name,
                      category: activeProduct.category,
                      description: activeProduct.description,
                      competitors: activeProduct.competitors,
                    } : null}
                    c1Insight={aiMarketInsights.length > 0 ? aiMarketInsights[0] : undefined}
                    onOptionsUpdate={(options) => {
                      setAiStrategyOptions(options);
                    }}
                  />
                </div>
              ) : activeTab === 'planning' ? (
                <div className="h-full overflow-y-auto p-6">
                  <h2 className="text-xl font-bold mb-4">企画フック (Planning Hooks D)</h2>
                  <PlanningHooksView 
                    hooks={fullInsights?.planningHooks || []}
                    onSaveHook={async (hook) => {
                      try {
                        const { savePlanningHookUnified } = await import('@/lib/kb-client-unified');
                        const title = prompt('企画フックのタイトルを入力してください:', `企画フック_Option${hook.strategy_option}`);
                        if (!title) return;
                        // PlanningHookを直接使用（relatedInsightIdsは空配列、後でonSaveSummaryで関連付け）
                        await savePlanningHookUnified(hook, [], {
                          title,
                          productId: activeProduct?.productId,
                        });
                        alert('ナレッジベースに保存しました。');
                      } catch (error) {
                        console.error('保存エラー:', error);
                        alert(`保存でエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
                      }
                    }}
                    imageId={selectedBanner?.imageAssetId}
                    productId={activeProduct?.productId}
                    extraction={selectedBanner?.extraction}
                    imageWidth={selectedBanner?.imageWidth}
                    imageHeight={selectedBanner?.imageHeight}
                    activeProduct={activeProduct ? {
                      productId: activeProduct.productId,
                      name: activeProduct.name,
                      category: activeProduct.category,
                      description: activeProduct.description,
                      competitors: activeProduct.competitors,
                    } : null}
                    c2Option={aiStrategyOptions.length > 0 ? aiStrategyOptions[0] : undefined}
                    onHooksUpdate={(hooks) => {
                      setAiPlanningHooks(hooks);
                    }}
                  />
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
    </UnifiedLayout>
  );
}
