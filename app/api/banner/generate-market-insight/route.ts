import { NextRequest, NextResponse } from 'next/server';
import { callOpenRouterJSON } from '@/lib/openrouter';
import type { OpenRouterMessage } from '@/lib/openrouter';
import type { MarketInsightPayload } from '@/kb/common';
import { InsightPayloadBaseSchema } from '@/kb/common-schemas';
import { COMMON_SYSTEM_PROMPT } from '@/lib/insight-prompt-builder';
import type { InsightInputs } from '@/lib/insight-input-collector';

export const runtime = 'nodejs';

/**
 * C1: 市場インサイト生成API
 * 入力データから市場での勝ち筋・類型を断定調で生成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, bannerInsight } = body;

    if (!inputs) {
      return NextResponse.json(
        { error: 'inputs is required' },
        { status: 400 }
      );
    }

    const {
      layoutBboxes = [],
      texts = { ocrTexts: [], bboxTexts: [] },
      areas = { byType: {}, total: 0 },
      patternScores = [],
      activeProduct,
      personaRefs = [],
      bannerContext,
      imageId,
      productId,
    } = inputs as InsightInputs & { imageId?: string; productId?: string };

    // 入力データが空でないかチェック
    if (layoutBboxes.length === 0 && texts.ocrTexts.length === 0) {
      return NextResponse.json({
        insight: {
          meta: {
            kb_type: 'market_insight' as const,
            productId: productId || null,
            imageId: imageId || bannerContext?.imageId || '',
            generatedAt: new Date().toISOString(),
            confidence: 0.1,
          },
          payload: {
            summary: '入力データが空のため、市場インサイトを導出できません',
            insights: [],
          },
        },
      });
    }

    const userPrompt = `以下は、バナー画像の分析結果です。
これらを根拠として、指定されたアウトプットを生成してください。

# 入力情報

## 1. バナー構成要素（BBox）
${JSON.stringify(layoutBboxes.map(bbox => ({
  type: bbox.type,
  text: bbox.text || '',
  area: bbox.area,
  bbox: bbox.bbox,
})), null, 2)}

## 2. テキスト情報
- OCRテキスト: ${texts.ocrTexts.join(', ')}
- BBoxテキスト: ${JSON.stringify(texts.bboxTexts, null, 2)}

## 3. 面積統計
${JSON.stringify(areas.byType, null, 2)}
- 総面積: ${areas.total}

## 4. バナー構成パターン
${JSON.stringify(patternScores, null, 2)}

## 5. 商品情報
${activeProduct ? JSON.stringify(activeProduct, null, 2) : 'なし'}

## 6. ペルソナ情報
${personaRefs.length > 0 ? JSON.stringify(personaRefs, null, 2) : 'なし'}

---

# あなたが行う分析

## B. Step C1：市場インサイト（market_insight）
- 同カテゴリの広告が共通して使いがちな表現（仮説）
- 競合が"外していない"訴求ポイント
- 逆に避けられていそうな表現・トーン（仮説）

※ BBoxの構成比・テキスト有無・視覚要素の偏りを根拠にすること

---

# 出力ルール（最重要）

- 出力は **必ず JSON のみ**
- すべて仮説表現で書く（「可能性が高い」「示唆される」など）
- 抽象的な一般論は禁止（例：「ユーザーの期待に応えるため」は禁止）
- 各insightに必ず「根拠となったBBox type / text / areaRatio」を含める
- summaryは、一次情報から逆算した市場構造の示唆を1文で要約すること

出力例（参考）:
{
  "meta": {
    "kb_type": "market_insight",
    "productId": ${productId ? `"${productId}"` : 'null'},
    "imageId": "${imageId || ''}",
    "generatedAt": "${new Date().toISOString()}",
    "confidence": 0.69
  },
  "payload": {
    "summary": "同カテゴリでは『価格の正当化』と『短時間での価値理解』が重要視されている市場構造が示唆される。",
    "insights": [
      {
        "title": "価格明示は避けられない競争要素",
        "hypothesis": "美容液カテゴリでは価格帯が広く、ユーザーが価格比較を前提に行動するため、価格を隠さない表現が主流になっている可能性が高い。",
        "appeal_axes": ["price"],
        "structure_type": ["数字表現型"],
        "evidence": [
          {
            "bbox_type": "価格・割引情報",
            "text": "¥9,800",
            "areaRatio": 0.08
          }
        ]
      }
    ]
  }
}`;

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: COMMON_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    const result = await callOpenRouterJSON<MarketInsightPayload>(
      messages,
      'anthropic/claude-3.5-sonnet',
      0.5
    );

    // metaに必須項目を補完（検証前に実行）
    const resultWithMeta = {
      ...result,
      meta: {
kb_type: (result as any).meta?.kb_type || 'market_insight',
      productId: (result as any).meta?.productId ?? (productId || null),
      imageId: (result as any).meta?.imageId ?? (imageId || bannerContext?.imageId || null),
      generatedAt: (result as any).meta?.generatedAt || new Date().toISOString(),
        confidence: (result as any).meta?.confidence ?? 0.5,
      },
    };

    // Zod検証
    const validated = InsightPayloadBaseSchema.parse(resultWithMeta);
    
    // metaに必須項目を設定（imageIdがnullまたは空文字列の場合）
    if ((!validated.meta.imageId || validated.meta.imageId === '') && imageId) {
      validated.meta.imageId = imageId;
    }
    if (!validated.meta.generatedAt) {
      validated.meta.generatedAt = new Date().toISOString();
    }
    if (validated.meta.productId === undefined && productId) {
      validated.meta.productId = productId;
    }

    return NextResponse.json({ insight: validated });
  } catch (error) {
    console.error('[C1生成API] エラー:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
