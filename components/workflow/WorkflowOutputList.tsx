'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Workflow } from '@/types/workflow';
import { KBItem, WorkflowRunPayload, LpStructurePayload, BannerStructurePayload } from '@/kb/types';
import { normalizeRunPayload, NormalizedWorkflowRunPayload } from '@/kb/workflow-run-normalizer';
import { Pin, PinOff, Copy, Download, Eye, CheckCircle, XCircle, GitCompare, X, ChevronDown, ChevronUp } from 'lucide-react';
import WorkflowRunDetailView from './WorkflowRunDetailView';
import WorkflowRunCompareView from './WorkflowRunCompareView';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { listWorkflowRuns } from '@/lib/workflow-run-repo';
import { evaluateRunForOutputList, inferOutputKind, EvalResult, evaluateRunForPlanning } from '@/lib/workflow-run-evaluator';
import { getAgentDefinitionCached } from '@/lib/agent-definition-cache';
import { runOutputListEvaluationTests, logTestResults } from '@/lib/workflow-run-evaluator.test';

interface WorkflowOutputListProps {
  activeWorkflow: Workflow | null;
  isActive?: boolean; // Outputタブがアクティブかどうか
}

/**
 * ワークフロー成果物一覧（LP構成案・バナー構成案）
 */
export default function WorkflowOutputList({ activeWorkflow, isActive = false }: WorkflowOutputListProps) {
  const { addNode, openRunDrawer } = useWorkflowStore();
  const [brokenRunsCount, setBrokenRunsCount] = useState(0);
  const [outputs, setOutputs] = useState<Array<{
    id: string;
    title: string;
    type: 'lp_structure' | 'banner_structure';
    payload: LpStructurePayload | BannerStructurePayload;
    createdAt: string;
    pinned: boolean;
    runItem?: KBItem;
    runPayload?: WorkflowRunPayload;
    agentDefinition?: any; // AgentDefinition（contract取得用）
    evalResult?: EvalResult; // フェーズ3-2: 除外理由表示用
    excluded?: boolean; // フェーズ3-2: 除外フラグ
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [pinnedRunIds, setPinnedRunIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunIdsForCompare, setSelectedRunIdsForCompare] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false); // 5. UIの導線を明確化（フィルタ状態）
  const [showDebugPanel, setShowDebugPanel] = useState(false); // 1. デバッグパネル（開閉）
  const [debugLogEnabled, setDebugLogEnabled] = useState(false); // 4. デバッグログトグル
  const [showExclusionReasons, setShowExclusionReasons] = useState(false); // フェーズ3-2: 除外理由をdev-only UIトグルで表示
  const prevCountsRef = useRef<{ loaded: number; normalized: number; after: number }>({ loaded: 0, normalized: 0, after: 0 }); // 4. ログ抑制用
  const [debugRuns, setDebugRuns] = useState<Array<{
    kb_id: string;
    workflowId: string | null;
    agentNodeId: string | null;
    agentDefinitionId: string | null;
    agentId: string | null;
    status: string;
    executedAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    hasFinalOutput: boolean;
    hasParsedOutput: boolean;
    hasOutput: boolean;
    inferredOutputKind: string;
    excludedReason?: string;
    evalResult?: EvalResult;
  }>>([]);
  const [loadedRunsCount, setLoadedRunsCount] = useState(0);
  const [normalizedRunsCount, setNormalizedRunsCount] = useState(0);
  const [afterFilterCount, setAfterFilterCount] = useState(0);
  const loadingRef = useRef(false); // 無限ループを防ぐためのref
  const pinnedRunIdsRef = useRef<string[]>([]); // pinnedRunIdsの最新値を保持
  // フェーズ3-5: レンダ回数計測
  const renderCountRef = useRef(0);
  const prevPropsRef = useRef<{ workflowId?: string; isActive?: boolean }>({});
  
  // レンダ回数計測
  useEffect(() => {
    renderCountRef.current += 1;
    if (process.env.NODE_ENV === 'development') {
      const changedProps: string[] = [];
      if (prevPropsRef.current.workflowId !== activeWorkflow?.id) changedProps.push('workflowId');
      if (prevPropsRef.current.isActive !== isActive) changedProps.push('isActive');
      
      if (changedProps.length > 0 || renderCountRef.current % 10 === 0) {
        console.log(`[WorkflowOutputList] Render #${renderCountRef.current}`, {
          changedProps,
          workflowId: activeWorkflow?.id,
          isActive,
          outputsCount: outputs.length,
        });
      }
      
      prevPropsRef.current = { workflowId: activeWorkflow?.id, isActive };
    }
  });

  // loadOutputsをuseCallbackでメモ化（無限ループを防ぐ）
  const loadOutputs = useCallback(async () => {
    if (!activeWorkflow) return;
    
    // 既に読み込み中の場合はスキップ（refを使用して無限ループを防ぐ）
    if (loadingRef.current) {
      if (process.env.NODE_ENV === 'development' && debugLogEnabled) {
        console.log('[WorkflowOutputList] loadOutputs skipped (already loading)');
      }
      return;
    }
    
    loadingRef.current = true;
    setLoading(true);
    
    // フェーズ3-5: ログ出力を最適化（デバッグモード時のみ詳細ログ）
    if (process.env.NODE_ENV === 'development' && debugLogEnabled) {
      console.log('[WorkflowOutputList] loadOutputs started', { workflowId: activeWorkflow.id });
    }
    try {
      // 3. HistoryとOutputListのソースを統一（workflow-run-repo.ts使用）
      const runsWithMetadata = await listWorkflowRuns({
        workflowId: activeWorkflow.id,
        includeAllStatuses: showAllStatuses, // 5. UIの導線を明確化（フィルタ状態）
      });
      
      const loadedRunsCount = runsWithMetadata.length;
      setLoadedRunsCount(loadedRunsCount);
      
      // 4. ログ抑制：前回値と比較して変化時のみ出力
      if (debugLogEnabled || prevCountsRef.current.loaded !== loadedRunsCount) {
        console.log('[WorkflowOutputList] 1. 読み込み完了:', { loadedRunsCount });
      }
      
      // 現在のpinnedRunIdsを取得（refから最新の値を取得）
      const currentPinnedRunIds = pinnedRunIdsRef.current;
      
      // payloadなしアイテムをカウント（5. 壊れたrunの検出）
      const brokenRuns = runsWithMetadata.filter(({ item }) => {
        if (item.type !== 'workflow_run') return false;
        if (!item.payload || typeof item.payload !== 'object') return true;
        return false;
      });
      
      setBrokenRunsCount(brokenRuns.length);
      
      const normalizedRuns = runsWithMetadata.map(({ payload }) => payload);
      const normalizedRunsCount = normalizedRuns.length;
      setNormalizedRunsCount(normalizedRunsCount);
      
      // 4. ログ抑制：前回値と比較して変化時のみ出力
      if (debugLogEnabled || prevCountsRef.current.normalized !== normalizedRunsCount) {
        console.log('[WorkflowOutputList] 2. 正規化完了:', { normalizedRunsCount });
      }
      
      // 2. 理由付き判定でフィルタ（evaluateRunForOutputList使用）
      const debugRunsData: typeof debugRuns = [];
      const workflowRuns: Array<{
        id: string;
        title: string;
        payload: LpStructurePayload | BannerStructurePayload;
        createdAt: string;
        runItem?: KBItem;
        runPayload: NormalizedWorkflowRunPayload;
        type: 'lp_structure' | 'banner_structure';
        pinned: boolean;
      }> = [];
      
      for (const { item, payload: normalized } of runsWithMetadata) {
        // 4. AgentDefinitionの取得を1回に集約（キャッシュ使用）
        // 2. outputKind推定はfallback扱い：保存値を最優先、AgentDefinitionは取れたら使う
        const agentDefinition = normalized.agentDefinitionId || normalized.agentId
          ? await getAgentDefinitionCached(normalized.agentDefinitionId || normalized.agentId || '')
          : null;
        
        // outputKindを推定（保存値を最優先）
        const inferredOutputKind = await inferOutputKind(normalized, agentDefinition || undefined);
        
        // 判定実行
        const evalResult = await evaluateRunForOutputList(normalized, activeWorkflow, {
          showAllStatuses,
          agentDefinition: agentDefinition || undefined,
        });
        
        // デバッグデータに追加（先頭20件）
        if (debugRunsData.length < 20) {
          debugRunsData.push({
            kb_id: normalized.id,
            workflowId: normalized.workflowId || null,
            agentNodeId: normalized.nodeId || null,
            agentDefinitionId: normalized.agentDefinitionId || null,
            agentId: normalized.agentId || null,
            status: normalized.status || 'unknown',
            executedAt: normalized.executedAt || null,
            startedAt: normalized.startedAt || null,
            finishedAt: normalized.finishedAt || null,
            hasFinalOutput: !!normalized.finalOutput,
            hasParsedOutput: !!normalized.parsedOutput,
            hasOutput: !!normalized.output,
            inferredOutputKind,
            excludedReason: evalResult.include ? undefined : evalResult.reason,
            evalResult,
          });
        }
        
        // Step1: 成果物扱い条件を緩和 - finalOutput || parsedOutput || llmRawOutput のいずれかがあれば表示
        const hasFinalOutput = !!normalized.finalOutput;
        const hasParsedOutput = !!normalized.parsedOutput;
        const hasRawOutput = !!normalized.llmRawOutput;
        const hasAnyOutput = hasFinalOutput || hasParsedOutput || hasRawOutput;
        
        // 表示対象の場合のみ追加
        if (evalResult.include && hasAnyOutput) {
          // outputPayloadの優先順位: finalOutput > parsedOutput > llmRawOutput
          const outputPayload = normalized.finalOutput || normalized.parsedOutput || normalized.output;
          if (!outputPayload) continue;
          
          // Step1: 表示ラベルを決定
          let outputLabel = '';
          if (hasFinalOutput) {
            outputLabel = '成果物（確定）';
          } else if (hasParsedOutput) {
            outputLabel = '成果物（構造化）';
          } else if (hasRawOutput) {
            outputLabel = '成果物（下書き）';
          }
          
          // outputKindがlp_structureまたはbanner_structureの場合のみ
          if (inferredOutputKind === 'lp_structure' || inferredOutputKind === 'banner_structure') {
            workflowRuns.push({
              id: normalized.id,
              title: (normalized as any).title,
              payload: (normalized as any).payload as any,
              createdAt: (normalized as any).createdAt,
              runItem: item,
              runPayload: normalized,
              type: inferredOutputKind as 'lp_structure' | 'banner_structure',
              pinned: currentPinnedRunIds.includes(normalized.id),
              agentDefinition,
              evalResult,
            } as any);
          }
        } else {
          // フェーズ3-2: 除外されたrunもデバッグ用に保持（showExclusionReasonsがtrueの場合のみ表示）
          if (showExclusionReasons) {
            const outputPayload = normalized.finalOutput || normalized.parsedOutput || normalized.output;
            if (outputPayload) {
              workflowRuns.push({
                id: normalized.id,
                title: `${item.title || `Run ${normalized.id}`} (除外: ${evalResult.reason || 'unknown'})`,
                payload: outputPayload as LpStructurePayload | BannerStructurePayload,
                createdAt: normalized.executedAt || normalized.finishedAt || normalized.startedAt || new Date().toISOString(),
                runItem: item,
                runPayload: normalized,
                type: (inferredOutputKind || 'unknown') as 'lp_structure' | 'banner_structure',
                pinned: false,
                agentDefinition,
                evalResult,
                excluded: true, // 除外フラグ
              } as any);
            }
          }
        }
      }
      
      // ソート
      workflowRuns.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      const afterFilterCount = workflowRuns.length;
      setAfterFilterCount(afterFilterCount);
      setDebugRuns(debugRunsData);
      
      // 前回値と比較して更新
      prevCountsRef.current = { loaded: loadedRunsCount, normalized: normalizedRunsCount, after: afterFilterCount };
      
      // 1. afterFilterCount=0 のときは必ずデバッグパネルを自動オープン
      if (afterFilterCount === 0 && loadedRunsCount > 0) {
        setShowDebugPanel(true);
      }
      
      // 4. ログ抑制：前回値と比較して変化時のみ出力、またはデバッグトグルON時
      if (debugLogEnabled || prevCountsRef.current.after !== afterFilterCount) {
        console.log('[WorkflowOutputList] 3. 最終フィルタ後:', {
          afterFilterCount,
          outputTypes: workflowRuns.map((r) => r.type),
          debugRunsCount: debugRunsData.length,
        });
      }
      
      setOutputs(workflowRuns);
    } catch (error) {
      console.error('Failed to load outputs:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [activeWorkflow?.id, showAllStatuses, debugLogEnabled]); // フェーズ3-5: 依存配列を最適化
  
  // pinnedRunIdsの更新をrefにも反映
  useEffect(() => {
    pinnedRunIdsRef.current = pinnedRunIds;
  }, [pinnedRunIds]);
  
  // 初回読み込みのみ（ポーリングを撤去 - フェーズ0）
  useEffect(() => {
    if (activeWorkflow) {
      // ピン留め状態を読み込む（workflow metaから）
      const pinned = (activeWorkflow as any).pinnedRunIds || [];
      setPinnedRunIds(pinned);
      pinnedRunIdsRef.current = pinned;
      // 初回読み込み
      loadOutputs();
    } else {
      setOutputs([]);
    }
    // フェーズ3-5: 依存配列を最適化（activeWorkflow?.idのみに変更）
  }, [activeWorkflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Outputタブがアクティブになった時だけ再読み込み（フェーズ0: ポーリング撤去）
  useEffect(() => {
    if (isActive && activeWorkflow && !loadingRef.current) {
      loadOutputs();
    }
    // フェーズ3-5: 依存配列を最適化
  }, [isActive, activeWorkflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePin = async (runId: string) => {
    if (!activeWorkflow) return;
    
    const newPinned = pinnedRunIds.includes(runId)
      ? pinnedRunIds.filter((id) => id !== runId)
      : [...pinnedRunIds, runId];
    
    setPinnedRunIds(newPinned);
    
    // workflow metaを更新（TODO: API実装）
    // ここではローカル状態のみ更新
    setOutputs((prev) =>
      prev.map((output) =>
        output.id === runId ? { ...output, pinned: !output.pinned } : output
      )
    );
  };

  const toggleCompareSelection = (runId: string) => {
    setSelectedRunIdsForCompare((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        if (newSet.size >= 2) {
          // 2つまで選択可能
          return prev;
        }
        newSet.add(runId);
      }
      return newSet;
    });
  };

  const handleCompare = () => {
    if (selectedRunIdsForCompare.size === 2) {
      setCompareMode(true);
    }
  };

  // フェーズ2-3: contractベースのカード表示用ヘルパー関数
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

  const expandTemplate = (template: string, data: any): string => {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = getDataByPath(data, path.trim());
      return value !== null && value !== undefined ? String(value) : '';
    });
  };

  // contractからカード情報を取得
  const getCardInfo = (output: typeof outputs[0]) => {
    const contract = output.agentDefinition?.outputViewContract;
    const planningEval = output.runPayload ? evaluateRunForPlanning(output.runPayload, output.agentDefinition) : null;
    const outputData = output.runPayload?.finalOutput || output.runPayload?.parsedOutput || output.runPayload?.output || output.payload;
    
    // Step3: タイトル: contract.summary.titlePath → path解決（安全化）
    let title = output.title;
    if (contract?.summary?.titlePath) {
      const titleValue = getDataByPath(outputData, contract.summary.titlePath);
      // Step3: object/arrayの場合はJSONそのまま出さない
      if (titleValue !== null && titleValue !== undefined) {
        if (typeof titleValue === 'object' || Array.isArray(titleValue)) {
          title = output.title; // 元のタイトルを使用
        } else {
          title = String(titleValue);
        }
      }
    } else if (!contract) {
      // fallback: contractが取得できない場合
      title = output.agentDefinition?.name || '成果物';
    }
    
    // Step3: サブタイトル: contract.summary.subtitleTemplate → {{}}展開（安全化）
    let subtitle = '';
    if (contract?.summary?.subtitleTemplate) {
      subtitle = expandTemplate(contract.summary.subtitleTemplate, outputData);
    } else {
      // fallback
      const executedAt = new Date(output.createdAt).toLocaleString('ja-JP');
      subtitle = executedAt;
    }
    
    // バッジ: contract.badges + evaluator結果バッジ
    const badges: Array<{ label: string; tone: 'indigo' | 'orange' | 'green' | 'red' | 'blue' | 'gray' }> = [];
    if (contract?.badges) {
      badges.push(...contract.badges);
    }
    if (planningEval) {
      // evaluator結果をバッジとして追加
      badges.push({
        label: planningEval.statusLabel,
        tone: planningEval.badgeTone,
      });
    }
    
    return { title, subtitle, badges, planningEval };
  };

  const exportToMarkdown = (output: typeof outputs[0]) => {
    let markdown = '';
    
    if (output.type === 'lp_structure') {
      const payload = output.payload as LpStructurePayload;
      markdown = `# LP構成案\n\n`;
      markdown += `## 対象ユーザー\n\n`;
      markdown += `- 状況: ${payload.targetUser.situation}\n`;
      markdown += `- 欲求: ${payload.targetUser.desire}\n`;
      markdown += `- 不安: ${payload.targetUser.anxiety}\n\n`;
      markdown += `## 質問一覧\n\n`;
      payload.questions.forEach((q, i) => {
        markdown += `${i + 1}. 【${q.category}】${q.question}\n`;
      });
      markdown += `\n## セクション構成\n\n`;
      payload.sections.forEach((section, i) => {
        markdown += `### ${i + 1}. ${section.name}\n\n`;
        markdown += `- **役割**: ${section.role}\n`;
        markdown += `- **答える質問**: ${section.answersQuestions.join(', ')}\n`;
        markdown += `- **要点**: ${section.keyPoints.join(', ')}\n`;
        markdown += `- **情報量**: ${section.infoVolume}\n`;
        markdown += `- **表現タイプ**: ${section.expressionTypes.join(', ')}\n`;
        markdown += `- **次の心理**: ${section.nextMindset}\n\n`;
      });
      markdown += `## CVポリシー\n\n`;
      markdown += `- **配置**: ${payload.cvPolicy.cvPlacement}\n`;
      markdown += `- **備考**: ${payload.cvPolicy.note}\n`;
    } else if (output.type === 'banner_structure') {
      const payload = output.payload as BannerStructurePayload;
      markdown = `# バナー構成案\n\n`;
      if (payload.derivedFrom?.lpRunId) {
        markdown += `*LP構成案から派生 (Run ID: ${payload.derivedFrom.lpRunId})*\n\n`;
      }
      payload.bannerIdeas.forEach((banner, i) => {
        markdown += `## バナー案${i + 1}: ${banner.pattern}\n\n`;
        markdown += `- **狙うユーザー状態**: ${banner.targetState}\n`;
        markdown += `- **約束する価値**: ${banner.singleValuePromise}\n`;
        markdown += `- **メインコピー方向性**: ${banner.mainCopyDirection}\n`;
        markdown += `- **サブ要素**: ${banner.subElements.join(', ')}\n`;
        if (banner.avoid.length > 0) {
          markdown += `- **避けるべき表現**: ${banner.avoid.join(', ')}\n`;
        }
        markdown += `- **遷移後LPで答えること**: ${banner.lpShouldAnswer.join(', ')}\n\n`;
      });
    }
    
    // クリップボードにコピー
    navigator.clipboard.writeText(markdown);
    alert('Markdownをクリップボードにコピーしました');
  };

  if (!activeWorkflow) {
    return (
      <div className="p-4">
        <h4 className="font-semibold mb-3">成果物一覧</h4>
        <div className="text-sm text-gray-500">
          ワークフローを選択すると成果物が表示されます
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">成果物一覧（出力がある実行のみ）</h4>
          {/* フェーズ2-5: UIテキストを明確化 */}
          {activeWorkflow && (
            <div className="text-xs text-gray-500 mt-1">
              フィルタ: workflowId={activeWorkflow.id} / status={showAllStatuses ? 'all' : 'success only'} / 成果物必須（finalOutput/parsedOutputあり）
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 4. デバッグログトグル */}
          <button
            onClick={() => setDebugLogEnabled(!debugLogEnabled)}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
            title={debugLogEnabled ? 'デバッグログOFF' : 'デバッグログON'}
          >
            {debugLogEnabled ? '🔇' : '🔊'}
          </button>
          {/* フェーズ3-2: 除外理由をdev-only UIトグルで表示 */}
          {process.env.NODE_ENV === 'development' && (
            <>
              <button
                onClick={() => setShowExclusionReasons(!showExclusionReasons)}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                title={showExclusionReasons ? '除外理由を非表示' : '除外理由を表示'}
              >
                {showExclusionReasons ? '👁️' : '👁️‍🗨️'}
              </button>
              <button
                onClick={async () => {
                  const results = await runOutputListEvaluationTests();
                  logTestResults(results);
                  alert(`テスト完了: 成功${results.passed}件 / 失敗${results.failed}件`);
                }}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                title="OutputList評価テストを実行"
              >
                🧪
              </button>
            </>
          )}
          {/* 5. UIの導線を明確化（フィルタ解除ボタン） */}
          <button
            onClick={() => setShowAllStatuses(!showAllStatuses)}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
            title={showAllStatuses ? '成功のみ表示' : '全ステータス表示'}
          >
            {showAllStatuses ? '成功のみ' : '全表示'}
          </button>
          {selectedRunIdsForCompare.size > 0 && (
            <div className="text-xs text-gray-600">
              {selectedRunIdsForCompare.size}/2 選択中
            </div>
          )}
          {selectedRunIdsForCompare.size === 2 && (
            <button
              onClick={handleCompare}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
            >
              <GitCompare className="w-3 h-3" />
              比較
            </button>
          )}
          {selectedRunIdsForCompare.size > 0 && (
            <button
              onClick={() => {
                setSelectedRunIdsForCompare(new Set());
                setCompareMode(false);
              }}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
            >
              クリア
            </button>
          )}
        </div>
      </div>
      
      {/* Compareモード */}
      {compareMode && selectedRunIdsForCompare.size === 2 && (() => {
        const runA = outputs.find((o) => o.id === Array.from(selectedRunIdsForCompare)[0]);
        const runB = outputs.find((o) => o.id === Array.from(selectedRunIdsForCompare)[1]);
        if (!runA || !runB || !runA.runItem || !runB.runItem || !runA.runPayload || !runB.runPayload) {
          return null;
        }
        return (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h5 className="font-semibold text-sm">比較モード</h5>
              <button
                onClick={() => {
                  setCompareMode(false);
                  setSelectedRunIdsForCompare(new Set());
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <WorkflowRunCompareView
              runA={{ item: runA.runItem, payload: runA.runPayload }}
              runB={{ item: runB.runItem, payload: runB.runPayload }}
            />
          </div>
        );
      })()}
      
      {/* 1. デバッグパネル（開閉） */}
      {debugRuns.length > 0 && (
        <div className="mb-4 border rounded bg-gray-50">
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-100"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">デバッグパネル</span>
              <span className="text-xs text-gray-500">
                ({debugRuns.length}件 / loaded: {loadedRunsCount}, normalized: {normalizedRunsCount}, afterFilter: {afterFilterCount})
              </span>
            </div>
            {showDebugPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showDebugPanel && (
            <div className="p-4 border-t overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border p-2 text-left">kb_id</th>
                    <th className="border p-2 text-left">workflowId</th>
                    <th className="border p-2 text-left">agentNodeId</th>
                    <th className="border p-2 text-left">agentId</th>
                    <th className="border p-2 text-left">status</th>
                    <th className="border p-2 text-left">executedAt</th>
                    <th className="border p-2 text-left">hasFinal</th>
                    <th className="border p-2 text-left">hasParsed</th>
                    <th className="border p-2 text-left">hasOutput</th>
                    <th className="border p-2 text-left">inferredOutputKind</th>
                    <th className="border p-2 text-left">excludedReason</th>
                  </tr>
                </thead>
                <tbody>
                  {debugRuns.map((run) => (
                    <tr key={run.kb_id} className={run.excludedReason ? 'bg-red-50' : 'bg-green-50'}>
                      <td className="border p-2 font-mono text-xs">{run.kb_id.substring(0, 12)}...</td>
                      <td className="border p-2">{run.workflowId || <span className="text-red-600">null</span>}</td>
                      <td className="border p-2">{run.agentNodeId || <span className="text-red-600">null</span>}</td>
                      <td className="border p-2">{run.agentId || run.agentDefinitionId || <span className="text-red-600">null</span>}</td>
                      <td className="border p-2">{run.status}</td>
                      <td className="border p-2">{run.executedAt ? new Date(run.executedAt).toLocaleString('ja-JP') : 'null'}</td>
                      <td className="border p-2 text-center">{run.hasFinalOutput ? '✓' : '✗'}</td>
                      <td className="border p-2 text-center">{run.hasParsedOutput ? '✓' : '✗'}</td>
                      <td className="border p-2 text-center">{run.hasOutput ? '✓' : '✗'}</td>
                      <td className="border p-2">{run.inferredOutputKind}</td>
                      <td className="border p-2">
                        {run.excludedReason ? (
                          <span className="text-red-600 font-semibold">{run.excludedReason}</span>
                        ) : (
                          <span className="text-green-600">✓ included</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : outputs.length === 0 ? (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
          {/* Step1: 空状態の判定を緩和 - runが0件の時だけ「まだ生成されていません」 */}
          {(() => {
            // Step1: 空状態の判定 - runが0件の時だけ「まだ生成されていません」
            const hasAnyRun = loadedRunsCount > 0;
            const hasValidRun = loadedRunsCount > 0 && normalizedRunsCount > 0;
            
            if (!hasAnyRun) {
              // runが0件 → 「まだ生成されていません」
              return (
                <>
                  <div className="text-sm text-yellow-800 font-medium mb-1">まだ生成されていません</div>
                  <div className="text-xs text-yellow-700">
                    エージェントを実行すると、ここに成果物が表示されます。
                  </div>
                </>
              );
            } else if (hasValidRun && afterFilterCount === 0) {
              // runはあるがoutputが無い → 「実行はあるが成果物が保存されていません」
              const hasRunsWithoutOutput = debugRuns.some(r => !r.hasFinalOutput && !r.hasParsedOutput && !r.hasOutput);
              if (hasRunsWithoutOutput) {
                return (
                  <>
                    <div className="text-sm text-yellow-800 font-medium mb-1">実行はあるが成果物が保存されていません</div>
                    <div className="text-xs text-yellow-700">
                      実行履歴はありますが、finalOutput/parsedOutputが保存されていないため成果物一覧には表示されません。保存処理を確認してください。
                    </div>
                  </>
                );
              } else {
                // filterで0件 → 「フィルタ条件で0件です」
                return (
                  <>
                    <div className="text-sm text-yellow-800 font-medium mb-1">フィルタ条件で0件です</div>
                    <div className="text-xs text-yellow-700">
                      実行履歴はありますが、現在のフィルタ条件（status={showAllStatuses ? 'all' : 'success only'}）に該当する成果物がありません。「全表示」に切り替えてみてください。
                    </div>
                  </>
                );
              }
            } else {
              return (
                <>
                  <div className="text-sm text-yellow-800 font-medium mb-1">実行runはありますが成果物条件で除外されています</div>
                  <div className="text-xs text-yellow-700">
                    デバッグパネルを参照して除外理由を確認してください。
                  </div>
                </>
              );
            }
          })()}
        </div>
      ) : (
        <>
          {/* 壊れたrunの警告（5. 過去のpayloadなしアイテムの通知） */}
          {brokenRunsCount > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
              <div className="text-sm text-red-800 font-medium mb-1">
                ⚠️ 壊れた実行履歴が{brokenRunsCount}件あります
              </div>
              <div className="text-xs text-red-700">
                payloadが保存されていない実行履歴があります。該当するエージェントを再実行してください。
              </div>
            </div>
          )}
        <div className="space-y-2">
            {outputs.map((output) => (
              <div key={output.id}>
                <div
                  className={`p-3 border rounded cursor-pointer hover:border-blue-300 ${
                    output.pinned ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                  } ${
                    selectedRunIdsForCompare.has(output.id) ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => {
                    if (!compareMode && output.runItem && output.runPayload) {
                      openRunDrawer(output.id);
                    }
                  }}
                >
                  {/* Compare選択チェックボックス */}
                  {!compareMode && (
                    <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRunIdsForCompare.has(output.id)}
                        onChange={() => toggleCompareSelection(output.id)}
                        className="w-4 h-4"
                      />
                    </div>
                  )}
                  {/* フェーズ3-2: 除外理由をdev-only UIトグルで表示 */}
                  {showExclusionReasons && output.evalResult && (
                    <div className={`mb-2 p-2 border rounded text-xs ${output.excluded ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <div className={`font-semibold mb-1 ${output.excluded ? 'text-red-800' : 'text-green-800'}`}>
                        {output.excluded ? '❌ 除外' : '✅ 表示対象'}
                      </div>
                      <div className={output.excluded ? 'text-red-700' : 'text-green-700'}>
                        <div>include: {output.evalResult.include ? 'true' : 'false'}</div>
                        {output.evalResult.reason && <div>reason: {output.evalResult.reason}</div>}
                        {output.evalResult.inferredOutputKind && <div>inferredOutputKind: {output.evalResult.inferredOutputKind}</div>}
                        {output.evalResult.inferredWorkflowId && <div>inferredWorkflowId: {output.evalResult.inferredWorkflowId}</div>}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2 relative">
                    <div className="flex-1">
                      {/* フェーズ2-3: contractベースのカード表示 */}
                      {(() => {
                        const cardInfo = getCardInfo(output);
                        const toneColors: Record<string, string> = {
                          indigo: 'bg-indigo-100 text-indigo-800',
                          orange: 'bg-orange-100 text-orange-800',
                          green: 'bg-green-100 text-green-800',
                          red: 'bg-red-100 text-red-800',
                          blue: 'bg-blue-100 text-blue-800',
                          gray: 'bg-gray-100 text-gray-800',
                        };
                        
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {output.pinned && <Pin className="w-4 h-4 text-yellow-600" />}
                              {/* contract.badges + evaluator結果バッジ */}
                              {cardInfo.badges.map((badge, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-1 text-xs font-semibold rounded ${toneColors[badge.tone] || toneColors.gray}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                              {!cardInfo.badges.length && (
                                // fallback: contract未設定の場合
                                <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">
                                  {output.agentDefinition?.name || '不明な成果物（contract未設定）'}
                                </span>
                              )}
                            </div>
                            {/* タイトル：contract.summary.titlePath → path解決 */}
                            <div className="text-sm font-medium text-gray-900 mb-1">{cardInfo.title}</div>
                            {/* サブタイトル：contract.summary.subtitleTemplate → {{}}展開 */}
                            {cardInfo.subtitle && (
                              <div className="text-xs text-gray-600 mb-1">{cardInfo.subtitle}</div>
                            )}
                            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              詳細を表示
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    {/* 右上：Pin / Compare / Export / Reuse を配置 */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => togglePin(output.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title={output.pinned ? 'ピン留め解除' : 'ピン留め'}
                      >
                        {output.pinned ? (
                          <PinOff className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <Pin className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => exportToMarkdown(output)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Markdownでコピー"
                      >
                        <Copy className="w-4 h-4 text-gray-600" />
                      </button>
                      {/* Reuseボタン（フェーズ2-4で実装） */}
                      {output.runPayload?.status === 'success' && output.runPayload?.finalOutput && (
                        <button
                          onClick={() => {
                            if (!activeWorkflow) {
                              alert('ワークフローを選択してください');
                              return;
                            }
                            
                            const agentName = output.agentDefinition?.name || (output.type === 'lp_structure' ? 'LP構成案' : 'バナー構成案');
                            const executedAt = new Date(output.createdAt).toLocaleString('ja-JP');
                            const displayName = `${agentName} @ ${executedAt}`;
                            
                            const newNode = {
                              id: `input-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                              type: 'input' as const,
                              kind: 'knowledge' as const,
                              label: displayName,
                              position: {
                                x: Math.random() * 300 + 50,
                                y: Math.random() * 300 + 50,
                              },
                              data: {
                                inputKind: 'workflow_run_ref' as const,
                                refId: output.id,
                                refKind: 'workflow_run',
                                title: displayName,
                              },
                              notes: `Run ID: ${output.id}`,
                            };
                            
                            addNode(newNode);
                            alert(`「${displayName}」をInputノードとして追加しました`);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="再利用（workflow_run_refノードを追加）"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
        </>
      )}
    </div>
  );
}
