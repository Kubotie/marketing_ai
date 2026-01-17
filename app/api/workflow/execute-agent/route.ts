/**
 * エージェント実行API
 * POST /api/workflow/execute-agent
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAgentDefinitionFromKB } from '@/lib/agent-definition-api-server';
import { buildUserPrompt } from '@/lib/workflow-execution';
import { buildExecutionContextFromDAG } from '@/lib/workflow-execution-server';
import { ExecutionContext } from '@/types/workflow';
import { OUTPUT_SCHEMA_MAP } from '@/kb/workflow-output-schemas';
import { ExecutionContextSummary, ValidationResult, WorkflowRunPayload } from '@/kb/types';
import { normalizeRunPayloadForSave } from '@/kb/workflow-run-normalizer';
import { getWorkflow } from '@/lib/workflow-db-server';
import { normalizeFinalOutputToV2 } from '@/lib/output-normalizer';
import crypto from 'crypto';

/**
 * エージェントを実行
 */
/**
 * Step 3: 入力品質チェック（実行前）
 */
interface QualityCheckResult {
  errors: string[];
  warnings: string[];
  missingInputs: string[];
}

/**
 * フェーズ3: Step 4-3 - 品質チェックを「文脈の欠落検知」に寄せる
 */
function validateInputQuality(context: ExecutionContext): QualityCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingInputs: string[] = [];
  
  // Step 4-3: intentが無い → warning（必須ではないが推奨）
  const intentPackets = context.packets?.filter((p) => p.kind === 'intent') || [];
  if (intentPackets.length === 0) {
    warnings.push('目的・意図（intent）ノードが存在しません。企画の方向性が不明確になる可能性があります。');
    missingInputs.push('目的・意図（intent）');
  } else {
    for (const packet of intentPackets) {
      
      const intentPayload = packet.content as any;
      if (!intentPayload.goal || intentPayload.goal.trim() === '') {
        warnings.push('目的・意図ノードの「目的（goal）」が空です。目的を入力することを推奨します。');
        missingInputs.push('目的（goal）');
      }
      if (!intentPayload.successCriteria || intentPayload.successCriteria.trim() === '') {
        warnings.push('目的・意図ノードの「成功条件（successCriteria）」が空です。成功条件を入力することを推奨します。');
        missingInputs.push('成功条件（successCriteria）');
      }
    }
  }
  
  // Step 4-3: 根拠ノード（knowledge）が0件 → warning
  const knowledgePackets = context.packets?.filter((p) => p.kind === 'kb_item') || [];
  if (knowledgePackets.length === 0) {
    warnings.push('ナレッジベースアイテム（knowledge）が設定されていません。根拠不足の可能性があります。');
    missingInputs.push('ナレッジベース（knowledge）');
  }
  
  // Step 4-3: personaが無い → warning（必須ではない）
  if (!context.persona) {
    warnings.push('ペルソナ情報（persona）が設定されていません。ターゲットが不明確になる可能性があります。');
    missingInputs.push('ペルソナ情報（persona）');
  }
  
  // Step 4-3: 製品情報は警告（必須ではない）
  const productPackets = context.packets?.filter((p) => p.kind === 'product') || [];
  if (productPackets.length === 0) {
    warnings.push('製品情報（product）が設定されていません。品質に影響する可能性があります。');
    missingInputs.push('製品情報（product）');
  }
  
  // Step 4-3: 直列で「製品→ナレッジ→エージェント」が途切れている → warning
  // DAGトレースを確認して、上流ノードの連鎖を検証
  if (context.trace && context.trace.orderedNodeIds) {
    const hasProduct = productPackets.length > 0;
    const hasKnowledge = knowledgePackets.length > 0;
    const hasIntent = intentPackets.length > 0;
    
    // 推奨パス: intent → product → knowledge → agent または product → knowledge → agent
    if (!hasProduct && !hasKnowledge) {
      warnings.push('推奨パス（製品→ナレッジ→エージェント）が途切れています。製品情報とナレッジの両方が不足しています。');
    } else if (!hasProduct && hasKnowledge) {
      warnings.push('製品情報が不足しています。推奨パス（製品→ナレッジ→エージェント）の一部が欠けています。');
    } else if (hasProduct && !hasKnowledge) {
      warnings.push('ナレッジが不足しています。推奨パス（製品→ナレッジ→エージェント）の一部が欠けています。');
    }
  }
  
  return { errors, warnings, missingInputs };
}

/**
 * ExecutionContextからサマリーを生成
 */
function buildExecutionContextSummary(context: ExecutionContext): ExecutionContextSummary {
  const summary: ExecutionContextSummary = {
    bannerInsightsCount: 0,
    marketInsightsCount: 0,
    strategyOptionsCount: 0,
    planningHooksCount: 0,
    bboxCount: 0,
    bboxTypes: [],
    ocrTextLength: 0,
    usedKbItemIds: context.referencedKbItemIds || [],
    // フェーズ2-4: 参照runId一覧をsummaryに追加（監査）
    referencedRunIds: context.referencedRunIds || [],
  };
  
  if (context.product) {
    summary.productSummary = {
      name: context.product.name,
      category: context.product.category,
    };
  }
  
  if (context.persona) {
    summary.personaSummary = {
      id: context.persona.id,
      title: (context.persona as any).title || (context.persona as any).summary,
    };
  }
  
  // knowledgeを集計
  for (const k of context.knowledge) {
    switch (k.kind) {
      case 'banner_insight':
        summary.bannerInsightsCount++;
        break;
      case 'market_insight':
        summary.marketInsightsCount++;
        break;
      case 'strategy_option':
        summary.strategyOptionsCount++;
        break;
      case 'planning_hook':
        summary.planningHooksCount++;
        break;
    }
  }
  
  // banner情報を集計
  if (context.banner) {
    if (context.banner.bboxes) {
      summary.bboxCount = context.banner.bboxes.length;
      const types = new Set<string>();
      for (const bbox of context.banner.bboxes) {
        if (bbox.type) types.add(bbox.type);
      }
      summary.bboxTypes = Array.from(types);
    }
    if (context.banner.ocrTexts) {
      summary.ocrTextLength = context.banner.ocrTexts.join('').length;
    }
  }
  
  return summary;
}

/**
 * エージェント定義のバージョンハッシュを生成
 */
