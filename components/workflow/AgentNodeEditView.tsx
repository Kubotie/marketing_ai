'use client';

import { useState, useEffect, useCallback } from 'react';
import { AgentNode, Workflow, ExecutionContext } from '@/types/workflow';
import { AgentDefinition } from '@/types/workflow';
import { Trash2, Play, Eye, Loader2, XCircle, CheckCircle, Copy, Sparkles } from 'lucide-react';
import { buildExecutionContext, buildUserPrompt, estimateTokenCount } from '@/lib/workflow-execution';
import { KBItem, WorkflowRunPayload } from '@/kb/types';

interface AgentNodeEditViewProps {
  agentNode: AgentNode;
  activeWorkflow: Workflow;
  agentDefinitions: AgentDefinition[];
  updateNode: (nodeId: string, updates: Partial<AgentNode>) => void;
  deleteNode: () => void;
  connectionMode: boolean;
  setConnectionMode: (enabled: boolean, fromNodeId?: string | null) => void;
  onExecute: (node: AgentNode) => Promise<void>;
}

/**
 * AgentNode編集ビュー（実行プレビュー含む）
 */
export default function AgentNodeEditView({
  agentNode,
  activeWorkflow,
  agentDefinitions,
  updateNode,
  deleteNode,
  connectionMode,
  setConnectionMode,
  onExecute,
}: AgentNodeEditViewProps) {
  const [executionContext, setExecutionContext] = useState<ExecutionContext | null>(null);
  const [userPromptPreview, setUserPromptPreview] = useState<string>('');
  const [fullUserPrompt, setFullUserPrompt] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // ラベルのローカル状態（カーソル位置保持のため）
  const [labelValue, setLabelValue] = useState<string>('');
  
  // エージェントノードが変更されたら、ローカル状態を初期化
  useEffect(() => {
    setLabelValue(agentNode.label || '');
  }, [agentNode.id]); // agentNode.idが変更された時のみ更新
  
  // フェーズ3: LP run選択用の状態
  const [lpRuns, setLpRuns] = useState<Array<{ id: string; title: string; output: any }>>([]);
  const [selectedLpRunId, setSelectedLpRunId] = useState<string>('');
  const [useLatestLpRun, setUseLatestLpRun] = useState(true);
  
  const agent = agentDefinitions.find((a) => a.id === agentNode.agentDefinitionId);
  const isOrchestrator = agent?.id === 'orchestrator-agent-default';
  
  // 上流ノードを再帰的に取得（DAGベース、直接接続されていないノードも含む）
  const getUpstreamNodes = useCallback((targetNodeId: string, visited: Set<string> = new Set()): any[] => {
    if (!activeWorkflow) return [];
    if (visited.has(targetNodeId)) {
      return []; // サイクル防止
    }
    visited.add(targetNodeId);
    
    const upstreamNodeIds = activeWorkflow.connections
      .filter((conn) => conn.toNodeId === targetNodeId)
      .map((conn) => conn.fromNodeId);
    
    const upstreamNodes: any[] = [];
    const seenNodeIds = new Set<string>(); // 重複除去用
    
    for (const upstreamNodeId of upstreamNodeIds) {
      if (seenNodeIds.has(upstreamNodeId)) continue; // 既に追加済み
      const node = activeWorkflow.nodes.find((n) => n.id === upstreamNodeId);
      if (node) {
        // 再帰的に上流を取得
        const furtherUpstream = getUpstreamNodes(upstreamNodeId, new Set(visited));
        for (const upstreamNode of furtherUpstream) {
          if (!seenNodeIds.has(upstreamNode.id)) {
            upstreamNodes.push(upstreamNode);
            seenNodeIds.add(upstreamNode.id);
          }
        }
        if (!seenNodeIds.has(node.id)) {
          upstreamNodes.push(node);
          seenNodeIds.add(node.id);
        }
      }
    }
    
    return upstreamNodes;
  }, [activeWorkflow]);

  // フェーズ3: LP run一覧を読み込む（Orchestratorエージェントの場合）
  useEffect(() => {
    if (!isOrchestrator) {
      setLpRuns([]);
      return;
    }
    
    const loadLpRuns = async () => {
      try {
        // workflow_runタイプのKBアイテムを取得
        const response = await fetch('/api/kb/items?type=workflow_run');
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to fetch LP runs';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorMessage;
          } catch (parseError) {
            if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
              errorMessage = `APIエラー (${response.status}): HTMLエラーページが返されました。`;
            } else {
              errorMessage = `APIエラー (${response.status}): ${errorText.substring(0, 200)}`;
            }
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const items: KBItem[] = data.items || [];
        
        // LP構成案（lp_structure）のrunをフィルタ
        const lpStructureRuns = items
          .filter((item) => {
            const payload = item.payload as WorkflowRunPayload;
            // outputがlp_structure形式かどうかをチェック
            return payload.output && payload.output.type === 'lp_structure';
          })
          .map((item) => {
            const payload = item.payload as WorkflowRunPayload;
            return {
              id: item.kb_id,
              title: item.title,
              output: payload.output,
            };
          })
          .sort((a, b) => {
            // 最新順
            const itemA = items.find((i) => i.kb_id === a.id);
            const itemB = items.find((i) => i.kb_id === b.id);
            if (!itemA || !itemB) return 0;
            return new Date(itemB.updated_at).getTime() - new Date(itemA.updated_at).getTime();
          });
        
        setLpRuns(lpStructureRuns);
        
        // 最新のrunを自動選択
        if (lpStructureRuns.length > 0 && useLatestLpRun) {
          setSelectedLpRunId(lpStructureRuns[0].id);
          // AgentNodeDataに保存
          updateNode(agentNode.id, {
            data: {
              ...agentNode.data,
              agentId: agentNode.data?.agentId ?? agentNode.agentDefinitionId,
              selectedLpRunId: lpStructureRuns[0].id,
            },
          });
        }
      } catch (error) {
        console.error('Failed to load LP runs:', error);
      }
    };
    
    loadLpRuns();
  }, [isOrchestrator, useLatestLpRun, agentNode.id]);
  
  // 実行プレビューを構築
  useEffect(() => {
    if (!agent || !activeWorkflow) return;
    
    (async () => {
      try {
        // 接続されたInputNodeを取得
        const connectedInputIds = activeWorkflow.connections
          .filter((conn) => conn.toNodeId === agentNode.id)
          .map((conn) => conn.fromNodeId);
        
        // 上流のすべてのInputNodeを取得（直接接続されていないノードも含む）
        const allUpstreamNodesForPreview = getUpstreamNodes(agentNode.id);
        const allUpstreamInputsForPreview = allUpstreamNodesForPreview
          .filter((n) => n.type === 'input')
          .map((n) => n as any);
        
        // ExecutionContextを構築（クライアントサイドでもナレッジのpayloadを取得）
        const context: ExecutionContext = {
          knowledge: [],
        };
        
        // ナレッジアイテムのpayloadを取得するためのPromise配列
        const knowledgeFetchPromises: Promise<void>[] = [];
        
        for (const inputNode of allUpstreamInputsForPreview) {
          const data = inputNode.data;
          if (!data || !data.refId) continue;
          
          if (data.inputKind === 'product') {
            context.product = { id: data.refId, name: data.title };
          } else if (data.inputKind === 'persona') {
            context.persona = { id: data.refId };
          } else if (data.inputKind === 'kb_item') {
            // ナレッジアイテムのpayloadを取得
            const knowledgeItem = {
              kind: data.refKind || 'unknown',
              id: data.refId,
              title: data.title,
              payload: {} as any,
            };
            context.knowledge.push(knowledgeItem);
            
            // ナレッジアイテムの詳細を取得
            knowledgeFetchPromises.push(
              fetch(`/api/kb/items/${data.refId}`)
                .then((res) => res.json())
                .then((result) => {
                  if (result.item && result.item.payload) {
                    knowledgeItem.payload = result.item.payload;
                  }
                })
                .catch((err) => {
                  console.warn(`[AgentNodeEditView] Failed to fetch knowledge item ${data.refId}:`, err);
                })
            );
          }
        }
        
        // フェーズ3: Orchestratorエージェントの場合、LP runのoutputを追加
        if (isOrchestrator && selectedLpRunId) {
          const selectedRun = lpRuns.find((r) => r.id === selectedLpRunId);
          if (selectedRun) {
            context.lp_structure = {
              runId: selectedRun.id,
              payload: selectedRun.output,
            };
          }
        }
        
        // ナレッジアイテムのpayloadを取得してからuserPromptを生成
        await Promise.all(knowledgeFetchPromises);
        
        setExecutionContext(context);
        
        // userPromptプレビューを生成（全文を保存、コンテキスト長管理機能付き）
        const fullPrompt = buildUserPrompt(agent.userPromptTemplate, context, {
          maxContextTokens: 100000,
          maxKnowledgeItemTokens: 20000,
        });
        setFullUserPrompt(fullPrompt);
        setUserPromptPreview(fullPrompt.substring(0, 300) + (fullPrompt.length > 300 ? '...' : ''));
        
        // トークン数をログ出力
        const estimatedTokens = estimateTokenCount(fullPrompt);
        console.log(`[AgentNodeEditView] User Prompt 推定トークン数: ${estimatedTokens}`);
        if (estimatedTokens > 120000) {
          console.warn(`[AgentNodeEditView] ⚠️ コンテキストが非常に長いです（推定${estimatedTokens}トークン）`);
        }
      } catch (error) {
        console.error('Failed to build execution context:', error);
      }
    })();
  }, [agentNode, activeWorkflow, agent, isOrchestrator, selectedLpRunId, lpRuns, getUpstreamNodes]);
  
  const [executionProgress, setExecutionProgress] = useState<string>('');
  const [executionStep, setExecutionStep] = useState<string>('');
  const [showExecutionLog, setShowExecutionLog] = useState(false);
  
  // 実行ステップを監視（agentNode.data.executionStepから取得）
  useEffect(() => {
    if (agentNode.data?.status === 'running') {
      setExecutionStep(agentNode.data.executionStep || '実行中...');
      setIsExecuting(true);
      // 実行中は自動的にログを表示
      if (!showExecutionLog) {
        setShowExecutionLog(true);
      }
    } else {
      setExecutionStep('');
      setIsExecuting(false);
    }
  }, [agentNode.data?.status, agentNode.data?.executionStep, showExecutionLog]);
  
  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionProgress('エージェント実行を開始しています...');
    setExecutionStep('初期化中...');
    
    try {
      // 進捗表示のためのタイマー（実行ステップを監視）
      const progressInterval = setInterval(() => {
        const currentStep = agentNode.data?.executionStep;
        if (currentStep) {
          setExecutionStep(currentStep);
          setExecutionProgress(currentStep);
        } else if (agentNode.data?.status === 'running') {
          // ステップ情報がない場合は経過時間を表示
          const elapsed = Math.floor((Date.now() - (window as any).__executionStartTime || Date.now()) / 1000);
          setExecutionProgress(`LLM処理中... (${elapsed}秒経過)`);
        }
      }, 500); // 0.5秒ごとに更新
      
      // 実行開始時刻を記録
      (window as any).__executionStartTime = Date.now();
      
      await onExecute(agentNode);
      
      clearInterval(progressInterval);
      setExecutionProgress('実行完了');
      setExecutionStep('');
      setTimeout(() => {
        setExecutionProgress('');
        setIsExecuting(false);
      }, 2000);
    } catch (error: any) {
      setExecutionProgress(`エラー: ${error.message}`);
      setExecutionStep('エラー発生');
      setTimeout(() => {
        setExecutionProgress('');
        setExecutionStep('');
        setIsExecuting(false);
      }, 5000);
    }
  };
  
  // 直接接続されたInputNodeを取得
  const directlyConnectedInputIds = activeWorkflow.connections
    .filter((conn) => conn.toNodeId === agentNode.id)
    .map((conn) => conn.fromNodeId);
  
  const directlyConnectedInputs = activeWorkflow.nodes
    .filter((n) => directlyConnectedInputIds.includes(n.id) && n.type === 'input')
    .map((n) => n as any);
  
  // 上流のすべてのInputNodeを取得（直接接続されていないノードも含む）
  const allUpstreamNodes = getUpstreamNodes(agentNode.id);
  const allUpstreamInputs = allUpstreamNodes
    .filter((n) => n.type === 'input')
    .map((n) => n as any);
  
  // 直接接続されているかどうかを判定
  const isDirectlyConnected = (nodeId: string) => directlyConnectedInputIds.includes(nodeId);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Agentノード編集</h4>
        <button
          onClick={deleteNode}
          className="p-1 text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          ラベル
        </label>
        <input
          type="text"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
          onBlur={() => {
            if (labelValue !== agentNode.label) {
              updateNode(agentNode.id, { label: labelValue });
            }
          }}
          className="w-full px-2 py-1 text-sm border rounded"
        />
      </div>
      
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          エージェント
        </label>
        <select
          value={agentNode.agentDefinitionId}
          onChange={(e) => {
            const selectedAgent = agentDefinitions.find((a) => a.id === e.target.value);
            if (selectedAgent) {
              updateNode(agentNode.id, {
                agentDefinitionId: selectedAgent.id,
                label: selectedAgent.name,
                data: {
                  ...agentNode.data,
                  agentId: selectedAgent.id,
                  name: selectedAgent.name,
                },
              });
            }
          }}
          className="w-full px-2 py-1 text-sm border rounded"
        >
          {agentDefinitions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* フェーズ3: Orchestratorエージェントの場合、LP run選択UI */}
      {isOrchestrator && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            LP構成案の参照元
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useLatestLpRun}
                onChange={(e) => {
                  setUseLatestLpRun(e.target.checked);
                  if (e.target.checked && lpRuns.length > 0) {
                    setSelectedLpRunId(lpRuns[0].id);
                    updateNode(agentNode.id, {
                      data: {
                        ...agentNode.data,
                        selectedLpRunId: lpRuns[0].id,
                      }as any,
                    });
                  }
                }}
                className="w-4 h-4"
              />
              <span>最新のLP構成案を使用</span>
            </label>
            {!useLatestLpRun && (
              <select
                value={selectedLpRunId}
                onChange={(e) => {
                  setSelectedLpRunId(e.target.value);
                  updateNode(agentNode.id, {
                    data: {
                      ...agentNode.data,
                      agentId: agentNode.data?.agentId ?? agentNode.agentDefinitionId,
                      selectedLpRunId: e.target.value,
                    },
                  });
                }}
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">選択してください</option>
                {lpRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.title}
                  </option>
                ))}
              </select>
            )}
            {selectedLpRunId && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                ✓ {lpRuns.find((r) => r.id === selectedLpRunId)?.title || '選択済み'}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 接続されたInput一覧（直接接続 + 文脈として接続されているノード） */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          接続されたInput（文脈として使用されるノード）
        </label>
        {allUpstreamInputs.length === 0 ? (
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            ⚠️ 接続されたInputノードがありません
          </div>
        ) : (
          <div className="space-y-1">
            {allUpstreamInputs.map((inputNode: any) => {
              const isDirect = isDirectlyConnected(inputNode.id);
              return (
                <div
                  key={inputNode.id}
                  className={`p-2 rounded text-xs ${
                    isDirect
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50 border border-gray-200 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isDirect ? (
                      <span className="text-blue-600 font-medium">→</span>
                    ) : (
                      <span className="text-gray-400 text-[10px]">↳</span>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">
                        {inputNode.label}
                        {inputNode.data?.title && ` (${inputNode.data.title})`}
                      </div>
                      {!isDirect && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          間接的に接続（文脈として使用）
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 実行プレビュー */}
      {executionContext && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">
              実行プレビュー
            </label>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              {showPreview ? '非表示' : '表示'}
            </button>
          </div>
          {showPreview && (
            <div className="p-3 bg-gray-50 border rounded text-xs space-y-2">
              <div>
                <div className="font-medium mb-1">ExecutionContext:</div>
                <div className="text-gray-600">
                  {executionContext.product && <div>製品: {executionContext.product.name || executionContext.product.id}</div>}
                  {executionContext.persona && <div>ペルソナ: {executionContext.persona.id}</div>}
                  {executionContext.knowledge.length > 0 && (
                    <div>ナレッジ: {executionContext.knowledge.length}件</div>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium">User Prompt:</div>
                  <div className="flex items-center gap-2">
                    {fullUserPrompt && (
                      <span className="text-xs text-gray-500">
                        推定トークン数: {estimateTokenCount(fullUserPrompt).toLocaleString()}
                        {estimateTokenCount(fullUserPrompt) > 120000 && (
                          <span className="text-orange-600 ml-1">⚠️</span>
                        )}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const textToCopy = fullUserPrompt || userPromptPreview;
                        navigator.clipboard.writeText(textToCopy);
                        alert('User Promptをクリップボードにコピーしました');
                      }}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      title="User Promptをクリップボードにコピー"
                    >
                      <Copy className="w-3 h-3" />
                      コピー
                    </button>
                  </div>
                </div>
                <div className="p-2 bg-white border border-gray-300 rounded text-gray-600 whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-mono text-[11px]">
                  {fullUserPrompt || userPromptPreview}
                </div>
              </div>
              {agent && allUpstreamInputs.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium text-blue-800 mb-1">
                        接続情報に基づくUser Prompt Template提案
                      </div>
                      <div className="text-blue-700 mb-2">
                        <div className="mb-1">
                          接続された{allUpstreamInputs.length}件のInputノード情報が含まれます：
                        </div>
                        <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                          {allUpstreamInputs.map((inputNode: any, idx: number) => {
                            const inputKind = inputNode.data?.inputKind || inputNode.kind || 'unknown';
                            const title = inputNode.data?.title || inputNode.label || 'タイトルなし';
                            return (
                              <li key={idx} className="text-blue-600">
                                {inputKind === 'product' && '📦 製品: '}
                                {inputKind === 'persona' && '👤 ペルソナ: '}
                                {inputKind === 'kb_item' && '📚 ナレッジ: '}
                                {inputKind === 'intent' && '🎯 目的・意図: '}
                                {title}
                              </li>
                            );
                          })}
                        </ul>
                        <div className="mt-2 text-xs">
                          エージェント定義のUser Prompt Templateに{'{{context}}'}を使用すると、これらの情報（タイトルと詳細）が自動的に展開されます。
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          // 実際に展開されたUser Promptをコピー（接続情報が含まれている）
                          if (fullUserPrompt) {
                            navigator.clipboard.writeText(fullUserPrompt);
                            alert('接続情報を含むUser Promptをクリップボードにコピーしました。\nエージェント定義の編集画面で貼り付けてください。');
                          } else {
                            // fullUserPromptがまだ生成されていない場合、ExecutionContextを再構築して生成
                            try {
                              const allUpstreamNodesForPreview = getUpstreamNodes(agentNode.id);
                              const allUpstreamInputsForPreview = allUpstreamNodesForPreview
                                .filter((n) => n.type === 'input')
                                .map((n) => n as any);
                              
                              const context: ExecutionContext = {
                                knowledge: [],
                              };
                              
                              const knowledgeFetchPromises: Promise<void>[] = [];
                              
                              for (const inputNode of allUpstreamInputsForPreview) {
                                const data = inputNode.data;
                                if (!data || !data.refId) continue;
                                
                                if (data.inputKind === 'product') {
                                  context.product = { id: data.refId, name: data.title };
                                } else if (data.inputKind === 'persona') {
                                  context.persona = { id: data.refId };
                                } else if (data.inputKind === 'kb_item') {
                                  const knowledgeItem = {
                                    kind: data.refKind || 'unknown',
                                    id: data.refId,
                                    title: data.title,
                                    payload: {} as any,
                                  };
                                  context.knowledge.push(knowledgeItem);
                                  
                                  knowledgeFetchPromises.push(
                                    fetch(`/api/kb/items/${data.refId}`)
                                      .then((res) => res.json())
                                      .then((result) => {
                                        if (result.item && result.item.payload) {
                                          knowledgeItem.payload = result.item.payload;
                                        }
                                      })
                                      .catch((err) => {
                                        console.warn(`Failed to fetch knowledge item ${data.refId}:`, err);
                                      })
                                  );
                                }
                              }
                              
                              await Promise.all(knowledgeFetchPromises);
                              
                              if (agent && agent.userPromptTemplate) {
                                const expandedPrompt = buildUserPrompt(agent.userPromptTemplate, context, {
                                  maxContextTokens: 100000,
                                  maxKnowledgeItemTokens: 20000,
                                });
                                navigator.clipboard.writeText(expandedPrompt);
                                const estimatedTokens = estimateTokenCount(expandedPrompt);
                                alert(`接続情報を含むUser Promptをクリップボードにコピーしました。\nエージェント定義の編集画面で貼り付けてください。\n\n推定トークン数: ${estimatedTokens}${estimatedTokens > 120000 ? '\n⚠️ コンテキストが非常に長いです。' : ''}`);
                              } else {
                                alert('エージェント定義が見つかりません。');
                              }
                            } catch (error) {
                              console.error('Failed to generate expanded prompt:', error);
                              alert('接続情報の展開に失敗しました。');
                            }
                          }
                        }}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        推奨テンプレートをコピー
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* 実行状態の表示 */}
      {agentNode.data?.status === 'running' && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <h5 className="font-semibold text-sm text-blue-800">実行中...</h5>
          </div>
          <div className="text-xs text-blue-700">
            LLMの応答を待機しています。通常30秒〜2分かかります。
          </div>
        </div>
      )}
      
      {/* エラー状態の表示 */}
      {agentNode.data?.status === 'error' && agentNode.data?.lastError && (
        <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <h5 className="font-bold text-sm text-red-800">実行エラー</h5>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-red-900 mb-2">
              エラー詳細:
            </div>
            <div className="p-3 bg-white border border-red-200 rounded text-xs text-red-800 whitespace-pre-wrap break-words">
              {agentNode.data.lastError}
            </div>
            {/* エラーの種類に応じたヘルプメッセージ */}
            {agentNode.data.lastError.includes('HTMLエラーページ') && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <div className="font-medium mb-1">💡 考えられる原因:</div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>APIエンドポイント（/api/workflow/execute-agent）が正しく設定されていない</li>
                  <li>サーバーが起動していない、またはエラーが発生している</li>
                  <li>ネットワーク接続の問題</li>
                </ul>
                <div className="mt-2 font-medium">対処方法:</div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>開発サーバーが正常に起動しているか確認してください</li>
                  <li>ブラウザの開発者ツール（F12）でネットワークタブを確認してください</li>
                  <li>サーバーのログを確認してください</li>
                </ul>
              </div>
            )}
            {agentNode.data.lastError.includes('APIキー') && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <div className="font-medium mb-1">💡 APIキーが設定されていません</div>
                <div className="mt-1">
                  .env.localファイルにOPENROUTER_API_KEYまたはNEXT_PUBLIC_OPENROUTER_API_KEYを設定してください。
                </div>
              </div>
            )}
            {agentNode.data.lastError.includes('タイムアウト') && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <div className="font-medium mb-1">💡 タイムアウトが発生しました</div>
                <div className="mt-1">
                  LLMの応答が遅い可能性があります。しばらく待ってから再実行してください。
                </div>
              </div>
            )}
            {(agentNode.data.lastError.includes('Unexpected token') || 
              agentNode.data.lastError.includes('<!DOCTYPE') || 
              agentNode.data.lastError.includes('not valid JSON')) && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <div className="font-medium mb-1">💡 JSONパースエラー</div>
                <div className="mt-1 mb-2">
                  APIがJSONではなくHTMLエラーページを返しています。これは通常、サーバーエラーまたはAPIエンドポイントの問題を示しています。
                </div>
                <div className="font-medium mb-1">考えられる原因:</div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>APIエンドポイント（/api/workflow/execute-agent）が正しく設定されていない</li>
                  <li>サーバーが起動していない、またはエラーが発生している</li>
                  <li>ネットワーク接続の問題</li>
                  <li>サーバー側でエラーが発生し、HTMLエラーページが返されている</li>
                </ul>
                <div className="mt-2 font-medium">対処方法:</div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>開発サーバーが正常に起動しているか確認してください（npm run dev）</li>
                  <li>ブラウザの開発者ツール（F12）でネットワークタブを確認してください</li>
                  <li>サーバーのログ（ターミナル）を確認してください</li>
                  <li>APIエンドポイントが正しく動作しているか確認してください</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 実行結果の表示 */}
      {agentNode.executionResult && agentNode.data?.status === 'success' && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h5 className="font-semibold text-sm text-green-800">実行結果</h5>
            </div>
            <span className="text-xs text-green-600">
              {new Date(agentNode.executionResult.executedAt).toLocaleString('ja-JP')}
            </span>
          </div>
          
          {agentNode.executionResult.error ? (
            <div className="text-xs text-red-600">
              エラー: {agentNode.executionResult.error}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-green-700 font-medium">✓ 実行成功</div>
              {agentNode.executionResult.output && (
                <div>
                  <div className="text-xs font-medium text-gray-700 mb-1">出力内容:</div>
                  <div className="p-2 bg-white border rounded text-xs overflow-auto max-h-60">
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(agentNode.executionResult.output, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* 実行ログトグル（実行ボタンの上） */}
      <div className="flex items-center justify-between p-2 bg-gray-50 rounded border">
        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showExecutionLog}
            onChange={(e) => setShowExecutionLog(e.target.checked)}
            className="w-4 h-4"
          />
          <span>実行ログを表示</span>
        </label>
        {agentNode.data?.executionLogs && agentNode.data.executionLogs.length > 0 && (
          <span className="text-xs text-gray-500">
            {agentNode.data.executionLogs.length}件
          </span>
        )}
      </div>
      
      {/* 実行ログ表示エリア */}
      {showExecutionLog && (
        <div className="border rounded-lg bg-gray-900 text-gray-100 font-mono text-xs max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-gray-800 px-3 py-2 border-b border-gray-700 flex items-center justify-between z-10">
            <span className="font-semibold text-white">実行ログ</span>
            {agentNode.data?.executionLogs && agentNode.data.executionLogs.length > 0 && (
              <button
                onClick={() => {
                  updateNode(agentNode.id, {
                    data: {
                      ...agentNode.data,
                      executionLogs: [],
                    }as any,
                  });
                }}
                className="text-xs text-gray-400 hover:text-white"
              >
                クリア
              </button>
            )}
          </div>
          <div className="p-3 space-y-2">
            {agentNode.data?.executionLogs && agentNode.data.executionLogs.length > 0 ? (
              agentNode.data.executionLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-1 ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warning' ? 'text-yellow-400' :
                    log.level === 'success' ? 'text-green-400' :
                    'text-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 text-[10px] min-w-[80px]">
                      {new Date(log.timestamp).toLocaleTimeString('ja-JP', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      })}
                    </span>
                    <span className="min-w-[60px] text-[10px]">
                      [{log.level.toUpperCase()}]
                    </span>
                  </div>
                  <div className="flex-1 break-words whitespace-pre-wrap pl-[140px]">{log.message}</div>
                  {log.details && (
                    <details className="text-[10px] text-gray-400 pl-[140px]">
                      <summary className="cursor-pointer hover:text-gray-300 mb-1">詳細を表示</summary>
                      <pre className="mt-1 p-2 bg-gray-800 rounded overflow-x-auto max-h-96 overflow-y-auto">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-4">
                ログは実行開始時に表示されます
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 実行ボタン */}
      <div className="space-y-2">
        <button
          onClick={handleExecute}
          disabled={isExecuting || allUpstreamInputs.length === 0}
          className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>実行中...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>エージェントを実行</span>
            </>
          )}
        </button>
        {isExecuting && (
          <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="font-semibold text-sm text-blue-800">実行中</span>
            </div>
            {executionStep && (
              <div className="text-xs text-blue-700 font-medium mb-1">
                {executionStep}
              </div>
            )}
            {executionProgress && (
              <div className="text-xs text-blue-600">
                {executionProgress}
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-600">
              ⏱️ LLMの応答には通常30秒〜2分かかります
            </div>
            {/* プログレスバー（簡易版） */}
            <div className="mt-2 h-1 bg-blue-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
