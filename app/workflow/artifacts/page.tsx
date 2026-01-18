'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { KBItem, WorkflowRunPayload } from '@/kb/types';
import { normalizeRunPayload, NormalizedWorkflowRunPayload } from '@/kb/workflow-run-normalizer';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { listWorkflowRuns } from '@/lib/workflow-run-repo';
import { getAgentDefinitionCached } from '@/lib/agent-definition-cache';
import { evaluateRunForPlanning } from '@/lib/workflow-run-evaluator';
import UnifiedLayout from '@/components/UnifiedLayout';
import WorkflowOutputDetailDrawer from '@/components/workflow/WorkflowOutputDetailDrawer';

/**
 * 成果物一覧ページ
 * すべてのワークフローの成果物（workflow_run）を一覧表示
 */
export default function ArtifactsPage() {
  const { openRunDrawer, selectedRunId, isRunDrawerOpen, closeRunDrawer } = useWorkflowStore();
  const [runs, setRuns] = useState<Array<{
    item: KBItem;
    payload: NormalizedWorkflowRunPayload;
    hasOutput: boolean;
    agentDefinition?: any;
    planningEval?: ReturnType<typeof evaluateRunForPlanning>;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'outputs-only'>('outputs-only'); // デフォルトは成果物のみ
  const loadingRef = useRef(false);

  // データ読み込み（すべてのワークフローの成果物を取得）
  const loadRuns = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      // すべてのワークフローの成果物を取得（workflowIdを指定しない）
      const runsWithMetadata = await listWorkflowRuns({
        includeAllStatuses: true,
        includeAllWorkflows: true, // すべてのワークフローの成果物を含める
      }as any);

      // 各runに対してAgentDefinitionを取得し、hasOutputを判定
      const runsWithMetadataAndEval = await Promise.all(
        runsWithMetadata.map(async ({ item, payload }) => {
          const hasOutput = !!(payload.finalOutput || payload.parsedOutput);
          
          // AgentDefinitionを取得
          const agentDefinition = payload.agentDefinitionId || payload.agentId
            ? await getAgentDefinitionCached(payload.agentDefinitionId || payload.agentId || '')
            : null;

          // 企画評価を取得（信頼度バッジ用）
          const planningEval = agentDefinition
            ? evaluateRunForPlanning(payload, agentDefinition)
            : undefined;

          return {
            item,
            payload,
            hasOutput,
            agentDefinition,
            planningEval,
          };
        })
      );

      setRuns(runsWithMetadataAndEval);
    } catch (error) {
      console.error('[ArtifactsPage] Failed to load runs:', error);
      setRuns([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // フィルタリングとソート
  const filteredAndSortedRuns = runs
    .filter((run) => {
      if (filterMode === 'outputs-only') {
        return run.hasOutput; // 成果物Runのみ
      }
      return true; // 「すべて」の場合は全表示
    })
    .sort((a, b) => {
      // まず成果物Run（A）と履歴Run（B）で分ける
      if (a.hasOutput !== b.hasOutput) {
        return a.hasOutput ? -1 : 1; // 成果物Run（true）を先に
      }
      // 同じカテゴリ内ではexecutedAt desc
      const aTime = new Date(a.payload.executedAt || a.payload.startedAt).getTime();
      const bTime = new Date(b.payload.executedAt || b.payload.startedAt).getTime();
      return bTime - aTime;
    });

  // 成果物Run（A）と履歴Run（B）を分離（表示用）
  const outputRuns = filteredAndSortedRuns.filter((r) => r.hasOutput);
  const historyRuns = filteredAndSortedRuns.filter((r) => !r.hasOutput);

  // pathに基づいてデータを取得（ヘルパー関数）
  const getDataByPath = (obj: any, path: string | undefined): any => {
    if (!path) return obj;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }
    return current;
  };

  // テンプレート展開
  const expandTemplate = (template: string, data: any): string => {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = getDataByPath(data, path.trim());
      return value !== null && value !== undefined ? String(value) : '';
    });
  };

  // 成果物タイトルを取得（contractベース）
  const getArtifactTypeLabel = (run: typeof runs[0]): string => {
    const outputType = run.payload.outputKind || (run.payload.finalOutput || run.payload.output)?.type;
    if (outputType === 'lp_structure') {
      return 'LP構成案';
    } else if (outputType === 'banner_structure') {
      const derivedFrom = (run.payload.finalOutput || run.payload.output)?.derivedFrom;
      if (derivedFrom?.lpRunId) {
        return 'LP→バナー派生案';
      }
      return 'バナー構成案';
    }
    return '成果物';
  };

  // サブ情報を取得（contract.summary.subtitleTemplateから）
  const getSubtitle = (run: typeof runs[0]): string => {
    const contract = run.agentDefinition?.outputViewContract;
    const output = run.payload.finalOutput || run.payload.output;
    
    if (contract?.summary?.subtitleTemplate && output) {
      // テンプレート展開
      return expandTemplate(contract.summary.subtitleTemplate, output);
    }

    // フォールバック: 実行日時
    return new Date(run.payload.executedAt || run.payload.startedAt).toLocaleString('ja-JP');
  };

  // カードをレンダリング
  const renderRunCard = (run: typeof runs[0], isOutput: boolean) => {
    const artifactType = getArtifactTypeLabel(run);
    const subtitle = getSubtitle(run);
    const planningEval = run.planningEval;
    const executedAt = new Date(run.payload.executedAt || run.payload.startedAt).toLocaleString('ja-JP');

    return (
      <div
        key={run.item.kb_id}
        onClick={() => openRunDrawer(run.item.kb_id)}
        className={`p-3 border rounded cursor-pointer transition-all ${
          isOutput
            ? 'border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 shadow-sm'
            : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 opacity-75'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            {/* 成果物名 / 信頼度バッジ */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isOutput && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs font-semibold rounded">
                  {artifactType}
                </span>
              )}
              {planningEval && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                  planningEval.badgeTone === 'green' ? 'bg-green-100 text-green-800' :
                  planningEval.badgeTone === 'orange' ? 'bg-orange-100 text-orange-800' :
                  planningEval.badgeTone === 'red' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {planningEval.trustLabel}
                </span>
              )}
              {run.payload.status === 'success' && (
                <CheckCircle className={`w-4 h-4 ${isOutput ? 'text-green-600' : 'text-gray-400'}`} />
              )}
              {run.payload.status === 'error' && (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              {run.payload.status !== 'success' && run.payload.status !== 'error' && (
                <Clock className={`w-4 h-4 ${isOutput ? 'text-orange-600' : 'text-gray-400'}`} />
              )}
            </div>
            
            {/* サブ情報 */}
            {isOutput && subtitle && (
              <div className="text-xs text-gray-600 mb-1">{subtitle}</div>
            )}
            
            {/* 実行日時 */}
            <div className={`text-xs ${isOutput ? 'text-gray-700' : 'text-gray-500'}`}>
              {executedAt}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <UnifiedLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-4">成果物一覧</h1>
            
            {/* フィルター */}
            <div className="flex items-center gap-2 bg-gray-100 rounded p-1">
              <button
                onClick={() => setFilterMode('outputs-only')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  filterMode === 'outputs-only'
                    ? 'bg-white text-gray-900 font-semibold shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                成果物のみ
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  filterMode === 'all'
                    ? 'bg-white text-gray-900 font-semibold shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                すべて
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">読み込み中...</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-gray-500">
              まだ成果物が生成されていません
            </div>
          ) : filterMode === 'outputs-only' && outputRuns.length === 0 ? (
            <div className="text-sm text-yellow-700">
              成果物のみ表示中：該当なし。「すべて」に切り替えると履歴が見られます
            </div>
          ) : (
            <div className="space-y-3">
              {/* 成果物Run（A）：強調表示 */}
              {outputRuns.length > 0 && (
                <div className="space-y-2">
                  {filterMode === 'all' && (
                    <div className="text-xs font-semibold text-indigo-700 mb-2">
                      成果物 ({outputRuns.length}件)
                    </div>
                  )}
                  {outputRuns.map((run) => renderRunCard(run, true))}
                </div>
              )}

              {/* 履歴Run（B）：控えめ表示 */}
              {historyRuns.length > 0 && filterMode === 'all' && (
                <div className="space-y-2 mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-500 mb-2">
                    実行履歴 ({historyRuns.length}件)
                  </div>
                  {historyRuns.map((run) => renderRunCard(run, false))}
                </div>
              )}

              {/* 空状態：runはあるが成果物(A)が0件 */}
              {filterMode === 'all' && outputRuns.length === 0 && historyRuns.length > 0 && (
                <div className="text-sm text-gray-600 mt-4">
                  成果物はまだありません（実行履歴はあります）
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 詳細Drawer */}
      <WorkflowOutputDetailDrawer />
    </UnifiedLayout>
  );
}
