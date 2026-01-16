import { NextRequest, NextResponse } from 'next/server';
import { callOpenRouterJSON } from '@/lib/openrouter';
import type { OpenRouterMessage } from '@/lib/openrouter';
import type { PlanningHookPayload } from '@/kb/common';
import { PlanningHookPayloadSchema } from '@/kb/common-schemas';
import { COMMON_SYSTEM_PROMPT } from '@/lib/insight-prompt-builder';

export const runtime = 'nodejs';

/**
 * D: 企画フック生成API
 * C2の出力 + bannerの具体要素（headline/cta/annotationの語彙）から企画の種を生成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, c2Option } = body;

    if (!inputs || !c2Option) {
      return NextResponse.json(
        { error: 'inputs and c2Option are required' },
        { status: 400 }
      );
    }

    const {
      activeProduct,
      personaRefs = [],
      bannerContext,
    } = inputs;

    const userPrompt = `以下は、戦略オプションと商品・ペルソナ情報です。
これらを根拠として、指定されたアウトプットを生成してください。

# 入力情報

## 1. 戦略オプション（C2）
${JSON.stringify(c2Option, null, 2)}

## 2. 商品情報
${JSON.stringify(activeProduct ? {
  name: activeProduct.name,
  category: activeProduct.category,
  description: activeProduct.description,
} : null, null, 2)}

## 3. ペルソナ情報
${JSON.stringify(personaRefs.length > 0 ? personaRefs.map((p: any) => ({  summary: p.summary,
  jtbd: p.jtbd,
  topCriteria: p.topCriteria,
})) : null, null, 2)}

---

# あなたが行う分析

## D. Step D：企画フック（planning_hook）
- 実際にバナー・LP企画に転用できる「フック案」を 3 つ
- それぞれ：
  - どの訴求軸を使うか
  - どのバナー構成型と相性が良いか
  - なぜユーザーが反応しやすいと考えられるか

---

# 出力ルール（最重要）

- 出力は **必ず JSON のみ**
- すべて仮説表現で書く（「可能性がある」「示唆される」など）
- 抽象的な一般論は禁止（例：「ユーザーの期待に応えるため」は禁止）
- 各insightに必ず「根拠となったBBox type / text / areaRatio」を含める
- summaryは、一次情報から逆算した企画転用の方向性を1文で要約すること

出力例（参考）:
{
  "meta": {
    "kb_type": "planning_hook",
    "productId": ${activeProduct?.productId ? `"${activeProduct.productId}"` : 'null'},
    "imageId": "${bannerContext?.imageId || ''}",
    "generatedAt": "${new Date().toISOString()}",
    "confidence": 0.63
  },
  "payload": {
    "summary": "現在の構成を起点に、企画へ転用可能なフック案を提示する。",
    "insights": [
      {
        "title": "価格納得フック",
        "hypothesis": "『1日あたり◯円』など分解表現を用いることで、価格への心理的ハードルを下げられる可能性がある。",
        "appeal_axes": ["price"],
        "structure_type": ["数字表現型"],
        "evidence": [
          {
            "bbox_type": "価格・割引情報",
            "text": "¥9,800",
            "areaRatio": 0.08
          }
        ]
      },
      {
        "title": "行動限定フック",
        "hypothesis": "CTA周辺に期間・数量限定表現を加えることで、行動喚起をさらに強化できる可能性がある。",
        "appeal_axes": ["convenience"],
        "structure_type": ["行動喚起型"],
        "evidence": [
          {
            "bbox_type": "CTA",
            "text": "今すぐ購入",
            "areaRatio": 0.07
          }
        ]
      }
    ],
    "hooks": [
      {
        "question": "価格を分解表現で提示することで、ユーザーの心理的ハードルを下げられるか？",
        "context": "現在のバナーでは価格が明示されているが、1日あたりの金額に分解することで、より納得感を高められる可能性がある。",
        "relatedPersonaIds": [],
        "relatedSectionOrder": 1
      },
      {
        "question": "CTA周辺に期間・数量限定表現を加えることで、行動喚起を強化できるか？",
        "context": "現在のCTAはシンプルだが、限定性を加えることで緊迫感を演出し、行動を促せる可能性がある。",
        "relatedPersonaIds": [],
        "relatedSectionOrder": 2
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

    const result = await callOpenRouterJSON<PlanningHookPayload>(
      messages,
      'anthropic/claude-3.5-sonnet',
      0.5
    );

    // metaに必須項目を補完（検証前に実行）
    const resultWithMeta = {
      ...result,
      meta: {
    // 修正後（コピーして貼り付け）
// 修正後（コピーして貼り付け）
kb_type: (result as any).meta?.kb_type || 'planning_hook',
productId: (result as any).meta?.productId ?? (activeProduct?.productId || null),
imageId: (result as any).meta?.imageId ?? (bannerContext?.imageId || null),
generatedAt: (result as any).meta?.generatedAt || new Date().toISOString(),      },
// 修正後（コピーして貼り付け）
payload: {
  ...(result as any).payload,
  hooks: (result as any).payload?.hooks || [],
},
    };

    // Zod検証
    const validated = PlanningHookPayloadSchema.parse(resultWithMeta);
    
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

    return NextResponse.json({ hook: validated });
  } catch (error) {
    console.error('[D生成API] エラー:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
