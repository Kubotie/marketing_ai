/**
 * KBアイテム CRUD API
 * GET: 一覧（メタのみ）
 * POST: 作成
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getKBItemsMeta, getKBItem, createKBItem, generateKBTitle } from '@/kb/db-server';
import { createKBItemRequestSchema, kbPayloadSchema } from '@/kb/schemas';
import { KBItem } from '@/kb/types';
// UUID生成（簡易実装、本番ではuuidパッケージを使用）
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * GET /api/kb/items
 * 一覧取得（メタのみ）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || undefined;
    const type = searchParams.get('type') || undefined;
    const folder_path = searchParams.get('folder_path') || undefined;
    const owner_id = searchParams.get('owner_id') || undefined;
    const source_project_id = searchParams.get('source_project_id') || undefined;
    const includePayload = searchParams.get('includePayload') === 'true' || type === 'workflow_run'; // workflow_runは常にpayloadを含める

    let items: any[];
    
    if (includePayload) {
      // payloadを含めて返す（workflow_run用）
      const allItems = await getKBItemsMeta({ q, type, folder_path, owner_id });
      
      // 各アイテムのpayloadを取得
      items = [];
      for (const metaItem of allItems) {
        const fullItem = await getKBItem(metaItem.kb_id);
        if (fullItem) {
          // source_project_idでフィルタ（該当する場合）
          if (!source_project_id || fullItem.source_project_id === source_project_id) {
            items.push(fullItem); // payloadを含む完全なKBItem
          }
        }
      }
    } else {
      // メタのみ返す（従来の動作）
      items = await getKBItemsMeta({ q, type, folder_path, owner_id });
      
      // source_project_idでフィルタ（製品・サービス軸フィルタ）
      if (source_project_id) {
        const filteredItems = [];
        for (const item of items) {
          const fullItem = await getKBItem(item.kb_id);
          if (fullItem && fullItem.source_project_id === source_project_id) {
            filteredItems.push(item);
          }
        }
        items = filteredItems;
      }
    }

    // タイプ別の集計
    const typeCounts = items.reduce((acc: Record<string, number>, item: any) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});

    console.log('[API/KB] GET /api/kb/items response:', {
      type,
      includePayload,
      itemsCount: items.length,
      typeCounts,
      sampleItems: items.slice(0, 3).map((item: any) => ({
        kb_id: item.kb_id,
        type: item.type,
        title: item.title,
      })),
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('GET /api/kb/items error:', error);
    return NextResponse.json({ error: 'Failed to fetch KB items' }, { status: 500 });
  }
}

/**
 * POST /api/kb/items
 * アイテム作成
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
    console.log('[API/KB] リクエスト受信:', { type: body.type, title: body.title, payloadKeys: Object.keys(body.payload || {}) });

    // リクエストを検証
    const validated = createKBItemRequestSchema.parse(body);

    // ペイロードを個別に検証
    const payloadValidation = kbPayloadSchema.parse(validated.payload);

    // 旧形式のInsightの場合、evidence_links.target_banner_idsが空でないことを確認
    // 注意: MarketInsight/StrategyOption/PlanningHookはmeta/payload構造を持つため、
    // このチェックは旧形式のInsightのみに適用される
    // 修正後（コピー用）
if ((validated.type as string) === 'insight' && payloadValidation && typeof payloadValidation === 'object' && 'type' in payloadValidation && (payloadValidation as any).type === 'insight') {
      if (payloadValidation.evidence_links && payloadValidation.evidence_links.target_banner_ids.length === 0) {
        return NextResponse.json(
          { error: '根拠リンク（target_banner_ids）は必須です。Insightを保存するには、対象バナーIDを指定してください。' },
          { status: 400 }
        );
      }
    }

    // KBアイテムを作成
    const kbId = generateUUID();
    const now = new Date().toISOString();
    const title = validated.title || generateKBTitle(validated.type);

    const kbItem: KBItem = {
      kb_id: kbId,
      type: validated.type,
      title,
      folder_path: validated.folder_path || 'My Files',
      tags: validated.tags || [],
      owner_id: validated.owner_id || 'user',
      visibility: validated.visibility || 'private',
      source_app: validated.source_app,
      source_project_id: validated.source_project_id,
      source_refs: validated.source_refs,
      created_at: now,
      updated_at: now,
      payload: validated.payload,
    };

    console.log('[API/KB] Creating KB item:', kbItem.kb_id, kbItem.type);
    const created = await createKBItem(kbItem);
    console.log('[API/KB] KB item created successfully:', created.kb_id);

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/kb/items error:', error);
    console.error('POST /api/kb/items error body:', JSON.stringify(body, null, 2));

    // zodバリデーションエラー
    if (error.name === 'ZodError' || error.issues) {
      const zodErrors = error.issues || error.errors || [];
      console.error('POST /api/kb/items Zod validation errors:', zodErrors);
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: zodErrors,
          message: zodErrors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: error.message || 'Failed to create KB item' }, { status: 400 });
  }
}
