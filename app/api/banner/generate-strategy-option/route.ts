import { NextRequest, NextResponse } from 'next/server';
import { callOpenRouterJSON } from '@/lib/openrouter';
import type { OpenRouterMessage } from '@/lib/openrouter';
import type { StrategyOptionPayload } from '@/kb/common';
import { StrategyOptionPayloadSchema } from '@/kb/common-schemas';
import { COMMON_SYSTEM_PROMPT } from '@/lib/insight-prompt-builder';

export const runtime = 'nodejs';

/**
 * C2: 戦略オプション生成API
 * C1の出力 + personaRefs + product から自社が取るべき選択肢を生成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, c1Insight } = body;

    if (!inputs || !c1Insight) {
      return NextResponse.json(
        { error: 'inputs and c1Insight are required' },
        { status: 400 }
      );
    }

    const {
      activeProduct,
      personaRefs = [],
      bannerContext,
    } = inputs;

    const userPrompt = `以下は、市場インサイトと自社条件・ペルソナ情報です。
これらを根拠として、指定されたアウトプットを生成してください。

# 入力情報

## 1. 市場インサイト（C1）
${JSON.stringify(c1Insight, null, 2)}

## 2. 商品情報
${JSON.stringify(activeProduct ? {
  name: activeProduct.name,
  category: activeProduct.category,
  description: activeProduct.description,
  competitors: activeProduct.competitors?.map((c: any) => c.name) || [],
} : null, null, 2)}

## 3. ペルソナ情報
${JSON.stringify(personaRefs.map((p: any) => ({
  summary: p.summary,
  jtbd: p.jtbd,
  topCriteria: p.topCriteria,
  misunderstoodPoint: p.misunderstoodPoint,
})), null, 2)}

---

# あなたが行う分析

## C. Step C2：戦略オプション（strategy_option）
- この市場文脈で取り得る戦略オプションを 2〜3 個
- 各オプションについて：
  - 何を強める戦略か
  - 何を捨てている戦略か
  - どんなリスクがあるか

---

# 出力ルール（最重要）

- 出力は **必ず JSON のみ**
- すべて仮説表現で書く（「可能性が高い」「示唆される」など）
- 抽象的な一般論は禁止（例：「ユーザーの期待に応えるため」は禁止）
- 各insightに必ず「根拠となったBBox type / text / areaRatio」を含める（未採用の戦略の場合はevidenceを空配列に）
- summaryは、一次情報から逆算した戦略的方向性を1文で要約すること

出力例（参考）:
{
  "meta": {
    "kb_type": "strategy_option",
    "productId": ${activeProduct?.productId ? `"${activeProduct.productId}"` : 'null'},
    "imageId": "${bannerContext?.imageId || ''}",
    "generatedAt": "${new Date().toISOString()}",
    "confidence": 0.66
  },
  "payload": {
    "summary": "本バナー構成から、3つの戦略的方向性が考えられる。",
    "insights": [
      {
        "title": "即決特化型戦略",
        "hypothesis": "価格とCTAを前面に出すことで、比較を省略し即時行動を最大化する戦略。",
        "appeal_axes": ["price", "convenience"],
        "structure_type": ["数字表現型"],
        "evidence": [
          {
            "bbox_type": "CTA",
            "text": "今すぐ購入",
            "areaRatio": 0.07
          }
        ]
      },
      {
        "title": "権威・信頼補完戦略（未採用）",
        "hypothesis": "現状は未使用だが、受賞歴・専門家推薦を追加することで不安解消を狙う拡張余地がある。",
        "appeal_axes": ["authority"],
        "structure_type": ["権威型"],
        "evidence": []
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

    const result = await callOpenRouterJSON<StrategyOptionPayload>(
      messages,
      'anthropic/claude-3.5-sonnet',
      0.5
    );

    // metaに必須項目を補完（検証前に実行）
    const resultWithMeta = {
      ...result,
      meta: {
// 修正後（まとめてコピーして、該当箇所を上書きしてください）
kb_type: (result as any).meta?.kb_type || 'strategy_option', // ← optionになっているか確認
productId: (result as any).meta?.productId ?? (activeProduct?.productId || null),
imageId: (result as any).meta?.imageId ?? (bannerContext?.imageId || null),
generatedAt: (result as any).meta?.generatedAt || new Date().toISOString(),
},
payload: {
...(result as any).payload,
options: (result as any).payload?.options || [], // ← ここは options かもしれません（確認推奨）
},
    };

    // Zod検証
    const validated = StrategyOptionPayloadSchema.parse(resultWithMeta);
    
    // metaに必須項目を設定（imageIdがnullまたは空文字列の場合）
    if ((!validated.meta.imageId || validated.meta.imageId === '') && bannerContext?.imageId) {
      validated.meta.imageId = bannerContext.imageId;
    }
    if (!validated.meta.generatedAt) {
      validated.meta.generatedAt = new Date().toISOString();
    }
    if (validated.meta.productId === undefined && activeProduct?.productId) {
      validated.meta.productId = activeProduct.productId;
    }

    return NextResponse.json({ option: validated });
  } catch (error) {
    console.error('[C2生成API] エラー:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