function generateAgentVersionHash(agentDefinition: any): string {
  const content = `${agentDefinition.systemPrompt || ''}|${agentDefinition.outputSchemaRef || ''}|${agentDefinition.outputKind || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// APIルートのタイムアウト設定（Next.jsのデフォルトは10秒だが、LLM呼び出しには不十分）
export const maxDuration = 300; // 5分

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();
  
  // ログ開始
  console.group('[ExecuteAgent] エージェント実行開始');
  console.log('時刻:', startedAt);
  console.log('API endpoint: /api/workflow/execute-agent');
  
  let body: any = null;
  
  try {
    // リクエストボディのパース
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('[ExecuteAgent] リクエストJSONパースエラー:', parseError);
      return NextResponse.json(
        { 
          error: 'Invalid JSON in request body',
          details: parseError.message || 'Failed to parse request body as JSON'
        },
        { status: 400 }
      );
    }
    
    const { workflowId, agentNodeId, agentDefinitionId, workflow, inputNodes, selectedLpRunId } = body;
    
    // 4. workflowId紐づけの欠落を潰す（クライアントからのPOST body検証）
    console.group('[ExecuteAgent] Request Body検証');
    console.log('workflowId:', workflowId);
    console.log('agentNodeId:', agentNodeId);
    console.log('agentDefinitionId:', agentDefinitionId);
    console.log('inputNodes count:', inputNodes?.length);
    
    if (!workflowId || !agentNodeId || !agentDefinitionId || !Array.isArray(inputNodes)) {
      console.error('[ExecuteAgent] 必須パラメータが欠落:', {
        hasWorkflowId: !!workflowId,
        hasAgentNodeId: !!agentNodeId,
        hasAgentDefinitionId: !!agentDefinitionId,
        hasInputNodes: Array.isArray(inputNodes),
      });
      console.groupEnd();
      return NextResponse.json(
        { error: 'workflowId, agentNodeId, agentDefinitionId, and inputNodes are required' },
        { status: 400 }
      );
    }
    console.groupEnd();
    
    // エージェント定義を取得
    const agentDefinition = await getAgentDefinitionFromKB(agentDefinitionId);
    if (!agentDefinition) {
      return NextResponse.json(
        { error: 'Agent definition not found' },
        { status: 404 }
      );
    }
    
    // Step 3: DAGベースでExecutionContextを構築
    console.group('[ExecutionContext] DAGベース構築開始');
    let context: ExecutionContext;
    // フェーズ3: Step 4-3 - qualityCheckをスコープ外で定義（フォールバックパスでも使用）
    let qualityCheck: QualityCheckResult;
    let qualityStatus: 'usable' | 'regenerate_recommended' | 'insufficient_evidence' = 'usable';
    
    try {
      // ワークフロー全体を取得（POST bodyから優先、なければDBから取得）
      let workflow = body.workflow;
      if (!workflow) {
        workflow = await getWorkflow(workflowId);
      }
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      
      // DAGベースでExecutionContextを構築
      context = await buildExecutionContextFromDAG(workflow, agentNodeId);
      
      console.log('✓ DAGベース構築完了:', {
        packetsCount: context.packets?.length || 0,
        orderedNodeIds: context.trace?.orderedNodeIds.length || 0,
        edgesUsed: context.trace?.edgesUsed.length || 0,
      });
      
      // 【追加】デバッグログ: inputsFullの各inputについて詳細を出力
      if (process.env.NODE_ENV === 'development' && context.inputsFull && context.inputsFull.length > 0) {
        console.log('[execute-agent] inputsFull詳細:');
        console.table(context.inputsFull.map((input) => ({
          kind: input.kind,
          refId: input.refId || 'N/A',
          payloadType: typeof input.payloadRaw,
          size: typeof input.payloadRaw === 'string' 
            ? input.payloadRaw.length 
            : JSON.stringify(input.payloadRaw || {}).length,
          hasArray: Array.isArray(input.payloadRaw),
          hasObject: typeof input.payloadRaw === 'object' && input.payloadRaw !== null && !Array.isArray(input.payloadRaw),
        })));
      }
      
      // フェーズ3: Step 4-3 - 品質チェック（実行前、文脈の欠落検知）
      console.group('[QualityGate] 入力品質チェック（文脈の欠落検知）');
      qualityCheck = validateInputQuality(context);
      console.log('品質チェック結果:', qualityCheck);
      
      // Step 4-3: エラーは実行をブロックしない（警告のみ）
      // ただし、重大なエラーの場合は警告として記録
      if (qualityCheck.errors.length > 0) {
        console.warn('[QualityGate] 警告（実行は継続）:', qualityCheck.errors);
        // エラーも警告として扱う
        qualityCheck.warnings.push(...qualityCheck.errors);
        qualityCheck.errors = [];
      }
      
      if (qualityCheck.warnings.length > 0) {
        console.warn('[QualityGate] 警告:', qualityCheck.warnings);
      }
      
      // Step 4-3: 品質ステータスを決定
      if (qualityCheck.warnings.length >= 3 || qualityCheck.missingInputs.includes('ナレッジベース（knowledge）')) {
        qualityStatus = 'insufficient_evidence'; // 根拠不足
      } else if (qualityCheck.warnings.length >= 1) {
        qualityStatus = 'regenerate_recommended'; // 再生成推奨
      } else {
        qualityStatus = 'usable';
      }
      
      console.log('品質ステータス:', qualityStatus);
      console.groupEnd();
      
      // Orchestratorエージェントの場合、選択されたLP runからLP構成案を取得
      if (selectedLpRunId) {
        const { getKBItem } = await import('@/kb/db-server');
        const { WorkflowRunPayload } = await import('@/kb/types');
        const lpRunItem = await getKBItem(selectedLpRunId);
        if (lpRunItem) {
          const runPayload = lpRunItem.payload as WorkflowRunPayload;
          if (runPayload.output && runPayload.output.type === 'lp_structure') {
            context.lp_structure = {
              runId: selectedLpRunId,
              payload: runPayload.output,
            };
            context.referencedKbItemIds?.push(selectedLpRunId);
            console.log('✓ lp_structure:', { runId: selectedLpRunId });
          }
        }
      }
    } catch (dagError: any) {
      console.warn('[ExecutionContext] DAGベース構築失敗、従来方式にフォールバック:', dagError.message);
      
      // フォールバック: 従来の方式（後方互換性）
      context = {
        knowledge: [],
        referencedKbItemIds: [],
      };
      
      // フェーズ3: Step 4-3 - フォールバックパスでも品質チェックを実行
      qualityCheck = validateInputQuality(context);
      console.log('[フォールバック] 品質チェック結果:', qualityCheck);
      
      // エラーは警告として扱う
      if (qualityCheck.errors.length > 0) {
        qualityCheck.warnings.push(...qualityCheck.errors);
        qualityCheck.errors = [];
      }
      
      // フォールバックパスでも品質ステータスを決定
      if (qualityCheck.warnings.length >= 3 || qualityCheck.missingInputs.includes('ナレッジベース（knowledge）')) {
        qualityStatus = 'insufficient_evidence';
      } else if (qualityCheck.warnings.length >= 1) {
        qualityStatus = 'regenerate_recommended';
      } else {
        qualityStatus = 'usable';
      }
      
      for (const inputNodeData of inputNodes) {
        const { inputKind, refId, refKind } = inputNodeData;
        if (!refId) continue;
        
        if (inputKind === 'product') {
          const { getProduct } = await import('@/lib/product-db');
          const product = getProduct(refId);
          if (product) {
            context.product = {
              id: product.productId,
              name: product.name,
              category: product.category,
              description: product.description,
            };
          }
        } else if (inputKind === 'persona') {
          const { getKBItem } = await import('@/kb/db-server');
          const personaItem = await getKBItem(refId);
          if (personaItem && personaItem.payload.type === 'persona') {
            context.persona = {
              id: personaItem.kb_id,
              ...personaItem.payload,
            };
            context.referencedKbItemIds?.push(personaItem.kb_id);
          }
        } else if (inputKind === 'kb_item') {
          const { getKBItem } = await import('@/kb/db-server');
          const knowledgeItem = await getKBItem(refId);
          if (knowledgeItem) {
            context.knowledge.push({
              kind: refKind || knowledgeItem.type,
              id: knowledgeItem.kb_id,
              title: knowledgeItem.title,
              payload: knowledgeItem.payload,
            });
            context.referencedKbItemIds?.push(knowledgeItem.kb_id);
          }
        } else if (inputKind === 'workflow_run_ref') {
          const { getKBItem } = await import('@/kb/db-server');
          const { WorkflowRunPayload } = await import('@/kb/types');
          const runItem = await getKBItem(refId);
          if (runItem && runItem.type === 'workflow_run') {
            const runPayload = runItem.payload as WorkflowRunPayload;
            const finalOutput = runPayload.finalOutput || runPayload.output;
            if (finalOutput) {
              if (!context.inputs) {
                context.inputs = {};
              }
              context.inputs[`workflow_run_${refId}`] = {
                kind: 'workflow_run_output',
                runId: refId,
                output: finalOutput,
              };
              if (!context.referencedRunIds) {
                context.referencedRunIds = [];
              }
              context.referencedRunIds.push(refId);
              context.referencedKbItemIds?.push(refId);
            }
          }
        } else if (inputKind === 'intent') {
          // Intentノード（フォールバック時）
          // inputNodesからintentPayloadを取得する必要があるが、現在の構造では取得できない
          // この場合は、ワークフローから取得する必要がある
        }
      }
      
      // knowledge投入順序を固定
      context.knowledge.sort((a, b) => {
        const order: Record<string, number> = {
          'banner_insight': 1,
          'market_insight': 2,
          'strategy_option': 3,
          'planning_hook': 4,
          'banner_auto_layout': 5,
        };
        return (order[a.kind] || 999) - (order[b.kind] || 999);
      });
      
      if (selectedLpRunId) {
        const { getKBItem } = await import('@/kb/db-server');
        const { WorkflowRunPayload } = await import('@/kb/types');
        const lpRunItem = await getKBItem(selectedLpRunId);
        if (lpRunItem) {
          const runPayload = lpRunItem.payload as WorkflowRunPayload;
          if (runPayload.output && runPayload.output.type === 'lp_structure') {
            context.lp_structure = {
              runId: selectedLpRunId,
              payload: runPayload.output,
            };
            context.referencedKbItemIds?.push(selectedLpRunId);
          }
        }
      }
    }
    
    // ExecutionContextサマリーを生成
    const inputSummary = buildExecutionContextSummary(context);
    console.log('ExecutionContextサマリー:', inputSummary);
    
    // デバッグ: ExecutionContextの詳細をログ出力
    console.log('[ExecutionContext詳細]', {
      hasProduct: !!context.product,
      productName: context.product?.name || 'なし',
      hasPersona: !!context.persona,
      personaId: context.persona?.id || 'なし',
      knowledgeCount: context.knowledge.length,
      knowledgeTitles: context.knowledge.map(k => k.title),
      packetsCount: context.packets?.length || 0,
      packetKinds: context.packets?.map(p => p.kind) || [],
    });
    
    if (context.trace) {
      console.log('DAGトレース:', {
        orderedNodeIds: context.trace.orderedNodeIds,
        edgesUsed: context.trace.edgesUsed.length,
      });
    }
    console.groupEnd();
    
      // Step 3: 品質チェックは既に実行済み（上記で実行）
    
    // エージェント定義のバージョンハッシュを生成
    const agentVersionHash = generateAgentVersionHash(agentDefinition);
    console.log('Agent定義:', {
      id: agentDefinition.id,
      name: agentDefinition.name,
      updatedAt: agentDefinition.updatedAt,
      versionHash: agentVersionHash,
    });
    
    // userPromptTemplateにデータを差し込み（コンテキスト長管理機能付き）
    // 最大100,000トークン（安全マージン込み、実際のAPI制限は128,000トークン）
    const userPrompt = buildUserPrompt(agentDefinition.userPromptTemplate, context, {
      maxContextTokens: 100000,
      maxKnowledgeItemTokens: 20000,
    });
    
    // コンテキスト長をログ出力
    const estimatedTokens = Math.ceil(userPrompt.length / 2); // 簡易推定（日本語中心）
    console.log(`[ExecuteAgent] User Prompt 長さ: ${userPrompt.length}文字、推定トークン数: ${estimatedTokens}`);
    
    if (estimatedTokens > 120000) {
      console.warn(`[ExecuteAgent] ⚠️ コンテキストが非常に長いです（推定${estimatedTokens}トークン）。API制限（128,000トークン）に近づいています。`);
    }
    
    console.log('User Prompt (先頭200文字):', userPrompt.substring(0, 200));
    
    // LLMに送信
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is not set' },
        { status: 500 }
      );
    }
    
    // 【追加】OpenAIのモデル利用はやめ、Claudeに統一
    const model = 'anthropic/claude-3.5-sonnet';
    console.log('LLM呼び出し開始:', { 
      model, 
      timestamp: new Date().toISOString() 
    });
    
    // タイムアウト設定（4分30秒、API全体のタイムアウトより短く）
    const llmTimeoutMs = 4.5 * 60 * 1000;
    const llmController = new AbortController();
    const llmTimeoutId = setTimeout(() => {
      llmController.abort();
      console.error('[ExecuteAgent] LLM呼び出しタイムアウト');
    }, llmTimeoutMs);
    
    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010',
          'X-Title': 'Marketing AI Beta',
        },
        signal: llmController.signal, // タイムアウト用
        body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            // ユーザーのSystem Promptを優先し、ツール側の指示は最小限に
            content: agentDefinition.systemPrompt || 'あなたはマーケティング企画の専門家です。',
          },
          {
            role: 'user',
            // ユーザーのUser Prompt Templateを優先し、技術要件のみ最小限に追加
            content: `${userPrompt}

【技術要件】
- 出力は有効なJSON形式のみで、説明文やエラーメッセージは含めないでください
- マークダウンコードブロック（\`\`\`json）は使用せず、直接JSONオブジェクトを出力してください
- 出力JSONには必ず\`presentation\`フィールドを含めてください
- \`presentation\`はマーケターが読みやすい表示構造です。JSONをそのまま表示せず、適切な粒度でカード/箇条書き/タイムラインなどに構造化してください
- \`presentation\`の構造: { title: string, blocks: Array<{ id: string, type: 'hero'|'bullets'|'cards'|'table'|'timeline'|'copyBlocks'|'imagePrompts'|'markdown', label: string, ... }> }`,
          },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }, // JSON形式を強制
        }),
      });
      
      clearTimeout(llmTimeoutId);
    } catch (fetchError: any) {
      clearTimeout(llmTimeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('LLM呼び出しがタイムアウトしました（4分30秒）。モデルの応答が遅い可能性があります。');
      }
      throw fetchError;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to execute agent';
      let errorDetails: any = errorText;
      
      // HTMLエラーページの場合は詳細メッセージを生成
      if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
        errorMessage = `OpenRouter API returned HTML error page (HTTP ${response.status})`;
        errorDetails = `Server returned HTML instead of JSON. This usually indicates a server error or misconfiguration.`;
      } else {
        // JSONとしてパースを試みる
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
          errorDetails = errorJson;
          
          // コンテキスト長超過エラーの場合、より分かりやすいメッセージを生成
          if (errorMessage.includes('maximum context length') || errorMessage.includes('context length')) {
            errorMessage = `コンテキスト長超過エラー: ${errorMessage}\n\n解決策:\n- 接続されているナレッジアイテムの数を減らす\n- ナレッジアイテムの内容を要約する\n- 不要な接続を削除する`;
            console.error('[ExecuteAgent] コンテキスト長超過:', {
              estimatedTokens,
              errorMessage,
            });
          }
        } catch (parseError) {
          // JSONでない場合はテキストをそのまま使用
          errorDetails = errorText.substring(0, 500);
          
          // テキスト内にコンテキスト長関連のキーワードがあるかチェック
          if (errorText.includes('maximum context length') || errorText.includes('context length')) {
            errorMessage = `コンテキスト長超過エラー: リクエストされたコンテキストがAPIの最大許容長を超えています。\n\n解決策:\n- 接続されているナレッジアイテムの数を減らす\n- ナレッジアイテムの内容を要約する\n- 不要な接続を削除する`;
            console.error('[ExecuteAgent] コンテキスト長超過（テキスト形式）:', {
              estimatedTokens,
              errorPreview: errorText.substring(0, 200),
            });
          }
        }
      }
      
      console.error('[ExecuteAgent] OpenRouter API error:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage,
        errorDetails,
        estimatedTokens,
      });
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: errorDetails,
          httpStatus: response.status,
          estimatedTokens: estimatedTokens > 0 ? estimatedTokens : undefined,
        },
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
    }
    
    const data = await response.json();
    let output = data.choices[0]?.message?.content || '';
    const llmRawOutput = output; // 生出力を保存
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    
    console.log('LLM応答受信:', {
      length: output.length,
      durationMs,
      model: data.model || model,
    });
    console.log('LLM Raw Output (先頭500文字):', output.substring(0, 500));
    
    // Step2: 出力をパースしてZod検証（最大1回リトライ）
    let parsedOutput: any;
    let validationError: any = null;
    const maxRetries = 1; // Step2: 自動再生成は最大1回に減らし
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        // JSON形式で出力されることを期待
        // マークダウンコードブロックからJSONを抽出
        const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : output;
        parsedOutput = JSON.parse(jsonText.trim());
        
        // Zodスキーマで検証
        const outputSchema = agentDefinition.outputSchema || agentDefinition.outputKind;
        if (outputSchema && OUTPUT_SCHEMA_MAP[outputSchema]) {
          const schema = OUTPUT_SCHEMA_MAP[outputSchema];
          const validationResult = schema.safeParse(parsedOutput);
          
          if (!validationResult.success) {
            validationError = validationResult.error;
            const zodIssues = validationResult.error.errors.map((err: any) => ({
              path: err.path.join('.'),
              message: err.message,
            }));
            console.warn(`[ExecuteAgent] Zod検証失敗 (attempt ${retryCount + 1}/${maxRetries + 1}):`, zodIssues);
            
            // リトライ可能な場合
            if (retryCount < maxRetries) {
              // LLMに再生成を依頼
              const retryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                  'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010',
                  'X-Title': 'Marketing AI Beta',
                },
                  body: JSON.stringify({
                    model: 'anthropic/claude-3.5-sonnet',
                    messages: [
                      {
                        role: 'system',
                        content: `${agentDefinition.systemPrompt}

【重要】出力形式について：
- 必ず有効なJSON形式で出力してください
- 説明文やエラーメッセージは出力しないでください
- JSONのみを出力してください
- マークダウンコードブロック（\`\`\`json）は使用しないでください
- 直接JSONオブジェクトを出力してください`,
                      },
                      {
                        role: 'user',
                        content: `${userPrompt}

【重要】前回の出力がスキーマ検証に失敗しました。以下のエラーを修正して、正しいJSON形式で出力してください。

検証エラー:
${JSON.stringify(validationResult.error.format(), null, 2)}

【必須修正事項】
- execSummaryフィールドは必須です（1〜3行の結論、500文字以内）。必ず含めてください。
- finalCvフィールドは必須です。以下の形式で含めてください：
  {
    "finalCv": {
      "ctaHint": "CTA文脈の指示（必須）"
    }
  }
- avoidフィールドは必ず配列（文字列の配列）で出力すること。文字列では不可。
- lpShouldAnswerフィールドは必ず配列（文字列の配列）で出力すること。文字列では不可。
- subElementsフィールドも必ず配列（文字列の配列）で出力すること。
- patternフィールドは必ず日本語の値（「共感訴求型」「ベネフィット訴求型」など）を使用すること。

【LP構成案の場合の必須フィールド】
- execSummary: 必須（このLPで何を成立させるか、1〜3行）
- finalCv.ctaHint: 必須（CTA文脈の指示）

【バナー構成案の場合の必須フィールド】
- execSummary: 必須（今回の勝ち筋の結論、1〜3行）
- designNotes: 必須（ビジュアル指示：構図、被写体、トーン、文字量、NG表現、ブランド整合など）
- lpSplit.roleOfBanner: 必須（バナーの役割）

必ず指定されたスキーマに完全に一致するJSONを出力してください。説明文やエラーメッセージは含めないでください。JSONオブジェクトのみを出力してください。`,
                      },
                    ],
                    temperature: 0.5, // リトライ時は温度を下げる
                    response_format: { type: 'json_object' }, // JSON形式を強制
                  }),
              });
              
              if (!retryResponse.ok) {
                const errorText = await retryResponse.text();
                let errorMessage = 'Failed to retry LLM call';
                try {
                  const errorJson = JSON.parse(errorText);
                  errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
                } catch (parseError) {
                  if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
                    errorMessage = `APIエラー (${retryResponse.status}): HTMLエラーページが返されました。`;
                  } else {
                    errorMessage = `APIエラー (${retryResponse.status}): ${errorText.substring(0, 200)}`;
                  }
                }
                throw new Error(errorMessage);
              }
              
              const retryData = await retryResponse.json();
              output = retryData.choices[0]?.message?.content || '';
              retryCount++;
              continue; // リトライ
            } else {
              // Step2: 最大リトライ回数に達した場合は、raw保存で終了（エラーをthrowしない）
              const zodIssues = validationResult.error.errors.map((err: any) => ({
                path: err.path.join('.'),
                message: err.message,
              }));
              console.warn(`[ExecuteAgent] Zod検証失敗（リトライ上限到達）:`, zodIssues);
              // parsedOutputはそのまま使用（検証失敗でも保存する）
              validationError = validationResult.error;
              break; // ループを抜ける（エラーをthrowしない）
            }
          } else {
            // 検証成功
            parsedOutput = validationResult.data;
            validationError = null;
            console.log('✓ Zod検証成功');
            break; // ループを抜ける
          }
        } else {
          // スキーマが定義されていない場合はそのまま使用
          break;
        }
      } catch (parseError: any) {
        if (retryCount < maxRetries) {
          // JSONパースエラーの場合もリトライ
          console.warn(`[ExecuteAgent] JSON parse error (attempt ${retryCount + 1}/${maxRetries + 1}):`, parseError.message);
          
          const retryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010',
              'X-Title': 'Marketing AI Beta',
            },
            body: JSON.stringify({
              model: 'anthropic/claude-3.5-sonnet',
              messages: [
                {
                  role: 'system',
                  content: `${agentDefinition.systemPrompt}

【重要】出力形式について：
- 必ず有効なJSON形式で出力してください
- 説明文やエラーメッセージは出力しないでください
- JSONのみを出力してください
- マークダウンコードブロック（\`\`\`json）は使用しないでください
- 直接JSONオブジェクトを出力してください`,
                },
                {
                  role: 'user',
                  content: `${userPrompt}

【重要】前回の出力がJSON形式ではありませんでした。以下のエラーを修正してください：
${parseError.message}

【必須フィールド（必ず含めること）】
- execSummary: 必須（1〜3行の結論、500文字以内）
- finalCv: 必須（LP構成案の場合）
  {
    "finalCv": {
      "ctaHint": "CTA文脈の指示（必須）"
    }
  }
- designNotes: 必須（バナー構成案の場合）

必ず有効なJSON形式で出力してください。説明文やエラーメッセージは含めないでください。JSONオブジェクトのみを出力してください。`,
                },
              ],
              temperature: 0.5,
            }),
          });
          
          if (!retryResponse.ok) {
            const errorText = await retryResponse.text();
            let errorMessage = 'Failed to retry LLM call';
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
            } catch (parseError) {
              if (errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html')) {
                errorMessage = `APIエラー (${retryResponse.status}): HTMLエラーページが返されました。`;
              } else {
                errorMessage = `APIエラー (${retryResponse.status}): ${errorText.substring(0, 200)}`;
              }
            }
            throw new Error(errorMessage);
          }
          
          const retryData = await retryResponse.json();
          output = retryData.choices[0]?.message?.content || '';
          retryCount++;
          continue;
        } else {
          // Step2: 最大リトライ回数に達した場合は、raw保存で終了（エラーをthrowしない）
          console.warn(`[ExecuteAgent] JSONパース失敗（リトライ上限到達）:`, parseError.message);
          // parsedOutputはnullのまま（llmRawOutputのみ保存）
          break; // ループを抜ける（エラーをthrowしない）
        }
      }
    }
    
    // Step2: Zod検証結果を構築（ハードエラーから品質評価へ）
    let zodValidationResult: { success: boolean; issues: Array<{ path: string; message: string }> };
    
    if (validationError) {
      // Step2: Zod失敗でもrun保存は成功扱い（statusはsuccess、validationはwarning）
      const zodIssues = validationError.errors.map((err: any) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      console.warn('[ExecuteAgent] Zod検証失敗（品質評価として記録）:', zodIssues);
      zodValidationResult = {
        success: false,
        issues: zodIssues,
      };
      // Step2: エラーをthrowしない（run保存は成功扱い）
    } else {
      // 検証成功時
      zodValidationResult = {
        success: true,
        issues: [],
      };
      console.log('✓ Zod検証成功');
    }
    
    // Step2: parsedOutputが無い場合は、llmRawOutputをそのまま使用
    if (!parsedOutput && llmRawOutput) {
      try {
        // JSONパースを試みる（失敗してもraw保存）
        const jsonMatch = llmRawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : llmRawOutput;
        parsedOutput = JSON.parse(jsonText.trim());
      } catch (e) {
        // パース失敗でも続行（raw保存）
        console.warn('[ExecuteAgent] JSONパース失敗、raw保存で続行:', e);
        parsedOutput = null;
      }
    }
    
    // Step2: presentationを抽出（parsedOutputから）
    let presentation: any = undefined;
    try {
      if (parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null && !Array.isArray(parsedOutput) && 'presentation' in parsedOutput) {
        presentation = parsedOutput.presentation;
        // presentationを検証（Zodスキーマ）
        try {
          const { PresentationModelSchema } = await import('@/kb/schemas');
          const presentationValidation = PresentationModelSchema.safeParse(presentation);
          if (!presentationValidation.success) {
            console.warn('[ExecuteAgent] presentation検証失敗:', presentationValidation.error.errors);
            // 検証失敗でもpresentationは保存（後でPresenterエージェントで再生成可能）
            // ただし、警告として記録
          } else {
            console.log('[ExecuteAgent] ✓ presentation検証成功');
          }
        } catch (validationError: any) {
          console.warn('[ExecuteAgent] presentation検証中にエラー:', validationError?.message || validationError);
          // 検証エラーでもpresentationは保存
        }
        // parsedOutputからpresentationを分離（finalOutputには含めない）
        try {
          const { presentation: _, ...finalOutputWithoutPresentation } = parsedOutput;
          parsedOutput = finalOutputWithoutPresentation;
        } catch (spreadError: any) {
          console.warn('[ExecuteAgent] parsedOutputからpresentationを分離中にエラー:', spreadError?.message || spreadError);
          // 分離に失敗した場合は、presentationフィールドを削除
          if (parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null) {
            delete (parsedOutput as any).presentation;
          }
        }
      } else {
        console.warn('[ExecuteAgent] ⚠️ presentationが含まれていません。後でPresenterエージェントで生成できます。');
      }
    } catch (presentationError: any) {
      console.error('[ExecuteAgent] presentation抽出中にエラー:', presentationError?.message || presentationError);
      // エラーが発生しても処理を続行（presentationはundefinedのまま）
    }
    
    // フェーズ3: バナー構成案の場合、derivedFrom.lpRunIdを設定
    if (agentDefinition.outputSchema === 'banner_structure' && context.lp_structure?.runId) {
      if (parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null && !Array.isArray(parsedOutput)) {
        if (!parsedOutput.derivedFrom) {
          parsedOutput.derivedFrom = {};
        }
        parsedOutput.derivedFrom.lpRunId = context.lp_structure.runId;
      }
    }
    
    // Step 4-2: 実行後品質チェック（non-blocking）
    console.group('[品質チェック] 実行後チェック');
    const semanticIssues: string[] = [];
    
    // LP構成案の品質チェック
    if (agentDefinition.outputSchema === 'lp_structure' || agentDefinition.outputKind === 'lp_structure') {
      if (parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null && !Array.isArray(parsedOutput)) {
        if (parsedOutput.questions && Array.isArray(parsedOutput.questions)) {
          if (parsedOutput.questions.length < 16) {
            semanticIssues.push(`質問数が不足しています（${parsedOutput.questions.length}問/最低16問必要）。`);
          }
        } else {
          semanticIssues.push('questionsフィールドが存在しないか、配列ではありません。');
        }
        
        if (parsedOutput.sections && Array.isArray(parsedOutput.sections)) {
          if (parsedOutput.sections.length < 6) {
            semanticIssues.push(`セクション数が不足しています（${parsedOutput.sections.length}個/最低6個必要）。`);
          }
        } else {
          semanticIssues.push('sectionsフィールドが存在しないか、配列ではありません。');
        }
      } else {
        semanticIssues.push('parsedOutputがオブジェクト形式ではありません。');
      }
      
      // intentが空かチェック
      if (!context.intent || !context.intent.goal || context.intent.goal.trim() === '') {
        semanticIssues.push('目的・意図が空です。');
      }
      
      // 根拠（knowledge）が0件かチェック
      if (context.knowledge.length === 0) {
        semanticIssues.push('根拠（ナレッジ）が0件です。');
      }
    }
    
    // バナー構成案の品質チェック
    if (agentDefinition.outputSchema === 'banner_structure' || agentDefinition.outputKind === 'banner_structure') {
      if (parsedOutput.bannerIdeas && Array.isArray(parsedOutput.bannerIdeas)) {
        if (parsedOutput.bannerIdeas.length === 0) {
          semanticIssues.push('バナー案が0件です。');
        }
      } else {
        semanticIssues.push('bannerIdeasフィールドが存在しないか、配列ではありません。');
      }
      
      if (!parsedOutput.execSummary || parsedOutput.execSummary.trim() === '') {
        semanticIssues.push('execSummary（結論）が空です。');
      }
      
      if (!parsedOutput.designNotes || parsedOutput.designNotes.trim() === '') {
        semanticIssues.push('designNotes（ビジュアル指示）が空です。');
      }
    }
    
    // semanticValidationResultを構築
    const semanticValidationResult: ValidationResult['semantic'] = {
      pass: semanticIssues.length === 0,
      reasons: semanticIssues.length > 0 ? semanticIssues : ['品質チェックを通過しました'],
    };
    
    if (semanticIssues.length > 0) {
      console.warn('[品質チェック] 実行後チェックで問題を検出:', semanticIssues);
    } else {
      console.log('[品質チェック] ✓ 実行後チェックを通過');
    }
    console.groupEnd();
    
    // Step 4: Context Traceを構築（文脈紡ぎの記録）
    const contextTrace = {
      referencedNodeIds: context.trace?.orderedNodeIds || [],
      referencedRunIds: context.referencedRunIds || [],
      contextBuildLog: (context.packets || []).map((packet) => ({
        nodeId: packet.nodeId,
        nodeType: packet.nodeType,
        kind: packet.kind,
        title: packet.title,
        extractedAt: packet.createdAt,
      })),
      contextSections: {
        goal: (context.packets || [])
          .filter((p) => p.kind === 'intent')
          .map((p) => ({ nodeId: p.nodeId, content: p.content })),
        product: (context.packets || [])
          .filter((p) => p.kind === 'product')
          .map((p) => ({ nodeId: p.nodeId, content: p.content })),
        persona: (context.packets || [])
          .filter((p) => p.kind === 'persona')
          .map((p) => ({ nodeId: p.nodeId, content: p.content })),
        knowledge: (context.packets || [])
          .filter((p) => p.kind === 'kb_item')
          .map((p) => ({ nodeId: p.nodeId, content: p.content })),
        upstreamOutputs: (context.packets || [])
          .filter((p) => p.kind === 'agent_output' || p.kind === 'workflow_run_ref')
          .map((p) => ({ nodeId: p.nodeId, content: p.content })),
      },
    };
    
    // フェーズ3: Step 4-3 - 最終品質チェック結果を統合（実行前 + 実行後）
    const finalQualityCheck = {
      errors: qualityCheck.errors,
      warnings: [
        ...qualityCheck.warnings,
        ...(semanticIssues.length > 0 ? semanticIssues : []),
      ],
      missingInputs: qualityCheck.missingInputs,
    };
    
    // ステータス判定: usable / regenerate_recommended / insufficient_evidence
    let finalQualityStatus: 'usable' | 'regenerate_recommended' | 'insufficient_evidence' = 'usable';
    if (finalQualityCheck.errors.length > 0) {
      // エラーがある場合は実行不可なのでここには来ないが、念のため
      finalQualityStatus = 'insufficient_evidence';
    } else if (finalQualityCheck.warnings.length >= 3 || semanticIssues.length > 0) {
      // 警告が3つ以上、または実行後チェックで問題がある場合は再生成推奨
      finalQualityStatus = 'regenerate_recommended';
    } else if (finalQualityCheck.warnings.length > 0) {
      // 警告があるが少ない場合は利用可能だが注意
      finalQualityStatus = 'usable';
    } else {
      // 警告なし
      finalQualityStatus = 'usable';
    }
    
    console.log('[QualityGate] 最終品質ステータス:', {
      status: finalQualityStatus,
      errors: finalQualityCheck.errors.length,
      warnings: finalQualityCheck.warnings.length,
      semanticIssues: semanticIssues.length,
    });
    
    // workflow_runをKBに保存（正規化版）
    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // 1. 保存フォーマットを単一正規にする（表示に必要な最小セットを必ず埋める）
    const outputKind = agentDefinition.outputKind || agentDefinition.outputSchema || 'lp_structure';
    const outputSchemaRef = agentDefinition.outputSchemaRef;
    
    let workflowRunPayload: any;
    try {
      console.log('[ExecuteAgent] workflowRunPayload作成開始:', {
        hasParsedOutput: !!parsedOutput,
        //hasFinalOutput: !!finalOutput,
        hasPresentation: !!presentation,
        zodSuccess: zodValidationResult?.success,
      });
      
      workflowRunPayload = normalizeRunPayloadForSave({
      type: 'workflow_run',
      workflowId, // 必須
      agentNodeId, // 必須
      agentId: agentDefinitionId,
      
      // 実行情報
      executedAt: finishedAt,
      startedAt,
      finishedAt,
      durationMs,
      model: data.model || model,
      
      // エージェント定義の完全特定（必須）
      agentDefinitionId: agentDefinition.id, // 必須
      agentDefinitionUpdatedAt: agentDefinition.updatedAt,
      agentDefinitionVersionHash: agentVersionHash,
      
      // 1. 表示に必要な最小セット（必須）
      outputKind, // 必須
      outputSchemaRef, // 任意だが入れると強い
      
      // 入力（完全なスナップショット + サマリー）
      inputsSnapshot: context,
      inputSummary,
      
      // Step 4: Context Trace（文脈紡ぎの記録）
      contextTrace,
      
      // フェーズ3: Step 4-3 - 品質チェック結果（文脈の欠落検知）
      contextQuality: {
        errors: finalQualityCheck.errors,
        warnings: finalQualityCheck.warnings,
        missingInputs: finalQualityCheck.missingInputs,
        status: finalQualityStatus,
      },
      
      // 出力（全段階）
      llmRawOutput: llmRawOutput.length > 10000 ? llmRawOutput.substring(0, 10000) + '... (truncated)' : llmRawOutput,
      parsedOutput,
      zodValidationResult,
      semanticValidationResult, // Step 4-2: 実行後品質チェック結果
      // Step2: finalOutputは検証成功時のみ設定、失敗時はparsedOutputまたはnull
      // フェーズ4: v2正規化（保存前に必ずv2に変換）
      finalOutput: (() => {
        try {
          if (zodValidationResult.success && parsedOutput) {
            return normalizeFinalOutputToV2(parsedOutput);
          } else if (parsedOutput) {
            return normalizeFinalOutputToV2(parsedOutput);
          }
          return null;
        } catch (normalizeError: any) {
          console.error('[ExecuteAgent] finalOutput正規化エラー:', {
            message: normalizeError?.message,
            parsedOutputType: typeof parsedOutput,
            hasParsedOutput: !!parsedOutput,
            zodSuccess: zodValidationResult?.success,
          });
          // 正規化に失敗した場合はparsedOutputをそのまま返す
          return parsedOutput || null;
        }
      })(),
      // Step2: Presentation（ViewModel）を保存
      presentation: presentation,
      
      // 従来のフィールド（後方互換）
      output: parsedOutput || llmRawOutput, // Step2: parsedOutputが無い場合はllmRawOutput
      status: 'success', // Step2: Zod失敗でもrun保存は成功扱い
    });
    
    console.log('[ExecuteAgent] normalizeRunPayloadForSave成功:', {
      hasPayload: !!workflowRunPayload,
      payloadType: typeof workflowRunPayload,
      payloadKeys: workflowRunPayload ? Object.keys(workflowRunPayload) : [],
      hasPresentation: !!workflowRunPayload?.presentation,
      presentationType: typeof workflowRunPayload?.presentation,
    });
    
    } catch (normalizeError: any) {
      console.error('[ExecuteAgent] normalizeRunPayloadForSaveエラー:', {
        message: normalizeError?.message,
        stack: normalizeError?.stack?.split('\n').slice(0, 5).join('\n'),
        name: normalizeError?.name,
        hasParsedOutput: !!parsedOutput,
        hasPresentation: !!presentation,
        parsedOutputType: typeof parsedOutput,
      });
      throw new Error(`ワークフロー実行ペイロードの正規化に失敗しました: ${normalizeError?.message || '不明なエラー'}`);
    }
    
    // Step5: 計測ログ追加（原因切り分け）
    const contract = agentDefinition?.outputViewContract;
    const contractTitlePath = contract?.summary?.titlePath;
    const contractSubtitleTemplate = contract?.summary?.subtitleTemplate;
    const titlePathResolvedValue = contractTitlePath && parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null
      ? getDataByPath(parsedOutput, contractTitlePath)
      : null;
    const summaryItems = contract?.summary?.items || [];
    const summaryItemValueTypes = summaryItems.map((item) => {
      const value = item.path && parsedOutput && typeof parsedOutput === 'object' && parsedOutput !== null
        ? getDataByPath(parsedOutput, item.path)
        : null;
      return {
        label: item.label,
        path: item.path,
        valueType: value === null || value === undefined ? 'null' :
                   Array.isArray(value) ? 'array' :
                   typeof value === 'object' ? 'object' :
                   typeof value === 'string' ? (value.length > 200 ? 'long_string' : 'string') :
                   typeof value,
        valueLength: Array.isArray(value) ? value.length :
                     typeof value === 'string' ? value.length :
                     typeof value === 'object' ? Object.keys(value || {}).length :
                     null,
      };
    });
    
    // Step5: 計測ログ追加（原因切り分け）
    console.log('[ExecuteAgent] Run保存前計測:', {
      runId,
      hasFinal: !!workflowRunPayload.finalOutput,
      hasParsed: !!workflowRunPayload.parsedOutput,
      hasRaw: !!workflowRunPayload.llmRawOutput,
      zodValidationSuccess: zodValidationResult.success,
      contractTitlePath: contractTitlePath || 'N/A',
      contractSubtitleTemplate: contractSubtitleTemplate || 'N/A',
      titlePathResolvedValue: titlePathResolvedValue !== null && titlePathResolvedValue !== undefined 
        ? (typeof titlePathResolvedValue === 'object' ? '[object]' : String(titlePathResolvedValue).substring(0, 100))
        : 'null',
      titlePathResolvedValueType: titlePathResolvedValue !== null && titlePathResolvedValue !== undefined
        ? (Array.isArray(titlePathResolvedValue) ? 'array' : typeof titlePathResolvedValue)
        : 'null',
      summaryItemValueTypes,
    });
    
    // ヘルパー関数: pathに基づいてデータを取得
    function getDataByPath(obj: any, path: string | undefined): any {
      if (!path) return obj;
      // JSONPath形式（$で始まる）の場合は$を除去
      let normalizedPath = path.startsWith('$.') ? path.substring(2) : path;
      // 配列インデックス対応（例: bannerIdeas[0]）
      const arrayMatch = normalizedPath.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const basePath = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        const baseValue = getDataByPath(obj, basePath);
        if (Array.isArray(baseValue) && baseValue[index] !== undefined) {
          return baseValue[index];
        }
        return null;
      }
      const keys = normalizedPath.split('.');
      let current = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return null;
        }
      }
      return current;
    }
    
    // 4. workflowId紐づけの欠落を潰す（保存時検証）
    if (!workflowRunPayload.workflowId || workflowRunPayload.workflowId === '') {
      throw new Error(`workflowId is required but missing. workflowId=${workflowId}, agentNodeId=${agentNodeId}`);
    }
    if (!workflowRunPayload.agentNodeId || workflowRunPayload.agentNodeId === '') {
      throw new Error(`agentNodeId is required but missing. workflowId=${workflowId}, agentNodeId=${agentNodeId}`);
    }
    
    // 保存直前の検証ログ（1. 保存対象オブジェクトの検証）
    console.log('[ExecuteAgent] 保存直前検証:', {
      runId,
      workflowId: workflowRunPayload.workflowId,
      agentNodeId: workflowRunPayload.agentNodeId,
      agentId: workflowRunPayload.agentId,
      payloadType: typeof workflowRunPayload,
      payloadKeys: workflowRunPayload ? Object.keys(workflowRunPayload) : [],
      hasPayload: !!workflowRunPayload,
      payloadTypeField: workflowRunPayload?.type,
      hasFinalOutput: !!workflowRunPayload?.finalOutput,
      hasParsedOutput: !!workflowRunPayload?.parsedOutput,
      outputType: parsedOutput?.type,
      zodValidation: zodValidationResult.success,
    });
    
    // KBに保存
    const { createKBItem, getKBItem } = await import('@/kb/db-server');
    let kbItemToSave: any;
   
      kbItemToSave = {
        kb_id: runId,
        type: 'workflow_run',
        title: `${agentDefinition.name} - ${new Date().toLocaleString('ja-JP')}`,
        folder_path: 'My Files/Workflow Runs',
        tags: [agentDefinition.category],
        owner_id: 'user',
        visibility: 'private',
        source_app: 'workflow-app',
        source_project_id: workflowId,
      created_at: startedAt,
      updated_at: finishedAt,
      payload: workflowRunPayload, // 正規化されたpayloadをそのまま保存
    };
    
    console.log('[ExecuteAgent] KBアイテム保存前:', {
      kb_id: kbItemToSave.kb_id,
      type: kbItemToSave.type,
      hasPayload: !!kbItemToSave.payload,
      payloadType: typeof kbItemToSave.payload,
      payloadKeys: kbItemToSave.payload ? Object.keys(kbItemToSave.payload) : [],
    });
    
    try {
      console.log('[ExecuteAgent] createKBItem呼び出し前:', {
        kb_id: kbItemToSave?.kb_id,
        type: kbItemToSave?.type,
        hasPayload: !!kbItemToSave?.payload,
        payloadType: typeof kbItemToSave?.payload,
        payloadKeys: kbItemToSave?.payload ? Object.keys(kbItemToSave.payload) : [],
        hasPresentation: !!kbItemToSave?.payload?.presentation,
        presentationType: typeof kbItemToSave?.payload?.presentation,
      });
      await createKBItem(kbItemToSave);
      console.log('[ExecuteAgent] createKBItem成功');
    } catch (saveError: any) {
      console.error('[ExecuteAgent] createKBItemエラー:', {
        message: saveError?.message,
        stack: saveError?.stack?.split('\n').slice(0, 5).join('\n'),
        name: saveError?.name,
      });
      console.error('[ExecuteAgent] 保存しようとしたKBItem:', {
        kb_id: kbItemToSave?.kb_id,
        type: kbItemToSave?.type,
        hasPayload: !!kbItemToSave?.payload,
        payloadType: typeof kbItemToSave?.payload,
        payloadKeys: kbItemToSave?.payload ? Object.keys(kbItemToSave.payload) : [],
        hasPresentation: !!kbItemToSave?.payload?.presentation,
        presentationType: typeof kbItemToSave?.payload?.presentation,
      });
      throw new Error(`ワークフロー実行結果の保存に失敗しました: ${saveError?.message || '不明なエラー'}`);
    }
    
    // 保存後のverifyログ（3. 保存が成功したか確認）
    const verify = await getKBItem(runId);
    console.log('[ExecuteAgent] 保存後verify:', {
      runId,
      found: !!verify,
      hasPayload: !!verify?.payload,
      payloadType: typeof verify?.payload,
      payloadKeys: verify?.payload ? Object.keys(verify.payload) : [],
      payloadTypeField: verify?.payload?.type,
      verifyWorkflowId: verify?.payload?.workflowId,
      verifyAgentNodeId: verify?.payload?.agentNodeId,
      verifyKbId: verify?.kb_id,
    });
    
    if (!verify || !verify.payload) {
      console.error('[ExecuteAgent] ⚠️ 保存失敗: payloadが保存されていません', {
        runId,
        verifyExists: !!verify,
        verifyPayload: verify?.payload,
      });
    }
    
    console.groupEnd();
    
    return NextResponse.json({
      success: true,
      output: parsedOutput,
      rawOutput: output,
      runId,
      durationMs,
      model: data.model || model,
    });
  } catch (error: any) {
    console.error('[ExecuteAgent] エラー:', error);
    console.error('[ExecuteAgent] エラースタック:', error.stack);
    console.error('[ExecuteAgent] エラー詳細:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 10).join('\n'),
      body: body ? { workflowId: body.workflowId, agentNodeId: body.agentNodeId, agentDefinitionId: body.agentDefinitionId } : null,
    });
    console.groupEnd();
    const finishedAt = new Date().toISOString();
    
    // エラーメッセージを詳細化
    const errorMessage = error?.message || String(error) || 'Unknown error';
    const errorStack = error?.stack || '';
    const errorName = error?.name || 'Error';
    
    // エラー時もworkflow_runを保存（bodyが存在する場合のみ）
    if (body) {
      try {
        const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const errorContext: ExecutionContext = {
          knowledge: [],
        };
        
        // 可能な限りcontextを再構築
        try {
          for (const inputNodeData of (body.inputNodes || [])) {
          const { inputKind, refId } = inputNodeData;
          if (!refId) continue;
          
          if (inputKind === 'product') {
            const { getProduct } = await import('@/lib/product-db');
            const product = getProduct(refId);
            if (product) {
              errorContext.product = {
                id: product.productId,
                name: product.name,
              };
            }
          } else if (inputKind === 'persona') {
            errorContext.persona = { id: refId };
          } else if (inputKind === 'kb_item') {
            errorContext.knowledge.push({
              kind: 'unknown',
              id: refId,
              payload: {},
            });
          }
        }
      } catch (contextError) {
        console.error('Failed to rebuild context for error:', contextError);
      }
      
      // エラー時のExecutionContextサマリーを生成
      const errorInputSummary = buildExecutionContextSummary(errorContext);
      
      const workflowRunPayload = normalizeRunPayloadForSave({
        type: 'workflow_run',
        workflowId: body.workflowId || '',
        agentNodeId: body.agentNodeId || '',
        agentId: body.agentDefinitionId || '',
        
        // 実行情報
        executedAt: finishedAt,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startTime,
        model: 'unknown',
        
        // エージェント定義の完全特定
        agentDefinitionId: body.agentDefinitionId || '',
        agentDefinitionUpdatedAt: undefined,
        agentDefinitionVersionHash: undefined,
        
        // 入力（完全なスナップショット + サマリー）
        inputsSnapshot: errorContext,
        inputSummary: errorInputSummary,
        
        // 出力（全段階）
        llmRawOutput: undefined,
        parsedOutput: undefined,
        zodValidationResult: { success: false, issues: [] },
        finalOutput: null,
        
        // 従来のフィールド（後方互換）
        output: null,
        status: 'error',
        error: error.message || 'Unknown error',
      });
      
      const { createKBItem, getKBItem } = await import('@/kb/db-server');
      const agentDefinition = await getAgentDefinitionFromKB(body.agentDefinitionId || '');
      
      // エラー時の保存直前検証
      console.log('[ExecuteAgent] エラー時保存直前検証:', {
        runId,
        payloadType: typeof workflowRunPayload,
        payloadKeys: workflowRunPayload ? Object.keys(workflowRunPayload) : [],
        hasPayload: !!workflowRunPayload,
        payloadTypeField: workflowRunPayload?.type,
      });
      
      const errorKbItem = {
        kb_id: runId,
        type: 'workflow_run',
        title: `エラー: ${agentDefinition?.name || 'Unknown'} - ${new Date().toLocaleString('ja-JP')}`,
        folder_path: 'My Files/Workflow Runs',
        tags: ['error'],
        owner_id: 'user',
        visibility: 'private',
        source_app: 'workflow-app',
        source_project_id: body.workflowId || '',
        created_at: startedAt,
        updated_at: finishedAt,
        payload: workflowRunPayload, // 正規化されたpayloadをそのまま保存
      };
      
      await createKBItem(errorKbItem);
      
      // エラー時の保存後verify
      const errorVerify = await getKBItem(runId);
      console.log('[ExecuteAgent] エラー時保存後verify:', {
        runId,
        found: !!errorVerify,
        hasPayload: !!errorVerify?.payload,
        payloadType: typeof errorVerify?.payload,
        payloadKeys: errorVerify?.payload ? Object.keys(errorVerify.payload) : [],
      });
      } catch (saveError) {
        console.error('Failed to save error run:', saveError);
      }
    }
    
    // 必ずJSONレスポンスを返す（HTMLエラーページを返さない）
    return NextResponse.json(
      { 
        error: errorMessage,
        errorName: errorName,
        details: errorStack ? errorStack.split('\n').slice(0, 10).join('\n') : undefined,
        timestamp: finishedAt,
        // デバッグ用情報
        debug: process.env.NODE_ENV === 'development' ? {
          body: body ? { 
            workflowId: body.workflowId, 
            agentNodeId: body.agentNodeId, 
            agentDefinitionId: body.agentDefinitionId 
          } : null,
        } : undefined,
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
}




