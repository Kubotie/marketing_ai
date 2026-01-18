'use client';

import { useState, useEffect } from 'react';
import { PlanningHook, Extraction } from '@/types/schema';
import { Save } from 'lucide-react';
import type { PlanningHookPayload, StrategyOptionPayload } from '@/kb/common';
import { listKbItems, saveKbItem } from '@/kb/common-api';
import { InsightPayloadBaseSchema, PlanningHookPayloadSchema } from '@/kb/common-schemas';
import { collectInsightInputs } from '@/lib/insight-input-collector';
import { z } from 'zod';

interface PlanningHooksViewProps {
  hooks: PlanningHook[];
  onSaveHook?: (hook: PlanningHook) => void;
  // AI生成用の追加プロップ
  imageId?: string;
  productId?: string;
  extraction?: Extraction | null;
  imageWidth?: number;
  imageHeight?: number;
  activeProduct?: { productId: string; name: string; category?: string; description?: string; competitors?: Array<{ name: string }> } | null;
  notes?: string;
  c2Option?: StrategyOptionPayload; // C2の結果
  onHooksUpdate?: (hooks: PlanningHookPayload[]) => void;
  initialAiHooks?: PlanningHookPayload[]; // 履歴から復元されたAI生成結果
}

export default function PlanningHooksView({
  hooks,
  onSaveHook,
  imageId,
  productId,
  extraction,
  imageWidth = 800,
  imageHeight = 600,
  activeProduct,
  notes,
  c2Option,
  onHooksUpdate,
  initialAiHooks = [],
}: PlanningHooksViewProps) {
  const [aiHooks, setAiHooks] = useState<PlanningHookPayload[]>(initialAiHooks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<z.ZodError | null>(null);

  // 親コンポーネントから渡されたAI生成結果を反映（履歴復元用）
  useEffect(() => {
    if (initialAiHooks.length > 0 && aiHooks.length === 0) {
      setAiHooks(initialAiHooks);
      console.log('[D復元] 履歴から復元:', initialAiHooks);
    }
  }, [initialAiHooks, aiHooks.length]);

  // KBから復元（初回読み込み時、imageIdがあれば復元）
  useEffect(() => {
    if (!imageId) return;

    const restoreFromKB = async () => {
      try {
        // imageIdで検索（productIdはオプショナル）
        const existing = listKbItems({ kind: 'planning_hook', imageId, productId });
        if (existing.length > 0) {
          const latest = existing.sort((a, b) => 
            new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime()
          )[0];
          
          const payload = latest.payload as PlanningHookPayload;
          // 新しい形式（meta/payload構造）に対応
          if ((payload as any).meta && (payload as any).payload) {
            const validated = InsightPayloadBaseSchema.safeParse(payload);
            
            if (validated.success) {
              setAiHooks([validated.data as any]);
              if (onHooksUpdate) {
                onHooksUpdate([validated.data as any]);
              }
              console.log('[D復元] KBから復元完了:', validated.data);
            } else {
              console.warn('[D復元] Zod検証エラー:', validated.error);
              setValidationErrors(validated.error);
            }
          } else {
            // 旧形式の場合はスキップ（AI生成を促す）
            console.warn('[D復元] 旧形式のデータはスキップします');
          }
        } else {
          console.log('[D復元] KBにデータが見つかりませんでした');
        }
      } catch (error) {
        console.error('[D復元] エラー:', error);
      }
    };

    restoreFromKB();
  }, [imageId, productId, onHooksUpdate]);

  // AI生成
  const handleGenerate = async (regenerate: boolean = false) => {
    if (!imageId || !extraction) {
      alert('画像ID、Extractionが必要です。');
      return;
    }

    if (!c2Option) {
      alert('C2（戦略オプション）を先に生成してください。');
      return;
    }

    if (regenerate && !confirm('既存の企画フックを再生成しますか？')) {
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

      // AI生成API呼び出し（C2の結果 + patternScoresを含める）
      const res = await fetch('/api/banner/generate-planning-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          inputs: {
            ...inputs,
            patternScores: inputs.patternScores || [],
          },
          c2Option 
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`生成APIエラー: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      const hook = data.hook as PlanningHookPayload;

      // Zod検証（新しい形式：meta/payload構造、hooksを含む）
      const validated = PlanningHookPayloadSchema.safeParse(hook);
      if (!validated.success) {
        console.error('[D生成] Zod検証エラー:', validated.error);
        setValidationErrors(validated.error);
        throw new Error('生成結果の検証に失敗しました');
      }

      setAiHooks([validated.data]);
      if (onHooksUpdate) {
        onHooksUpdate([validated.data]);
      }

      // 自動保存
      try {
        await saveKbItem('planning_hook', validated.data, {
          title: `企画フック_${new Date().toLocaleDateString('ja-JP')}`,
          imageId,
          productId,
          relatedKbIds: [], // C2のIDを関連付け（後で実装）
        });
        console.log('[D生成] KBに保存完了');
      } catch (saveError) {
        console.error('[D生成] KB保存エラー:', saveError);
        alert('生成は成功しましたが、保存に失敗しました。');
      }
    } catch (error) {
      console.error('[D生成] エラー:', error);
      setGenerationError(error instanceof Error ? error.message : String(error));
      alert(`生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 表示用のhooks（AI生成があれば優先、なければ旧hooks）
  const displayHooks = aiHooks.length > 0 ? aiHooks : hooks;
  const getOptionColor = (optionType: PlanningHook['strategy_option']) => {
    switch (optionType) {
      case 'A':
        return 'border-l-blue-500';
      case 'B':
        return 'border-l-green-500';
      case 'C':
        return 'border-l-orange-500';
      default:
        return 'border-l-gray-300';
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
              {aiHooks.length === 0 ? (
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating || !c2Option}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  title={!c2Option ? 'C2（戦略オプション）を先に生成してください' : ''}
                >
                  {isGenerating ? '生成中...' : 'AIで生成'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating || !c2Option}
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
                  >
                    {isGenerating ? '再生成中...' : '再生成'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        if (!aiHooks[0]) {
                          alert('保存する企画フックがありません。');
                          return;
                        }
                        console.log('[D保存] 開始:', aiHooks[0]);
                        const kbId = await saveKbItem('planning_hook', aiHooks[0], {
                          title: `企画フック_${new Date().toLocaleDateString('ja-JP')}`,
                          imageId,
                          productId,
                        });
                        console.log('[D保存] 成功: kb_id=', kbId);
                        alert('KBに保存しました。');
                      } catch (error) {
                        console.error('[D保存] エラー:', error);
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
          {!c2Option && (
            <div className="text-yellow-600 text-sm mt-2">⚠️ C2（戦略オプション）を先に生成してください</div>
          )}
        </div>
      )}

      {displayHooks.length === 0 ? (
        <div className="text-center text-gray-500 py-8">企画フックがありません</div>
      ) : (
        displayHooks.map((hook, idx) => {
          // 新形式（PlanningHookPayload）か旧形式（PlanningHook）かを判定
          const isNewFormat = 'meta' in hook && 'payload' in hook && 'hooks' in (hook as any).payload;
          
          if (isNewFormat) {
            // 新形式の表示（meta/payload構造）
            const payload = hook as PlanningHookPayload;
            return (
              <div key={idx} className="bg-white rounded-lg border p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <span className="text-lg font-semibold">{payload.payload.summary}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      信頼度: {(payload.meta.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* 企画フック */}
                {payload.payload.hooks && payload.payload.hooks.length > 0 && (
                  <div className="space-y-4">
                    {payload.payload.hooks.map((h, hookIdx) => (
                      <div
                        key={hookIdx}
                        className="border-l-4 pl-4 py-3 border-blue-500"
                      >
                        <div className="mb-2">
                          <div className="text-sm font-medium text-gray-600 mb-1">【企画に使える問い】</div>
                          <div className="text-base font-semibold text-gray-900">{h.question}</div>
                        </div>
                        {h.context && (
                          <div>
                            <div className="text-sm font-medium text-gray-600 mb-1">【背景・文脈】</div>
                            <div className="text-sm text-gray-700">{h.context}</div>
                          </div>
                        )}
                        {h.relatedPersonaIds && h.relatedPersonaIds.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            関連ペルソナ: {h.relatedPersonaIds.length}件
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* インサイト（企画案） */}
                {payload.payload.insights && payload.payload.insights.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-xs font-medium text-gray-600 mb-2">【企画案】</div>
                    <div className="space-y-2">
                      {payload.payload.insights.map((insight, insightIdx) => (
                        <div key={insightIdx} className="bg-blue-50 border border-blue-200 rounded p-3">
                          <div className="text-sm font-semibold text-blue-900 mb-1">{insight.title}</div>
                          <div className="text-xs text-blue-700">{insight.hypothesis}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          } else {
            // 旧形式の表示（既存ロジック）
            const oldHook = hook as PlanningHook;
            return (
              <div key={idx} className="bg-white rounded-lg border p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-lg font-semibold">Option {oldHook.strategy_option}</span>
                  {onSaveHook && (
                    <button
                      onClick={() => onSaveHook(oldHook)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      この企画フックを保存
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {oldHook.hooks.map((h, hookIdx) => (
                    <div
                      key={hookIdx}
                      className={`border-l-4 pl-4 py-3 ${getOptionColor(oldHook.strategy_option)}`}
                    >
                      {/* 問い（企画に使える：ペルソナ × 市場前提を起点） */}
                      <div className="mb-2">
                        <div className="text-sm font-medium text-gray-600 mb-1">【企画に使える問い】</div>
                        <div className="text-base font-semibold text-gray-900">{h.question}</div>
                      </div>

                      {/* 背景・文脈（ペルソナ × 市場前提） */}
                      {h.context && (
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-1">【背景・文脈】</div>
                          <div className="text-sm text-gray-700">{h.context}</div>
                        </div>
                      )}

                      {/* 関連するペルソナ */}
                      {h.related_persona_ids && h.related_persona_ids.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-gray-500 mb-1">関連するペルソナ</div>
                          <div className="text-xs text-gray-600">
                            {h.related_persona_ids.length}件のペルソナと関連
                          </div>
                        </div>
                      )}

                      {/* 関連する市場インサイト */}
                      {h.related_insights && h.related_insights.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-gray-500 mb-1">関連する市場インサイト</div>
                          <div className="text-xs text-gray-600">
                            {h.related_insights.length}件のインサイトと関連
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
        })
      )}
    </div>
  );
}
