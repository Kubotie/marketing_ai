import { NextRequest, NextResponse } from 'next/server';
import { callOpenRouterJSON } from '@/lib/openrouter';
import type { OpenRouterMessage } from '@/lib/openrouter';
import type { BannerInsightPayload } from '@/kb/common';
import { InsightPayloadBaseSchema } from '@/kb/common-schemas';
import { COMMON_SYSTEM_PROMPT, buildBannerAnalysisInput, extractAppealAxes, buildBBoxList } from '@/lib/insight-prompt-builder';
import type { InsightInputs } from '@/lib/insight-input-collector';

export const runtime = 'nodejs';

/**
 * Banner Insight生成API（初回読み込み時自動生成）
 * 訴求軸・理由・避けている表現・バナー構成の型を生成
 */
export async function POST(request: NextRequest) {
  let currentStep = '初期化';
  let inputSummary: any = null;

  try {
    // Step 1: リクエストボディの取得
    currentStep = 'Step1: リクエストボディ取得';
    console.log(`[generate-insight] ${currentStep} 開始`);
    
    let body: any;
    try {
      body = await request.json();
      inputSummary = {
        hasInputs: !!body.inputs,
        hasImageId: !!body.imageId,
        inputsKeys: body.inputs ? Object.keys(body.inputs) : [],
      };
      console.log(`[generate-insight] ${currentStep} 完了`, inputSummary);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[generate-insight] ${currentStep} エラー`, {
        errorMessage,
        errorStack,
        inputSummary,
      });
      return NextResponse.json(
        { 
          error: errorMessage, 
          step: currentStep,
          debug: {
            errorStack,
            inputSummary,
          },
        },
        { status: 400 }
      );
    }

    const { inputs, imageId } = body;

    if (!inputs) {
      return NextResponse.json(
        { 
          error: 'inputs is required', 
          step: currentStep,
          debug: {
            inputSummary,
            bodyKeys: body ? Object.keys(body) : [],
          },
        },
        { status: 400 }
      );
    }

    // Step 2: 入力データの展開
    currentStep = 'Step2: 入力データ展開';
    console.log(`[generate-insight] ${currentStep} 開始`);
    
    const {
      layoutBboxes = [],
      texts: textsRaw,
      activeProduct,
    } = inputs as Partial<InsightInputs> & { imageId?: string };

    // texts.ocrTexts を正規化（undefined/string/objectでも落ちないように）
    const ocrTextsRaw = textsRaw?.ocrTexts;
    const bboxTextsRaw = textsRaw?.bboxTexts;
    
    console.log(`[generate-insight] ${currentStep} texts検証`, {
      typeofOcrTexts: typeof ocrTextsRaw,
      isArrayOcrTexts: Array.isArray(ocrTextsRaw),
      ocrTextsRawType: ocrTextsRaw?.constructor?.name,
      ocrTextsRawValue: ocrTextsRaw,
      typeofBboxTexts: typeof bboxTextsRaw,
      isArrayBboxTexts: Array.isArray(bboxTextsRaw),
    });

    // ocrTexts を必ず string[] に正規化
    const ocrTexts = Array.isArray(ocrTextsRaw)
      ? ocrTextsRaw.filter((t): t is string => typeof t === 'string')
      : typeof ocrTextsRaw === 'string'
      ? [ocrTextsRaw]
      : [];

    // bboxTexts を正規化
    const bboxTexts = Array.isArray(bboxTextsRaw)
      ? bboxTextsRaw.filter((t): t is { bboxId: string; text: string } => 
          t && typeof t === 'object' && 'bboxId' in t && 'text' in t
        )
      : [];

    // 正規化された texts オブジェクトを作成
    const texts = {
      ocrTexts,
      bboxTexts,
    };

    console.log(`[generate-insight] ${currentStep} 完了`, {
      layoutBboxesCount: layoutBboxes.length,
      ocrTextsCount: ocrTexts.length,
      bboxTextsCount: bboxTexts.length,
      hasActiveProduct: !!activeProduct,
    });

    // Step 3: 入力情報の構築
    currentStep = 'Step3: 入力情報構築';
    console.log(`[generate-insight] ${currentStep} 開始`);
    
    let bboxList: any[];
    let appealAxesList: string[];
    try {
      bboxList = buildBBoxList(layoutBboxes);
      appealAxesList = extractAppealAxes(layoutBboxes, texts || { ocrTexts: [], bboxTexts: [] });
      console.log(`[generate-insight] ${currentStep} 完了`, {
        bboxListLength: bboxList.length,
        appealAxesListLength: appealAxesList.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[generate-insight] ${currentStep} エラー`, {
        errorMessage,
        errorStack,
        inputSummary,
        textsNormalized: {
          ocrTextsCount: ocrTexts.length,
          bboxTextsCount: bboxTexts.length,
        },
      });
      return NextResponse.json(
        { 
          error: errorMessage, 
          step: currentStep,
          debug: {
            errorStack,
            inputSummary,
            textsNormalized: {
              ocrTextsCount: ocrTexts.length,
              bboxTextsCount: bboxTexts.length,
            },
          },
        },
        { status: 500 }
      );
    }

    // Step 4: プロンプト構築
    currentStep = 'Step4: プロンプト構築';
    console.log(`[generate-insight] ${currentStep} 開始`);

    const userPrompt = `以下は、1枚のバナー画像から得られた分析情報です。
これらを根拠として、指定されたアウトプットを生成してください。

# 入力情報

## 1. BBox一覧（手動修正・OCR後）
${JSON.stringify(bboxList, null, 2)}

## 2. BBoxタイプ一覧（最新版）
使用できる type は以下のみです：
- メインコピー
- サブコピー
- 商品画像
- メインビジュアル
- サブビジュアル
- CTA
- ロゴ
- 価格・割引情報
- 期間・数量限定表現
- アイコン・記号
- 信頼性要素
- QRコード
- バッジ・ラベル
- 人物写真・顔
- 使用成分・技術

## 3. 訴求軸（Appeal Axes）
${appealAxesList.join(', ') || 'なし'}

## 4. 補足情報（任意）
- 想定プロダクトカテゴリ: ${activeProduct?.category || '不明'}
- 想定ターゲット: 未設定

---

# あなたが行う分析

## A. banner_insight（個別バナー洞察）
- このバナーで「最も強く伝えようとしていること」
- 主に使われている訴求型（下記から必ず選択）

訴求型リスト（必須判定）：
- ターゲット絞り込み型
- 感情代弁型
- 啓蒙型
- 比較型
- 数字表現型
- 権威型
- 利用シーン提案型
- 臨場感演出型

---

# 出力ルール（最重要）

- 出力は **必ず JSON のみ**
- すべて仮説表現で書く（「可能性が高い」「可能性がある」「示唆される」など）
- 抽象的な一般論は禁止（例：「ユーザーの期待に応えるため」は禁止）
- 各insightに必ず「根拠となったBBox type / text / areaRatio」を含める
- summaryは、一次情報から逆算した構造的な分析結果を1文で要約すること

出力例（参考）:
{
  "meta": {
    "kb_type": "banner_insight",
    "productId": null,
    "imageId": "${imageId || ''}",
    "generatedAt": "${new Date().toISOString()}",
    "confidence": 0.74
  },
  "payload": {
    "summary": "本バナーは『価格納得 × 行動即決』を主軸に、検討時間を極力短縮する構成が採用されている可能性が高い。",
    "insights": [
      {
        "title": "価格とCTAを軸にした即時行動誘導型構成",
        "hypothesis": "ユーザーに比較検討をさせず、その場での購入・遷移を促す意図から、価格情報とCTAが明確かつ視認性高く配置されている可能性がある。",
        "appeal_axes": ["price", "convenience"],
        "structure_type": ["数字表現型"],
        "evidence": [
          {
            "bbox_type": "価格・割引情報",
            "text": "¥9,800",
            "areaRatio": 0.08
          },
          {
            "bbox_type": "CTA",
            "text": "今すぐ購入",
            "areaRatio": 0.07
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

    console.log(`[generate-insight] ${currentStep} 完了`, {
      promptLength: userPrompt.length,
      messagesCount: messages.length,
    });

    // Step 5: OpenRouter API呼び出し
    currentStep = 'Step5: OpenRouter API呼び出し';
    console.log(`[generate-insight] ${currentStep} 開始`);

    let result: BannerInsightPayload;
    try {
      result = await callOpenRouterJSON<BannerInsightPayload>(
        messages,
        'anthropic/claude-3.5-sonnet',
        0.5
      );
      console.log(`[generate-insight] ${currentStep} 完了`, {
        hasResult: !!result,
        hasMeta: !!(result as any)?.meta,
        hasPayload: !!(result as any)?.payload,
        insightsCount: (result as any)?.payload?.insights?.length || 0,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[generate-insight] ${currentStep} エラー`, {
        errorMessage,
        errorStack,
        inputSummary,
      });
      return NextResponse.json(
        { 
          error: errorMessage, 
          step: currentStep,
          debug: {
            errorStack,
            inputSummary,
            promptLength: userPrompt.length,
          },
        },
        { status: 500 }
      );
    }

    // Step 6: Zod検証
    currentStep = 'Step6: Zod検証';
    console.log(`[generate-insight] ${currentStep} 開始`);

    const validated = InsightPayloadBaseSchema.safeParse(result);
    
    if (!validated.success) {
      const errorFormat = validated.error.format();
      console.error(`[generate-insight] ${currentStep} 検証失敗`, {
        errors: errorFormat,
        inputSummary,
      });
      return NextResponse.json(
        { 
          error: 'Zod検証エラー',
          step: currentStep,
          debug: {
            zodErrors: errorFormat,
            inputSummary,
            resultSample: result ? JSON.stringify(result).substring(0, 500) : null,
          },
        },
        { status: 500 }
      );
    }

    console.log(`[generate-insight] ${currentStep} 完了`);

    // Step 7: metaに必須項目を設定
    currentStep = 'Step7: meta設定';
    console.log(`[generate-insight] ${currentStep} 開始`);
    
    if (!validated.data.meta.imageId && imageId) {
      validated.data.meta.imageId = imageId;
    }
    if (!validated.data.meta.generatedAt) {
      validated.data.meta.generatedAt = new Date().toISOString();
    }
    if (validated.data.meta.productId === undefined && activeProduct?.productId) {
      validated.data.meta.productId = activeProduct.productId;
    }

    console.log(`[generate-insight] ${currentStep} 完了`);

    return NextResponse.json({ insight: validated.data });
  } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[generate-insight] ${currentStep} 予期しないエラー`, {
        errorMessage,
        errorStack,
        inputSummary,
      });
      return NextResponse.json(
        { 
          error: errorMessage, 
          step: currentStep,
          debug: {
            errorStack,
            inputSummary,
          },
        },
        { status: 500 }
      );
  }
}
