'use client';

import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { KBItem, WorkflowRunPayload } from '@/kb/types';
import WorkflowRunDetailView from './WorkflowRunDetailView';
import { X, Maximize2, Minimize2, RefreshCw, Download, Repeat, GitCompare, ChevronDown, ChevronUp, Hash, Clock } from 'lucide-react';
import { InputNode } from '@/types/workflow';

/**
 * 成果物詳細Drawer（右側40-50%）
 * Step1: 成果物詳細Drawerを実装する
 */
export default function WorkflowOutputDetailDrawer() {
  const { 
    selectedRunId, 
    isRunDrawerOpen, 
    closeRunDrawer,
    activeWorkflow,
    addNode,
  } = useWorkflowStore();
  const [runItem, setRunItem] = useState<KBItem | null>(null);
  const [runPayload, setRunPayload] = useState<WorkflowRunPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // サイドバー拡張状態
  const [isMetaExpanded, setIsMetaExpanded] = useState(false); // meta折り畳み状態

  // selectedRunIdが変更されたらrunItemとrunPayloadを読み込む
  useEffect(() => {
    if (selectedRunId && isRunDrawerOpen) {
      loadRunDetail(selectedRunId);
    } else {
      setRunItem(null);
      setRunPayload(null);
    }
  }, [selectedRunId, isRunDrawerOpen]);

  const loadRunDetail = async (runId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/kb/items/${runId}`);
      if (!response.ok) {
        console.error('[WorkflowOutputDetailDrawer] Failed to fetch run:', runId);
        return;
      }
      
      const data = await response.json();
      const item: KBItem = data.item;
      const payload = item.payload as WorkflowRunPayload;
      
      setRunItem(item);
      setRunPayload(payload);
    } catch (error) {
      console.error('[WorkflowOutputDetailDrawer] Error loading run detail:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isRunDrawerOpen) {
    return null;
  }

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={closeRunDrawer}
      />
      
      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 bg-white shadow-xl z-50 flex flex-col transition-all duration-300 ${
          isExpanded ? 'w-[70vw] min-w-[800px]' : 'w-[45vw] min-w-[520px] max-w-[720px]'
        }`}
      >
        {/* ヘッダー（固定） - フェーズ3: Step 2-1 */}
        <div className="flex-shrink-0 border-b bg-white">
          {/* 上部: 成果物タイプ・生成状態 */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {runPayload?.agentDefinitionId ? (
                  runPayload.agentDefinitionId.includes('lp') ? 'LP構成案' :
                  runPayload.agentDefinitionId.includes('banner') ? 'バナー構成案' :
                  '成果物'
                ) : '成果物詳細'}
              </h2>
              {runPayload && (
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  (runPayload as any).status === 'completed' ? 'bg-green-100 text-green-700' :
(runPayload as any).status === 'failed' ? 'bg-red-100 text-red-700' :
(runPayload as any).status === 'running' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {(runPayload as any).status === 'completed' ? '生成済' :
 (runPayload as any).status === 'failed' ? '検証失敗' :
 (runPayload as any).status === 'running' ? '生成中' :
 (runPayload as any).status === 'error' ? 'エラー' : '入力不足'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 hover:bg-gray-100 rounded"
                aria-label={isExpanded ? '縮小' : '拡張'}
                title={isExpanded ? '縮小' : '拡張（70%）'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-5 h-5" />
                ) : (
                  <Maximize2 className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={closeRunDrawer}
                className="p-2 hover:bg-gray-100 rounded"
                aria-label="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* 下部: CTA（再生成 / エクスポート / Reuse / Compare） */}
          {runItem && runPayload && (
            <div className="flex items-center gap-2 p-3 bg-gray-50">
              <button
                onClick={() => {
                  if (onRegenerate) onRegenerate(runItem.kb_id);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                再生成
              </button>
              <button
                onClick={() => {
                  if (onExport) onExport(runItem.kb_id);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                エクスポート
              </button>
              <button
                onClick={() => {
                  if (onReuse) onReuse(runItem.kb_id);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5"
              >
                <Repeat className="w-4 h-4" />
                Reuse
              </button>
              <button
                onClick={() => {
                  if (onCompare) onCompare(runItem.kb_id);
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5"
              >
                <GitCompare className="w-4 h-4" />
                Compare
              </button>
            </div>
          )}
        </div>
        
        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">読み込み中...</div>
            </div>
          ) : runItem && runPayload ? (
            <div className="p-4">
              {/* フェーズ3: Step 2-1 - meta折り畳み（下部に配置） */}
              <div className="mb-4 border-t pt-4">
                <button
                  onClick={() => setIsMetaExpanded(!isMetaExpanded)}
                  className="w-full flex items-center justify-between p-2 text-sm text-gray-600 hover:bg-gray-50 rounded"
                >
                  <span className="flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    <span>メタ情報（モデル、versionHash、raw等）</span>
                  </span>
                  {isMetaExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {isMetaExpanded && (
                  <div className="mt-2 p-4 bg-gray-50 rounded-lg text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="font-medium text-gray-700">モデル:</span>
                        <span className="ml-2 text-gray-600">{runPayload.model || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">実行日時:</span>
                        <span className="ml-2 text-gray-600">
                          {runPayload.executedAt ? new Date(runPayload.executedAt).toLocaleString('ja-JP') : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">versionHash:</span>
                        <span className="ml-2 text-gray-600 font-mono">
                          {runPayload.versionHash ? runPayload.versionHash.substring(0, 8) + '...' : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">ステータス:</span>
                        <span className="ml-2 text-gray-600">{runPayload.status || 'N/A'}</span>
                      </div>
                      {runPayload.agentDefinitionId && (
                        <div className="col-span-2">
                          <span className="font-medium text-gray-700">エージェント定義ID:</span>
                          <span className="ml-2 text-gray-600">{runPayload.agentDefinitionId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <WorkflowRunDetailView
                runItem={runItem}
                runPayload={runPayload}
                onReuse={(runId) => {
                  // 再利用: workflow_run_refノードを追加
                  if (!activeWorkflow) {
                    alert('ワークフローを選択してください');
                    return;
                  }
                  
                  const agentName = runPayload.agentDefinitionId || runItem.title.split(' - ')[0];
                  const executedAt = new Date(runPayload.executedAt || runPayload.startedAt).toLocaleString('ja-JP');
                  const displayName = `${agentName} @ ${executedAt}`;
                  
                  const newNode: InputNode = {
                    id: `input-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'input',
                    kind: 'knowledge',
                    label: displayName,
                    position: {
                      x: Math.random() * 300 + 50,
                      y: Math.random() * 300 + 50,
                    },
                    data: {
                      inputKind: 'workflow_run_ref',
                      refId: runId,
                      refKind: 'workflow_run',
                      title: displayName,
                    },
                    notes: `Run ID: ${runId}`,
                  };
                  
                  addNode(newNode);
                  alert(`「${displayName}」をInputノードとして追加しました`);
                }}
                onCompare={(runId) => {
                  // 比較機能: 別のrunを選択して比較
                  const compareRunId = prompt('比較する実行結果のIDを入力してください（または空欄でキャンセル）:');
                  if (!compareRunId || compareRunId.trim() === '') {
                    return;
                  }
                  
                  // 簡易実装: 2つのrunを取得して比較表示
                  Promise.all([
                    fetch(`/api/kb/items/${runId}`).then(r => r.json()),
                    fetch(`/api/kb/items/${compareRunId.trim()}`).then(r => r.json()),
                  ]).then(([run1Data, run2Data]) => {
                    const run1 = run1Data.item;
                    const run2 = run2Data.item;
                    
                    // 比較結果を表示
                    const comparison = {
                      run1: {
                        id: run1.kb_id,
                        title: run1.title,
                        output: (run1.payload as WorkflowRunPayload).finalOutput || (run1.payload as WorkflowRunPayload).output,
                      },
                      run2: {
                        id: run2.kb_id,
                        title: run2.title,
                        output: (run2.payload as WorkflowRunPayload).finalOutput || (run2.payload as WorkflowRunPayload).output,
                      },
                    };
                    
                    // 簡易比較表示（JSON diff）
                    alert(`比較結果:\n\nRun 1: ${run1.title}\nRun 2: ${run2.title}\n\n詳細はコンソールを確認してください。`);
                    console.log('[Compare] Comparison:', comparison);
                  }).catch((error) => {
                    console.error('[Compare] Error:', error);
                    alert(`比較に失敗しました: ${error.message || '不明なエラー'}`);
                  });
                }}
                onExport={(runId) => {
                  // エクスポート機能はWorkflowRunDetailView内で実装済み
                  console.log('[WorkflowOutputDetailDrawer] Export requested:', runId);
                }}
                onRegenerate={(runId) => {
                  // 再生成機能（今後実装）
                  console.log('[WorkflowOutputDetailDrawer] Regenerate requested:', runId);
                  alert('再生成機能は今後実装予定です');
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">成果物が見つかりません</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
