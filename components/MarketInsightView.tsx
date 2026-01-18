'use client';

import { useState, useEffect } from 'react';
import { MarketInsight, Persona, Extraction } from '@/types/schema';
import type { MarketInsightPayload } from '@/kb/common';
import { listKbItems, saveKbItem } from '@/kb/common-api';
import { InsightPayloadBaseSchema } from '@/kb/common-schemas';
import { collectInsightInputs } from '@/lib/insight-input-collector';
import { z } from 'zod';

interface MarketInsightViewProps {
  insights: MarketInsight[];
  onHighlightBanners: (bannerIds: string[]) => void;
  highlightedBannerIds: Set<string>;
  personas?: Persona[];
  onNavigateToPersona?: (personaId: string) => void;
  onSaveInsight?: (insight: MarketInsight) => void; // 「このインサイトを保存」コールバック
  // AI生成用の追加プロップ
  imageId?: string;
  productId?: string;
  extraction?: Extraction | null;
  imageWidth?: number;
  imageHeight?: number;
  activeProduct?: { productId: string; name: string; category?: string; description?: string; competitors?: Array<{ name: string }> } | null;
  notes?: string;
  onInsightsUpdate?: (insights: MarketInsightPayload[]) => void; // AI生成結果を更新
  initialAiInsights?: MarketInsightPayload[]; // 履歴から復元されたAI生成結果
}

