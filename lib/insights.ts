import { Aggregation, Extraction, MarketInsight, StrategyOption, PlanningHook } from '@/types/schema';

/**
 * Market Insight (C1) 生成
 * 構造の読み取り：ペルソナの前提 → 競合の選択 → その合理性（仮説）
 */
export function generateMarketInsights(
  aggregation: Aggregation,
  extractions: Extraction[]
): MarketInsight[] {
  const insights: MarketInsight[] = [];

  // 高頻度要素から構造を読み取る
  aggregation.component_frequencies
    .filter((cf) => cf.percentage >= 70)
    .forEach((cf) => {
      const supportingBanners = extractions
        .filter((e) => e.components.some((c) => c.type === cf.type))
        .map((e) => e.banner_id);

      insights.push({
        persona_assumption: `ペルソナは${cf.type}の存在を前提として期待している可能性がある`,
        competitor_choice: {
          choice: `${cf.type}を使用`,
          evidence: `${cf.percentage}%のバナーで使用（${cf.count}件）`,
        },
        rationality_hypothesis: `ペルソナの期待に応えるため、${cf.type}を含める選択が合理的である可能性がある`,
        supporting_banners: supportingBanners,
        category: 'high_frequency',
      });
    });

  // 高頻度訴求軸から構造を読み取る
  aggregation.appeal_axis_frequencies
    .filter((af) => af.percentage >= 70)
    .forEach((af) => {
      const supportingBanners = extractions
        .filter((e) => e.appeal_axes.some((a) => a.type === af.type))
        .map((e) => e.banner_id);

      insights.push({
        persona_assumption: `ペルソナは${af.type}訴求を重視している可能性がある`,
        competitor_choice: {
          choice: `${af.type}訴求を採用`,
          evidence: `${af.percentage}%のバナーで使用（${af.count}件）`,
        },
        rationality_hypothesis: `ペルソナの重視ポイントに合わせるため、${af.type}訴求を選択している可能性がある`,
        supporting_banners: supportingBanners,
        category: 'high_frequency',
      });
    });

  // 低頻度要素から構造を読み取る
  aggregation.component_frequencies
    .filter((cf) => cf.percentage <= 20 && cf.count >= 2)
    .forEach((cf) => {
      const supportingBanners = extractions
        .filter((e) => e.components.some((c) => c.type === cf.type))
        .map((e) => e.banner_id);

      insights.push({
        persona_assumption: `ペルソナは${cf.type}に対して否定的、または無関心である可能性がある`,
        competitor_choice: {
          choice: `${cf.type}を避ける`,
          evidence: `${cf.percentage}%のバナーのみ使用（${cf.count}件）`,
        },
        rationality_hypothesis: `ペルソナの反応を避けるため、${cf.type}を使わない選択が合理的である可能性がある`,
        supporting_banners: supportingBanners,
        category: 'low_frequency',
      });
    });

  // よくある組み合わせから構造を読み取る
  aggregation.component_appeal_combinations
    .filter((combo) => combo.percentage >= 50)
    .forEach((combo) => {
      insights.push({
        persona_assumption: `ペルソナは特定の要素と訴求の組み合わせを期待している可能性がある`,
        competitor_choice: {
          choice: `${combo.components.join(' + ')} と ${combo.appeal_axes.join(' + ')} を組み合わせ`,
          evidence: `${combo.percentage}%のバナーで組み合わせ使用（${combo.count}件）`,
        },
        rationality_hypothesis: `ペルソナの期待する組み合わせに合わせるため、このセットで使用する選択が合理的である可能性がある`,
        supporting_banners: combo.banner_ids,
        category: 'combination',
      });
    });

  // ブランド別差分から構造を読み取る
  if (aggregation.brand_differences) {
    aggregation.brand_differences.forEach((bd) => {
      bd.differences.forEach((diff) => {
        const supportingBanners = extractions
          .filter((e) => e.brand === bd.brand)
          .map((e) => e.banner_id);

        insights.push({
          persona_assumption: `${bd.brand}のターゲットペルソナは、他のブランドとは異なる前提を持っている可能性がある`,
          competitor_choice: {
            choice: diff.detail,
            evidence: `${bd.brand}のみの特徴`,
          },
          rationality_hypothesis: `${bd.brand}は独自のペルソナ理解に基づき、異なる構成を選択している可能性がある`,
          supporting_banners: supportingBanners,
          category: 'brand_difference',
        });
      });
    });
  }

  return insights;
}

/**
 * Strategy Options (C2) 生成
 * C1のMarket Insightから、自社の選択肢を生成
 */
