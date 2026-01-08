import { Aggregation, Extraction, MarketInsight, StrategyOption, PlanningHook } from '@/types/schema';

/**
 * Market Insight (C1) 生成
 * Bの結果を入力として、「市場で共有されている前提・当たり前」を抽出
 */
export function generateMarketInsights(
  aggregation: Aggregation,
  extractions: Extraction[]
): MarketInsight[] {
  const insights: MarketInsight[] = [];

  // 高頻度要素から「説明しなくても伝わる前提」を抽出
  aggregation.component_frequencies
    .filter((cf) => cf.percentage >= 70)
    .forEach((cf) => {
      const supportingBanners = extractions
        .filter((e) => e.components.some((c) => c.type === cf.type))
        .map((e) => e.banner_id);

      insights.push({
        fact: `${cf.type}が${cf.percentage}%のバナーで使用されている`,
        hypothesis: `${cf.type}は"説明しなくても伝わる前提"になっている可能性がある`,
        supporting_banners: supportingBanners,
        category: 'high_frequency',
      });
    });

  // 高頻度訴求軸から市場の前提を抽出
  aggregation.appeal_axis_frequencies
    .filter((af) => af.percentage >= 70)
    .forEach((af) => {
      const supportingBanners = extractions
        .filter((e) => e.appeal_axes.some((a) => a.type === af.type))
        .map((e) => e.banner_id);

      insights.push({
        fact: `${af.type}訴求が${af.percentage}%のバナーで使用されている`,
        hypothesis: `${af.type}訴求は市場の"当たり前"になっている可能性がある`,
        supporting_banners: supportingBanners,
        category: 'high_frequency',
      });
    });

  // 低頻度要素から「避ける傾向」を抽出
  aggregation.component_frequencies
    .filter((cf) => cf.percentage <= 20 && cf.count >= 2)
    .forEach((cf) => {
      const supportingBanners = extractions
        .filter((e) => e.components.some((c) => c.type === cf.type))
        .map((e) => e.banner_id);

      insights.push({
        fact: `${cf.type}が${cf.percentage}%のバナーでのみ使用されている`,
        hypothesis: `${cf.type}を避ける傾向が見られる可能性がある`,
        supporting_banners: supportingBanners,
        category: 'low_frequency',
      });
    });

  // よくある組み合わせから「セットで使われる前提」を抽出
  aggregation.component_appeal_combinations
    .filter((combo) => combo.percentage >= 50)
    .forEach((combo) => {
      insights.push({
        fact: `${combo.components.join(' + ')} と ${combo.appeal_axes.join(' + ')} が${combo.percentage}%のバナーで組み合わせて使用されている`,
        hypothesis: `これらの要素は"セットで使われる前提"になっている可能性がある`,
        supporting_banners: combo.banner_ids,
        category: 'combination',
      });
    });

  // ブランド別差分から「ブランドによる違い」を抽出
  if (aggregation.brand_differences) {
    aggregation.brand_differences.forEach((bd) => {
      bd.differences.forEach((diff) => {
        const supportingBanners = extractions
          .filter((e) => e.brand === bd.brand)
          .map((e) => e.banner_id);

        insights.push({
          fact: diff.detail,
          hypothesis: `${bd.brand}は他のブランドと異なる構成を採用している可能性がある`,
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
 * 各Strategy Optionから、バナー/LP企画のための「考えるフック」を生成
 */
export function generatePlanningHooks(
  strategyOptions: StrategyOption[]
): PlanningHook[] {
  return strategyOptions.map((option) => {
    const hooks: PlanningHook['hooks'] = [];

    // FV（ファーストビュー）で何を一番に伝えるか
    if (option.referenced_elements.appeal_axes && option.referenced_elements.appeal_axes.length > 0) {
      hooks.push({
        question: 'このOptionを取るなら、FVで何を一番に伝えるか',
        context: `参考にする訴求軸: ${option.referenced_elements.appeal_axes.join(', ')}`,
      });
    }

    // 説明不要 vs 説明が必要な要素
    if (option.referenced_elements.components && option.referenced_elements.components.length > 0) {
      hooks.push({
        question: 'どの要素は説明不要で、どこは説明が必要か',
        context: `参考にする要素: ${option.referenced_elements.components.join(', ')}。これらの要素が市場でどの程度理解されているかを考慮する`,
      });
    }

    // 誤解されやすいポイント
    if (option.avoided_elements.components && option.avoided_elements.components.length > 0) {
      hooks.push({
        question: '誤解されやすいポイントは何か',
        context: `使わない要素: ${option.avoided_elements.components.join(', ')}。市場の期待と異なる場合、どのような誤解が生じる可能性があるか`,
      });
    }

    // ペルソナとの整合性
    if (option.target_persona) {
      hooks.push({
        question: 'このOptionはペルソナの期待にどう応えるか',
        context: `想定ペルソナ: ${option.target_persona}`,
      });
    }

    return {
      strategy_option: option.option_type,
      hooks,
    };
  });
}
