'use client';

import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { useProductStore } from '@/store/useProductStore';
import { WorkflowNode, InputNode, AgentNode, InputNodeKind } from '@/types/workflow';
import { Package, Users, BookOpen, Bot, Plus, Trash2, Play } from 'lucide-react';

/**
 * ワークフロー編集パネル（右カラム）
 */
export default function WorkflowEditPanel() {
  const {
    activeWorkflow,
    agentDefinitions,
    selectedNode,
    addNode,
    updateNode,
    deleteNode,
    setSelectedNode,
    loadAgentDefinitions,
    addConnection,
  } = useWorkflowStore();
  
  const { activeProduct } = useProductStore();
  const [newInputKind, setNewInputKind] = useState<InputNodeKind>('product');
  const [newAgentId, setNewAgentId] = useState<string>('');
  
  useEffect(() => {
    loadAgentDefinitions();
  }, [loadAgentDefinitions]);
  
  // InputNodeを追加
  const handleAddInputNode = () => {
    if (!activeWorkflow) return;
    
    const labelMap: Record<InputNodeKind, string> = {
      product: '製品情報',
      persona: 'ペルソナ',
      knowledge: 'ナレッジ',
      intent: 'インテント',
   };
    
    const newNode: InputNode = {
      id: `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'input',
      kind: newInputKind,
      label: labelMap[newInputKind],
      position: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 300 + 50,
      },
    };
    
    addNode(newNode);
  };
  
  // AgentNodeを追加
  const handleAddAgentNode = () => {
    if (!activeWorkflow || !newAgentId) return;
    
    const agent = agentDefinitions.find((a) => a.id === newAgentId);
    if (!agent) return;
    
    const newNode: AgentNode = {
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'agent',
      agentDefinitionId: agent.id,
      label: agent.name,
      position: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 300 + 50,
      },
    };
    
    addNode(newNode);
    setNewAgentId('');
  };
  
  // ノードを削除
  const handleDeleteNode = () => {
    if (!selectedNode) return;
    if (!confirm('このノードを削除しますか？')) return;
    deleteNode(selectedNode.id);
    setSelectedNode(null);
  };
  
  // エージェントを実行
  const handleExecuteAgent = async (node: AgentNode) => {
    if (!activeWorkflow) return;
    
    // 接続されたInputNodeを取得
    const connectedInputs = activeWorkflow.connections
      .filter((conn) => conn.toNodeId === node.id)
      .map((conn) => activeWorkflow.nodes.find((n) => n.id === conn.fromNodeId))
      .filter((n): n is InputNode => n !== undefined && n.type === 'input');
    
    if (connectedInputs.length === 0) {
      alert('エージェントに接続されたInputノードがありません');
      return;
    }
    
    try {
      const response = await fetch('/api/workflow/execute-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentNodeId: node.id,
          agentDefinitionId: node.agentDefinitionId,
          inputNodeIds: connectedInputs.map((n) => n.id),
          inputNodes: connectedInputs.map((n) => ({
            id: n.id,
            kind: n.kind,
            referenceId: n.referenceId,
          })),
          workflowId: activeWorkflow.id,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute agent');
      }
      
      const data = await response.json();
      
      // 実行結果をノードに保存
      updateNode(node.id, {
        executionResult: {
          output: data.output,
          executedAt: new Date().toISOString(),
        },
      });
      
      alert('エージェントの実行が完了しました');
    } catch (error: any) {
      console.error('Execute agent error:', error);
      alert(`エージェント実行エラー: ${error.message}`);
    }
  };
  
  if (!activeWorkflow) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4">
        ワークフローが選択されていません
      </div>
    );
  }
  
  const inputNodes = activeWorkflow.nodes.filter((n) => n.type === 'input') as InputNode[];
  const agentNodes = activeWorkflow.nodes.filter((n) => n.type === 'agent') as AgentNode[];
  
  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* ヘッダー */}
      <div className="p-4 border-b bg-white sticky top-0">
        <h3 className="text-lg font-bold">編集・管理</h3>
      </div>
      
      {/* Input一覧 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Input（入力データ）</h4>
          <button
            onClick={handleAddInputNode}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
            title="Inputノードを追加"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-2 mb-3">
          <select
            value={newInputKind}
            onChange={(e) => setNewInputKind(e.target.value as InputNodeKind)}
            className="w-full px-2 py-1 text-sm border rounded"
          >
            <option value="product">登録製品</option>
            <option value="persona">ペルソナ</option>
            <option value="knowledge">ナレッジベース</option>
          </select>
        </div>
        
        <div className="space-y-1">
          {inputNodes.map((node) => (
            <div
              key={node.id}
              className={`p-2 rounded text-sm cursor-pointer ${
                selectedNode?.id === node.id
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
              onClick={() => setSelectedNode(node)}
            >
              <div className="flex items-center gap-2">
                {node.kind === 'product' && <Package className="w-4 h-4" />}
                {node.kind === 'persona' && <Users className="w-4 h-4" />}
                {node.kind === 'knowledge' && <BookOpen className="w-4 h-4" />}
                <span className="flex-1 truncate">{node.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Output（Agent）一覧 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Output（エージェント）</h4>
          <button
            onClick={handleAddAgentNode}
            disabled={!newAgentId}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Agentノードを追加"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-2 mb-3">
          <select
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded"
          >
            <option value="">エージェントを選択</option>
            {agentDefinitions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="space-y-1">
          {agentNodes.map((node) => (
            <div
              key={node.id}
              className={`p-2 rounded text-sm cursor-pointer ${
                selectedNode?.id === node.id
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
              onClick={() => setSelectedNode(node)}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                <span className="flex-1 truncate">{node.label}</span>
                {node.executionResult && (
                  <span className="text-xs text-green-600">✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 選択中ノードの編集 */}
      {selectedNode && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">選択中のノード</h4>
            <button
              onClick={handleDeleteNode}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
              title="ノードを削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                ラベル
              </label>
              <input
                type="text"
                value={selectedNode.label}
                onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            
            {selectedNode.type === 'input' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  参照先（実装中）
                </label>
                <select
                  className="w-full px-2 py-1 text-sm border rounded"
                  disabled
                >
                  <option>選択してください</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  製品・ペルソナ・ナレッジの選択機能は実装中です
                </p>
              </div>
            )}
            
            {selectedNode.type === 'agent' && (
              <div>
                <button
                  onClick={() => handleExecuteAgent(selectedNode as AgentNode)}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-2 text-sm"
                >
                  <Play className="w-4 h-4" />
                  エージェントを実行
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