export function generateStrategyOptions(
  marketInsights: MarketInsight[],
  aggregation: Aggregation,
  personaInfo?: string // ペルソナ情報（任意）
): StrategyOption[] {
  const options: StrategyOption[] = [];

  // 高頻度要素・訴求軸を抽出
  const highFreqComponents = aggregation.component_frequencies
    .filter((cf) => cf.percentage >= 70)
    .map((cf) => cf.type);
  const highFreqAppeals = aggregation.appeal_axis_frequencies
    .filter((af) => af.percentage >= 70)
    .map((af) => af.type);

  const lowFreqComponents = aggregation.component_frequencies
    .filter((cf) => cf.percentage <= 20)
    .map((cf) => cf.type);
  const lowFreqAppeals = aggregation.appeal_axis_frequencies
    .filter((af) => af.percentage <= 20)
    .map((af) => af.type);

  // Option A: 市場に同調する
  options.push({
    option_type: 'A',
    title: '市場に同調する',
    referenced_elements: {
      components: highFreqComponents,
      appeal_axes: highFreqAppeals,
    },
    avoided_elements: {
      components: lowFreqComponents,
      appeal_axes: lowFreqAppeals,
    },
    potential_benefits: [
      '市場の期待に応えやすい可能性がある',
      'ユーザーが理解しやすい構成になる可能性がある',
    ],
    potential_risks: [
      '差別化が難しくなる可能性がある',
      '競合と同じに見える可能性がある',
    ],
    target_persona: personaInfo,
  });

  // Option B: 部分的にずらす
  options.push({
    option_type: 'B',
    title: '部分的にずらす',
    referenced_elements: {
      components: highFreqComponents.slice(0, Math.ceil(highFreqComponents.length / 2)),
      appeal_axes: highFreqAppeals.slice(0, Math.ceil(highFreqAppeals.length / 2)),
    },
    avoided_elements: {
      components: highFreqComponents.slice(Math.ceil(highFreqComponents.length / 2)),
      appeal_axes: highFreqAppeals.slice(Math.ceil(highFreqAppeals.length / 2)),
    },
    potential_benefits: [
      '市場の前提を維持しつつ、一部で差別化できる可能性がある',
      '理解しやすさと独自性のバランスを取りやすい可能性がある',
    ],
    potential_risks: [
      '中途半端に見える可能性がある',
      '何が違うのか伝わりにくい可能性がある',
    ],
    target_persona: personaInfo,
  });

  // Option C: あえて外す
  options.push({
    option_type: 'C',
    title: 'あえて外す',
    referenced_elements: {
      components: lowFreqComponents,
      appeal_axes: lowFreqAppeals,
    },
    avoided_elements: {
      components: highFreqComponents,
      appeal_axes: highFreqAppeals,
    },
    potential_benefits: [
      '明確な差別化ができる可能性がある',
      '独自性を打ち出しやすい可能性がある',
    ],
    potential_risks: [
      'ユーザーが理解しにくくなる可能性がある',
      '期待外れと感じられる可能性がある',
    ],
    target_persona: personaInfo,
  });

  return options;
}

/**
 * Planning Hooks (D) 生成
 * 各Strategy Optionから、バナー/LP企画に使える"問い"を生成
 */
export function generatePlanningHooks(
  strategyOptions: StrategyOption[],
  marketInsights: MarketInsight[]
): PlanningHook[] {
  return strategyOptions.map((option) => {
    const hooks: PlanningHook['hooks'] = [];

    // Option A: 市場に同調する場合の問い
    if (option.option_type === 'A') {
      hooks.push({
        question: '市場の期待に応えるため、FVで何を最初に伝えるべきか？',
        context: `参考にする訴求軸: ${option.referenced_elements.appeal_axes?.join(', ') || 'なし'}。市場で高頻度の訴求軸を採用する場合、ペルソナが最初に期待する情報は何か`,
        related_insights: marketInsights
          .filter((mi) => mi.category === 'high_frequency')
          .map((_, idx) => `insight-${idx}`),
      });

      hooks.push({
        question: '市場で説明不要とされている要素は何か？それ以外はどう説明すべきか？',
        context: `参考にする要素: ${option.referenced_elements.components?.join(', ') || 'なし'}。市場で高頻度の要素は説明不要の可能性があるが、それ以外は説明が必要かもしれない`,
        related_insights: marketInsights
          .filter((mi) => mi.category === 'high_frequency')
          .map((_, idx) => `insight-${idx}`),
      });
    }

    // Option B: 部分的にずらす場合の問い
    if (option.option_type === 'B') {
      hooks.push({
        question: '市場の前提を維持しつつ、どこで差別化を打ち出すか？',
        context: `参考にする要素: ${option.referenced_elements.components?.join(', ') || 'なし'}。使わない要素: ${option.avoided_elements.components?.join(', ') || 'なし'}。市場の期待を満たしつつ、独自性を示すポイントはどこか`,
      });

      hooks.push({
        question: '市場の期待と異なる部分を、どう説明すれば誤解を避けられるか？',
        context: `使わない要素: ${option.avoided_elements.components?.join(', ') || 'なし'}。市場で一般的な要素を使わない場合、ペルソナがどう感じるか、どう説明すれば納得してもらえるか`,
      });
    }

    // Option C: あえて外す場合の問い
    if (option.option_type === 'C') {
      hooks.push({
        question: '市場の期待を外すことで、どのような新しい価値を提示できるか？',
        context: `参考にする要素: ${option.referenced_elements.components?.join(', ') || 'なし'}。使わない要素: ${option.avoided_elements.components?.join(', ') || 'なし'}。市場の前提から外れることで、どんな新しいメッセージを伝えられるか`,
      });

      hooks.push({
        question: '市場の期待と異なる表現を選ぶ場合、ペルソナにどう理解してもらうか？',
        context: `使わない要素: ${option.avoided_elements.components?.join(', ') || 'なし'}。市場で一般的な要素を避ける場合、ペルソナが混乱しないよう、どう説明・表現すべきか`,
      });
    }

    // 共通の問い
    hooks.push({
      question: 'このOptionを選ぶ場合、ペルソナのどの前提・期待に応え、どこで独自性を示すか？',
      context: `想定ペルソナ: ${option.target_persona || '未設定'}。市場の前提と自社の独自性のバランスをどう取るか`,
      related_insights: marketInsights.map((_, idx) => `insight-${idx}`),
    });

    return {
      strategy_option: option.option_type,
      hooks,
    };
  });
}
