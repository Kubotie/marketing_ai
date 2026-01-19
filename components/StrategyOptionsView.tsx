'use client';

import { useState, useEffect } from 'react';
import { StrategyOption, Persona, Extraction } from '@/types/schema';
import type { StrategyOptionPayload, MarketInsightPayload } from '@/kb/common';
import { listKbItems, saveKbItem } from '@/kb/common-api';
import { InsightPayloadBaseSchema } from '@/kb/common-schemas';
import { collectInsightInputs } from '@/lib/insight-input-collector';
import { z } from 'zod';

interface StrategyOptionsViewProps {
  options: StrategyOption[];
  personas?: Persona[];
  onSelectOption?: (option: StrategyOption) => void;
  onSaveOption?: (option: StrategyOption, relatedInsightIds: string[]) => void; // 「このオプションを保存」コールバック
  relatedInsightIds?: string[]; // 関連するインサイトID
  // AI生成用の追加プロップ
  imageId?: string;
  productId?: string;
  extraction?: Extraction | null;
  imageWidth?: number;
  imageHeight?: number;
  activeProduct?: { productId: string; name: string; category?: string; description?: string; competitors?: Array<{ name: string }> } | null;
  notes?: string;
  c1Insight?: MarketInsightPayload; // C1の結果
  onOptionsUpdate?: (options: StrategyOptionPayload[]) => void;
  initialAiOptions?: StrategyOptionPayload[]; // 履歴から復元されたAI生成結果
}