export default function MarketInsightView({
  insights,
  onHighlightBanners,
  highlightedBannerIds,
  personas = [],
  onNavigateToPersona,
  onSaveInsight,
  imageId,
  productId,
  extraction,
  imageWidth = 800,
  imageHeight = 600,
  activeProduct,
  notes,
  onInsightsUpdate,
  initialAiInsights = [],
}: MarketInsightViewProps) {
  const [aiInsights, setAiInsights] = useState<MarketInsightPayload[]>(initialAiInsights);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<z.ZodError | null>(null);

  // 親コンポーネントから渡されたAI生成結果を反映（履歴復元用）
  useEffect(() => {
    if (initialAiInsights.length > 0 && aiInsights.length === 0) {
      setAiInsights(initialAiInsights);
      console.log('[C1復元] 履歴から復元:', initialAiInsights);
    }
  }, [initialAiInsights, aiInsights.length]);

  // KBから復元（初回読み込み時、imageIdがあれば復元）
  useEffect(() => {
    if (!imageId) return;

    const restoreFromKB = async () => {
      try {
        // imageIdで検索（productIdはオプショナル）
        const existing = listKbItems({ kind: 'market_insight', imageId, productId });
        if (existing.length > 0) {
          // 最新1件を使用
          const latest = existing.sort((a, b) => 
            new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime()
          )[0];
          
          // 新しい形式（meta/payload構造）に対応
          const payload = latest.payload as any;
          
          // meta/payload構造かどうかを判定
          if (payload.meta && payload.payload) {
            const validated = InsightPayloadBaseSchema.safeParse(payload);
            
            if (validated.success) {
              setAiInsights([validated.data as any]);
              if (onInsightsUpdate) {
                onInsightsUpdate([validated.data as any]);
              }
              console.log('[C1復元] KBから復元完了:', validated.data);
            } else {
              console.warn('[C1復元] Zod検証エラー:', validated.error);
              setValidationErrors(validated.error);
            }
          } else {
            // 旧形式の場合はスキップ（AI生成を促す）
            console.warn('[C1復元] 旧形式のデータはスキップします');
          }
        } else {
          console.log('[C1復元] KBにデータが見つかりませんでした');
        }
      } catch (error) {
        console.error('[C1復元] エラー:', error);
      }
    };

    restoreFromKB();
  }, [imageId, productId, onInsightsUpdate]);

  // AI生成
  const handleGenerate = async (regenerate: boolean = false) => {
    if (!imageId || !extraction) {
      alert('画像ID、Extractionが必要です。');
      return;
    }

    if (regenerate && !confirm('既存の市場インサイトを再生成しますか？')) {
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setValidationErrors(null);

    try {
      // 入力データ収集
      const inputs = await collectInsightInputs(
        imageId,
        productId,
        extraction,
        imageWidth,
        imageHeight,
        (activeProduct ? {
          productId: activeProduct.productId,
          name: activeProduct.name,
          category: activeProduct.category,
          description: activeProduct.description,
          competitors: activeProduct.competitors,
        } : null) as any,
        notes
      );

      // AI生成API呼び出し（新しい形式に対応）
      const res = await fetch('/api/banner/generate-market-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          inputs: {
            ...inputs,
            imageId,
            productId,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`生成APIエラー: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      const insight = data.insight as MarketInsightPayload;

      // Zod検証（新しい形式：meta/payload構造）
      const validated = InsightPayloadBaseSchema.safeParse(insight);
      if (!validated.success) {
        console.error('[C1生成] Zod検証エラー:', validated.error);
        setValidationErrors(validated.error);
        throw new Error('生成結果の検証に失敗しました');
      }

      setAiInsights([validated.data]);
      if (onInsightsUpdate) {
        onInsightsUpdate([validated.data]);
      }

      // 自動保存
      try {
        await saveKbItem('market_insight', validated.data, {
          title: `市場インサイト_${new Date().toLocaleDateString('ja-JP')}`,
          imageId,
          productId,
        });
        console.log('[C1生成] KBに保存完了');
      } catch (saveError) {
        console.error('[C1生成] KB保存エラー:', saveError);
        alert('生成は成功しましたが、保存に失敗しました。');
      }
    } catch (error) {
      console.error('[C1生成] エラー:', error);
      setGenerationError(error instanceof Error ? error.message : String(error));
      alert(`生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 表示用のinsights（AI生成があれば優先、なければ旧insights）
  const displayInsights: (MarketInsightPayload | MarketInsight)[] = aiInsights.length > 0 ? aiInsights : insights;

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
      {/* AI生成ボタン */}
      {imageId && extraction && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">AI生成</h3>
            <div className="flex gap-2">
              {aiInsights.length === 0 ? (
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isGenerating ? '生成中...' : 'AIで生成'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
                  >
                    {isGenerating ? '再生成中...' : '再生成'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        // 新しい形式（meta/payload構造）で保存
                        const insightToSave = aiInsights[0];
                        if (!insightToSave) {
                          alert('保存するインサイトがありません。');
                          return;
                        }
                        console.log('[C1保存] 開始:', insightToSave);
                        const kbId = await saveKbItem('market_insight', insightToSave, {
                          title: `市場インサイト_${new Date().toLocaleDateString('ja-JP')}`,
                          imageId,
                          productId,
                        });
                        console.log('[C1保存] 成功: kb_id=', kbId);
                        alert('KBに保存しました。');
                      } catch (error) {
                        console.error('[C1保存] エラー:', error);
                        alert(`保存エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    KBに保存
                  </button>
                </>
              )}
            </div>
          </div>
          {generationError && (
            <div className="text-red-600 text-sm mt-2">エラー: {generationError}</div>
          )}
          {validationErrors && (
            <div className="text-red-600 text-sm mt-2">
              <div>検証エラー:</div>
              <ul className="list-disc list-inside">
                {validationErrors.errors.map((err, idx) => (
                  <li key={idx}>{err.path.join('.')}: {err.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {displayInsights.length === 0 ? (
        <div className="text-center text-gray-500 py-8">市場インサイトがありません</div>
      ) : (
        displayInsights.map((insight, idx) => {
          // 新形式（meta/payload構造）か旧形式かを判定
          const isNewFormat = 'meta' in insight && 'payload' in insight;
          
          if (isNewFormat) {
            // 新形式の表示（meta/payload構造）
            const insightData = insight as MarketInsightPayload;
            const { meta, payload } = insightData;
            
            return (
              <div
                key={idx}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">{payload.summary}</h3>
                    <div className="text-xs text-gray-500">
                      信頼度: {(meta.confidence * 100).toFixed(0)}% | 
                      生成日時: {new Date(meta.generatedAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                </div>

                {/* インサイト一覧 */}
                {payload.insights.length > 0 && (
                  <div className="space-y-4 mt-4">
                    {payload.insights.map((item, itemIdx) => (
                      <div key={itemIdx} className="border-l-4 border-blue-500 pl-4 py-3 bg-blue-50 rounded">
                        <div className="text-sm font-semibold text-blue-900 mb-2">{item.title}</div>
                        <div className="text-xs text-blue-700 mb-2">{item.hypothesis}</div>
                        
                        {/* 訴求軸 */}
                        {item.appeal_axes.length > 0 && (
                          <div className="text-xs text-gray-600 mb-1">
                            訴求軸: {item.appeal_axes.join(', ')}
                          </div>
                        )}
                        
                        {/* 構成の型 */}
                        {item.structure_type.length > 0 && (
                          <div className="text-xs text-gray-600 mb-2">
                            構成の型: {item.structure_type.join(', ')}
                          </div>
                        )}
                        
                        {/* 根拠 */}
                        {item.evidence.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-gray-600 mb-1">【根拠】</div>
                            <div className="space-y-1">
                              {item.evidence.map((ev, evIdx) => (
                                <div key={evIdx} className="text-xs text-gray-700 bg-white rounded p-2 border">
                                  <span className="font-medium">{ev.bbox_type}</span>
                                  {ev.text && <span className="ml-2">"{ev.text}"</span>}
                                  <span className="ml-2 text-gray-500">(面積: {(ev.areaRatio * 100).toFixed(1)}%)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          } else {
            // 旧形式（outputs/inputs構造）の表示
            const payload = insight as any;
            const hasOutputs = 'outputs' in payload;
            
            if (hasOutputs) {
              return (
                <div
                  key={idx}
                  className="border rounded-lg p-4 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold">{payload.summary || '市場インサイト'}</h3>
                    <span className="text-xs text-gray-500">
                      信頼度: {((payload.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* 訴求軸 */}
                  {payload.outputs?.appealAxes?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-medium text-gray-600 mb-2">【訴求軸】</div>
                      <div className="space-y-1">
                        {payload.outputs.appealAxes.map((axis: any, axisIdx: number) => (
                          <div key={axisIdx} className="text-sm">
                            <span className="font-medium">{axis.axis}</span>
                            <span className="text-gray-500 ml-2">重み: {((axis.weight || 0) * 100).toFixed(0)}%</span>
                            {axis.evidenceIds && axis.evidenceIds.length > 0 && (
                              <span className="text-xs text-gray-400 ml-2">
                                (根拠: {axis.evidenceIds.length}件)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 選ばれた理由 */}
                  {payload.outputs?.reasonsChosen?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-medium text-gray-600 mb-2">【選ばれた理由】</div>
                      <div className="space-y-2">
                        {payload.outputs.reasonsChosen.map((reason: any) => (
                          <div key={reason.id} className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="text-sm font-semibold text-blue-900 mb-1">{reason.label}</div>
                            <div className="text-xs text-blue-700">{reason.hypothesis}</div>
                            {reason.evidenceIds && reason.evidenceIds.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                根拠: {reason.evidenceIds.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 避けている表現 */}
                  {payload.outputs?.avoidedExpressions?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-medium text-gray-600 mb-2">【避けている表現】</div>
                      <div className="space-y-2">
                        {payload.outputs.avoidedExpressions.map((avoided: any) => (
                          <div key={avoided.id} className="bg-orange-50 border border-orange-200 rounded p-3">
                            <div className="text-sm font-semibold text-orange-900 mb-1">{avoided.label}</div>
                            <div className="text-xs text-orange-700">{avoided.hypothesis}</div>
                            {avoided.evidenceIds && avoided.evidenceIds.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                根拠: {avoided.evidenceIds.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 根拠 */}
                  {payload.evidence && payload.evidence.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-xs font-medium text-gray-600 mb-2">【根拠】</div>
                      <div className="space-y-1">
                        {payload.evidence.map((ev, evIdx) => (
                          <div key={evIdx} className="text-xs text-gray-600">
                            {ev.type === 'bbox' && ev.bboxId && (
                              <>BBox: {ev.bboxId} - {ev.reason || ''}</>
                            )}
                            {ev.type === 'ocr_text' && ev.text && (
                              <>OCRテキスト: {ev.text.substring(0, 50)}</>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            } else {
              // 旧形式の表示（既存ロジック）
              const oldInsight = insight as MarketInsight;
              const isHighlighted = oldInsight.supporting_banners.some((id) =>
                highlightedBannerIds.has(id)
              );

              return (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 transition-all cursor-pointer ${
                    isHighlighted
                      ? 'ring-2 ring-blue-500 shadow-lg'
                      : 'hover:shadow-md'
                  } ${getCategoryColor(oldInsight.category)}`}
                  onClick={() => onHighlightBanners(oldInsight.supporting_banners)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs font-medium px-2 py-1 bg-white rounded">
                      {getCategoryLabel(oldInsight.category)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        {oldInsight.supporting_banners.length}件のバナー
                      </span>
                      {onSaveInsight && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSaveInsight(oldInsight);
                          }}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          このインサイトを保存
                        </button>
                      )}
                    </div>
                  </div>

                  {/* どのペルソナに強く効いているか */}
                  {oldInsight.persona_relevance && oldInsight.persona_relevance.length > 0 && (
                    <div className="mb-4 p-3 bg-white rounded border">
                      <div className="text-xs font-medium text-gray-600 mb-2">
                        【どのペルソナに強く効いているか】
                      </div>
                      <div className="space-y-2">
                        {oldInsight.persona_relevance.map((pr, prIdx) => {
                          const relevanceSymbol = pr.relevance_level === 'high' ? '◎' : pr.relevance_level === 'medium' ? '◯' : pr.relevance_level === 'low' ? '△' : '？';
                          const relevanceColor = pr.relevance_level === 'high' ? 'text-green-600' : pr.relevance_level === 'medium' ? 'text-blue-600' : pr.relevance_level === 'low' ? 'text-yellow-600' : 'text-gray-400';
                          const persona = personas.find((p) => p.id === pr.persona_id);
                          
                          return (
                            <div
                              key={prIdx}
                              className={`flex items-start gap-2 p-2 rounded ${
                                onNavigateToPersona ? 'cursor-pointer hover:bg-gray-50' : ''
                              }`}
                              onClick={() => onNavigateToPersona?.(pr.persona_id)}
                            >
                              <span className={`text-sm font-bold ${relevanceColor}`}>{relevanceSymbol}</span>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-800">
                                  {persona ? persona.name : `ペルソナID: ${pr.persona_id}`}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">{pr.reasoning}</div>
                                {onNavigateToPersona && (
                                  <div className="text-xs text-blue-600 mt-1 italic">
                                    クリックでペルソナ詳細を表示
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 1. 想定されているペルソナ前提（人の不安・制約） */}
                  <div className="mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      【1. 想定されているペルソナ前提（人の不安・制約）】
                    </div>
                    <div className="text-sm text-gray-800 mb-1">{oldInsight.persona_assumption.assumption}</div>
                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      根拠: {oldInsight.persona_assumption.evidence}
                    </div>
                  </div>

                  {/* 2. 観測された競合の選択（事実 + 根拠） */}
                  <div className="mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      【2. 観測された競合の選択（事実 + 根拠）】
                    </div>
                    <div className="text-sm text-gray-800 mb-1">
                      <span className="font-medium">{oldInsight.competitor_choice.choice}</span>
                    </div>
                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      根拠: {oldInsight.competitor_choice.evidence}
                    </div>
                    {oldInsight.competitor_choice.bbox_references &&
                      oldInsight.competitor_choice.bbox_references.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          BBox参照: {oldInsight.competitor_choice.bbox_references.length}件
                        </div>
                      )}
                  </div>

                  {/* 3. なぜその選択が合理的か（仮説） */}
                  <div className="mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      【3. なぜその選択が合理的か（仮説）】
                    </div>
                    <div className="text-sm text-gray-800">{oldInsight.rationality_hypothesis}</div>
                  </div>

                  {/* 4. 当たり前になっている可能性（外すとリスク） */}
                  <div className="mb-4">
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      【4. 当たり前になっている可能性（外すとリスク）】
                    </div>
                    <div className="text-sm font-medium text-orange-700">{oldInsight.taken_for_granted_risk}</div>
                  </div>

                  {/* バナー/LP企画に使うための問い（Planning Hooks） */}
                  {oldInsight.planning_hooks && oldInsight.planning_hooks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="text-xs font-medium text-gray-600 mb-2">
                        【バナー/LP企画に使うための問い】
                      </div>
                      <div className="space-y-2">
                        {oldInsight.planning_hooks.map((hook, hookIdx) => (
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
                </div>
              );
            }
          }
        })
      )}
    </div>
  );
}