export default function StrategyOptionsView({
  options,
  personas = [],
  onSelectOption,
  onSaveOption,
  relatedInsightIds = [],
  imageId,
  productId,
  extraction,
  imageWidth = 800,
  imageHeight = 600,
  activeProduct,
  notes,
  c1Insight,
  onOptionsUpdate,
  initialAiOptions = [],
}: StrategyOptionsViewProps) {
  const [aiOptions, setAiOptions] = useState<StrategyOptionPayload[]>(initialAiOptions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<z.ZodError | null>(null);

  // 親コンポーネントから渡されたAI生成結果を反映（履歴復元用）
  useEffect(() => {
    if (initialAiOptions.length > 0 && aiOptions.length === 0) {
      setAiOptions(initialAiOptions);
      console.log('[C2復元] 履歴から復元:', initialAiOptions);
    }
  }, [initialAiOptions, aiOptions.length]);

  // KBから復元（初回読み込み時、imageIdがあれば復元）
  useEffect(() => {
    if (!imageId) return;

    const restoreFromKB = async () => {
      try {
        // imageIdで検索（productIdはオプショナル）
        const existing = listKbItems({ kind: 'strategy_option', imageId, productId });
        if (existing.length > 0) {
          const latest = existing.sort((a, b) => 
            new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime()
          )[0];
          
          const payload = latest.payload as StrategyOptionPayload;
          // 新しい形式（meta/payload構造）に対応
          if ((payload as any).meta && (payload as any).payload) {
            const validated = InsightPayloadBaseSchema.safeParse(payload);
            
            // 修正後（コピー用）
if (validated.success) {
  setAiOptions([validated.data as any]);
  if (onOptionsUpdate) {
    onOptionsUpdate([validated.data as any]);
  }
              console.log('[C2復元] KBから復元完了:', validated.data);
            } else {
              console.warn('[C2復元] Zod検証エラー:', validated.error);
              setValidationErrors(validated.error);
            }
          } else {
            // 旧形式の場合はスキップ（AI生成を促す）
            console.warn('[C2復元] 旧形式のデータはスキップします');
          }
        } else {
          console.log('[C2復元] KBにデータが見つかりませんでした');
        }
      } catch (error) {
        console.error('[C2復元] エラー:', error);
      }
    };

    restoreFromKB();
  }, [imageId, productId, onOptionsUpdate]);

  // AI生成
  const handleGenerate = async (regenerate: boolean = false) => {
    if (!imageId || !extraction) {
      alert('画像ID、Extractionが必要です。');
      return;
    }

    if (!c1Insight) {
      alert('C1（市場インサイト）を先に生成してください。');
      return;
    }

    if (regenerate && !confirm('既存の戦略オプションを再生成しますか？')) {
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
        activeProduct ? {
          productId: activeProduct.productId,
          name: activeProduct.name,
          category: activeProduct.category,
          description: activeProduct.description,
          competitors: activeProduct.competitors,
        } : null,
        notes
      );

      // AI生成API呼び出し（C1の結果 + patternScoresを含める）
      const res = await fetch('/api/banner/generate-strategy-option', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          inputs: {
            ...inputs,
            patternScores: inputs.patternScores || [],
          },
          c1Insight 
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`生成APIエラー: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      const option = data.option as StrategyOptionPayload;

      // Zod検証（新しい形式：meta/payload構造）
      const validated = InsightPayloadBaseSchema.safeParse(option);
      if (!validated.success) {
        console.error('[C2生成] Zod検証エラー:', validated.error);
        setValidationErrors(validated.error);
        throw new Error('生成結果の検証に失敗しました');
      }

      setAiOptions([validated.data]);
      if (onOptionsUpdate) {
        onOptionsUpdate([validated.data]);
        console.log('[C2生成] onOptionsUpdate呼び出し:', validated.data);
      } else {
        console.warn('[C2生成] onOptionsUpdateが未定義');
      }

      // 自動保存
      try {
        await saveKbItem('strategy_option', validated.data, {
          title: `戦略オプション_${new Date().toLocaleDateString('ja-JP')}`,
          imageId,
          productId,
          relatedKbIds: c1Insight ? [] : [], // C1のIDを関連付け（後で実装）
        });
        console.log('[C2生成] KBに保存完了');
      } catch (saveError) {
        console.error('[C2生成] KB保存エラー:', saveError);
        alert('生成は成功しましたが、保存に失敗しました。');
      }
    } catch (error) {
      console.error('[C2生成] エラー:', error);
      setGenerationError(error instanceof Error ? error.message : String(error));
      alert(`生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 表示用のoptions（AI生成があれば優先、なければ旧options）
  const displayOptions = aiOptions.length > 0 ? aiOptions : options;
  const getOptionColor = (optionType: StrategyOption['option_type']) => {
    switch (optionType) {
      case 'A':
        return 'border-blue-500 bg-blue-50';
      case 'B':
        return 'border-green-500 bg-green-50';
      case 'C':
        return 'border-orange-500 bg-orange-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* AI生成ボタン */}
      {imageId && extraction && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">AI生成</h3>
            <div className="flex gap-2">
              {aiOptions.length === 0 ? (
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating || !c1Insight}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  title={!c1Insight ? 'C1（市場インサイト）を先に生成してください' : ''}
                >
                  {isGenerating ? '生成中...' : 'AIで生成'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating || !c1Insight}
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
                  >
                    {isGenerating ? '再生成中...' : '再生成'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        if (!aiOptions[0]) {
                          alert('保存するオプションがありません。');
                          return;
                        }
                        console.log('[C2保存] 開始:', aiOptions[0]);
                        const kbId = await saveKbItem('strategy_option', aiOptions[0], {
                          title: `戦略オプション_${(aiOptions[0] as any).meta?.kb_type || 'X'}_${new Date().toLocaleDateString('ja-JP')}`,
                          imageId,
                          productId,
                        });
                        console.log('[C2保存] 成功: kb_id=', kbId);
                        alert('KBに保存しました。');
                      } catch (error) {
                        console.error('[C2保存] エラー:', error);
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
          {!c1Insight && (
            <div className="text-yellow-600 text-sm mt-2">⚠️ C1（市場インサイト）を先に生成してください</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">戦略オプション (C2)</h2>
      </div>
      {displayOptions.length === 0 ? (
        <div className="text-center text-gray-500 py-8">戦略オプションがありません</div>
      ) : (
        displayOptions.map((option, idx) => {
          // 新形式（meta/payload構造）か旧形式かを判定
          const isNewFormat = 'meta' in option && 'payload' in option;
          
          if (isNewFormat) {
            // 新形式の表示（meta/payload構造）
            const optionData = option as StrategyOptionPayload;
            const { meta, payload } = optionData;
            return (
              <div key={idx} className="border-2 rounded-lg p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
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
            const payload = option as any;
            const hasOutputs = 'outputs' in payload;
            
            if (hasOutputs) {
              return (
                <div key={idx} className="border-2 rounded-lg p-6 bg-white">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold">Option {payload.optionType || 'X'}</div>
                      <div className="text-lg font-semibold">{payload.summary || '戦略オプション'}</div>
                    </div>
                    <span className="text-xs text-gray-500">
                      信頼度: {((payload.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* 選ばれた理由 */}
                  {payload.outputs?.reasonsChosen?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-medium text-gray-600 mb-2">【選ばれた理由】</div>
                      <div className="space-y-2">
                        {payload.outputs.reasonsChosen.map((reason) => (
                          <div key={reason.id} className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="text-sm font-semibold text-blue-900 mb-1">{reason.label}</div>
                            <div className="text-xs text-blue-700">{reason.hypothesis}</div>
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
                        {payload.outputs.avoidedExpressions.map((avoided) => (
                          <div key={avoided.id} className="bg-orange-50 border border-orange-200 rounded p-3">
                            <div className="text-sm font-semibold text-orange-900 mb-1">{avoided.label}</div>
                            <div className="text-xs text-orange-700">{avoided.hypothesis}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            } else {
              // 旧形式の表示（既存ロジック）
              const oldOption = option as StrategyOption;
              return (
                <div
                  key={idx}
                  className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                    onSelectOption ? 'hover:shadow-lg' : ''
                  } ${getOptionColor(oldOption.option_type)}`}
                  onClick={() => onSelectOption?.(oldOption)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold">Option {oldOption.option_type}</div>
                      <div className="text-lg font-semibold">{oldOption.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {onSaveOption && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSaveOption(oldOption, relatedInsightIds);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          このオプションを保存
                        </button>
                      )}
                      {onSelectOption && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOption(oldOption);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                          このオプションを選択
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 合理性/リスク評価 */}
                  {(oldOption.rationality_assessment || oldOption.risk_assessment) && (
                    <div className="mb-4 grid grid-cols-2 gap-4">
                      {oldOption.rationality_assessment && (
                        <div className="p-3 bg-white rounded border">
                          <div className="text-xs font-medium text-gray-600 mb-1">合理性</div>
                          <div className={`text-sm font-bold mb-1 ${
                            oldOption.rationality_assessment.level === 'high' ? 'text-green-600' :
                            oldOption.rationality_assessment.level === 'medium' ? 'text-yellow-600' :
                            oldOption.rationality_assessment.level === 'low' ? 'text-red-600' :
                            'text-gray-400'
                          }`}>
                            {oldOption.rationality_assessment.level === 'high' ? '高' :
                             oldOption.rationality_assessment.level === 'medium' ? '中' :
                             oldOption.rationality_assessment.level === 'low' ? '低' :
                             '判断不可'}
                          </div>
                          <div className="text-xs text-gray-600">{oldOption.rationality_assessment.reasoning}</div>
                        </div>
                      )}
                      {oldOption.risk_assessment && (
                        <div className="p-3 bg-white rounded border">
                          <div className="text-xs font-medium text-gray-600 mb-1">リスク</div>
                          <div className={`text-sm font-bold mb-1 ${
                            oldOption.risk_assessment.level === 'high' ? 'text-red-600' :
                            oldOption.risk_assessment.level === 'medium' ? 'text-yellow-600' :
                            oldOption.risk_assessment.level === 'low' ? 'text-green-600' :
                            'text-gray-400'
                          }`}>
                            {oldOption.risk_assessment.level === 'high' ? '高' :
                             oldOption.risk_assessment.level === 'medium' ? '中' :
                             oldOption.risk_assessment.level === 'low' ? '低' :
                             '判断不可'}
                          </div>
                          <div className="text-xs text-gray-600">{oldOption.risk_assessment.reasoning}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 参考にしている競合要素 */}
                  {(oldOption.referenced_elements.components && oldOption.referenced_elements.components.length > 0) ||
                  (oldOption.referenced_elements.appeal_axes && oldOption.referenced_elements.appeal_axes.length > 0) ? (
                    <div className="mb-4 p-3 bg-white rounded border">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        参考にしている競合要素
                      </div>
                      {oldOption.referenced_elements.components && oldOption.referenced_elements.components.length > 0 && (
                        <div className="text-sm text-gray-600 mb-1">
                          要素: {oldOption.referenced_elements.components.join(', ')}
                        </div>
                      )}
                      {oldOption.referenced_elements.appeal_axes && oldOption.referenced_elements.appeal_axes.length > 0 && (
                        <div className="text-sm text-gray-600">
                          訴求軸: {oldOption.referenced_elements.appeal_axes.join(', ')}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* あえて使わない要素 */}
                  {(oldOption.avoided_elements.components && oldOption.avoided_elements.components.length > 0) ||
                  (oldOption.avoided_elements.appeal_axes && oldOption.avoided_elements.appeal_axes.length > 0) ? (
                    <div className="mb-4 p-3 bg-white rounded border">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        あえて使わない要素
                      </div>
                      {oldOption.avoided_elements.components && oldOption.avoided_elements.components.length > 0 && (
                        <div className="text-sm text-gray-600 mb-1">
                          要素: {oldOption.avoided_elements.components.join(', ')}
                        </div>
                      )}
                      {oldOption.avoided_elements.appeal_axes && oldOption.avoided_elements.appeal_axes.length > 0 && (
                        <div className="text-sm text-gray-600">
                          訴求軸: {oldOption.avoided_elements.appeal_axes.join(', ')}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* 想定されるメリット */}
                  {oldOption.potential_benefits.length > 0 && (
                    <div className="mb-4 p-3 bg-white rounded border border-green-300">
                      <div className="text-sm font-medium text-green-700 mb-2">
                        想定されるメリット（仮説）
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        {oldOption.potential_benefits.map((benefit, i) => (
                          <li key={i} className="text-sm text-gray-700">
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 想定されるリスク */}
                  {oldOption.potential_risks.length > 0 && (
                    <div className="mb-4 p-3 bg-white rounded border border-red-300">
                      <div className="text-sm font-medium text-red-700 mb-2">
                        想定されるリスク（仮説）
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        {oldOption.potential_risks.map((risk, i) => (
                          <li key={i} className="text-sm text-gray-700">
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ペルソナ別のリスク感とOverlay（分岐表示） */}
                  {oldOption.persona_risk_assessment && oldOption.persona_risk_assessment.length > 0 && (
                    <div className="p-3 bg-white rounded border">
                      <div className="text-sm font-medium text-gray-700 mb-3">ペルソナ別のリスク感とOverlay</div>
                      <div className="space-y-3">
                        {oldOption.persona_risk_assessment.map((assessment, idx) => {
                          const persona = personas.find((p) => p.id === assessment.persona_id);
                          const riskColor =
                            assessment.risk_level === 'low'
                              ? 'border-green-300 bg-green-50'
                              : assessment.risk_level === 'medium'
                              ? 'border-yellow-300 bg-yellow-50'
                              : 'border-red-300 bg-red-50';
                          const riskLabel =
                            assessment.risk_level === 'low'
                              ? '低リスク'
                              : assessment.risk_level === 'medium'
                              ? '中リスク'
                              : '高リスク';

                          // Persona Overlayの表示（◎◯△？）
                          const getOverlaySymbol = (overlay: 'high' | 'medium' | 'low' | 'unknown') => {
                            switch (overlay) {
                              case 'high':
                                return '◎';
                              case 'medium':
                                return '◯';
                              case 'low':
                                return '△';
                              default:
                                return '？';
                            }
                          };

                          const getOverlayColor = (overlay: 'high' | 'medium' | 'low' | 'unknown') => {
                            switch (overlay) {
                              case 'high':
                                return 'text-green-600';
                              case 'medium':
                                return 'text-blue-600';
                              case 'low':
                                return 'text-yellow-600';
                              default:
                                return 'text-gray-400';
                            }
                          };

                          const overlaySymbol = assessment.persona_overlay
                            ? getOverlaySymbol(assessment.persona_overlay)
                            : '？';
                          const overlayColor = assessment.persona_overlay
                            ? getOverlayColor(assessment.persona_overlay)
                            : 'text-gray-400';

                          return (
                            <div key={idx} className={`p-3 rounded border ${riskColor}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-lg font-bold ${overlayColor}`}>
                                  {overlaySymbol}
                                </span>
                                <span className={`text-sm font-bold ${riskColor.includes('green') ? 'text-green-700' : riskColor.includes('yellow') ? 'text-yellow-700' : 'text-red-700'}`}>
                                  {riskLabel}
                                </span>
                                <span className="text-sm font-medium text-gray-800">
                                  {persona ? persona.name : `ペルソナID: ${assessment.persona_id}`}
                                </span>
                              </div>
                              <div className="text-xs text-gray-700">{assessment.reasoning}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          }
        })
      )}
    </div>
  );
}
