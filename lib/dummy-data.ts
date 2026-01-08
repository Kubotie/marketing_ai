import { Extraction, Aggregation, Insights } from '@/types/schema';
import { generateAggregation } from './aggregation';
import {
  generateMarketInsights,
  generateStrategyOptions,
  generatePlanningHooks,
} from './insights';

/**
 * ダミーデータ生成用
 */
export function generateDummyExtraction(bannerId: string, imageUrl: string): Extraction {
  // バナーIDからバリエーションを生成（より多様なデータを生成）
  const index = parseInt(bannerId.split('_').pop() || '0', 10);
  const brandIndex = index % 3;
  const patternIndex = Math.floor(index / 3) % 3;

  const brands = ['ブランドA', 'ブランドB', null];
  const channels = ['Facebook', 'Instagram', null];

  // パターンに応じて異なる構成を生成
  const patterns = [
    // パターン1: 価格訴求中心
    {
      components: [
        { type: '商品画像', text: null, bbox: { x: 50, y: 50, w: 300, h: 300 } },
        { type: 'ロゴ', text: null, bbox: { x: 20, y: 20, w: 100, h: 40 } },
        { type: '価格', text: '¥9,800', bbox: { x: 400, y: 200, w: 120, h: 40 } },
        { type: 'CTA', text: '今すぐ購入', bbox: { x: 400, y: 300, w: 150, h: 50 } },
        { type: '期間限定', text: '期間限定30%OFF', bbox: { x: 50, y: 380, w: 200, h: 30 } },
      ],
      appeal_axes: [
        { type: '価格', evidence_text: '期間限定30%OFF', bbox: { x: 50, y: 380, w: 200, h: 30 } },
        { type: '限定', evidence_text: '期間限定30%OFF', bbox: { x: 50, y: 380, w: 200, h: 30 } },
      ],
      tone: '強め',
      notes: '価格訴求のテキストが確認できた。期間限定の表示あり。',
    },
    // パターン2: 効果訴求中心
    {
      components: [
        { type: '商品画像', text: null, bbox: { x: 50, y: 50, w: 300, h: 300 } },
        { type: 'ロゴ', text: null, bbox: { x: 20, y: 20, w: 100, h: 40 } },
        { type: 'CTA', text: '詳細を見る', bbox: { x: 350, y: 350, w: 150, h: 50 } },
        { type: 'バッジ', text: 'おすすめ', bbox: { x: 50, y: 30, w: 100, h: 30 } },
        { type: 'レビュー', text: '★★★★★', bbox: { x: 50, y: 400, w: 150, h: 30 } },
      ],
      appeal_axes: [
        { type: '効果', evidence_text: 'おすすめ', bbox: { x: 50, y: 30, w: 100, h: 30 } },
        { type: '社会的証明', evidence_text: '★★★★★', bbox: { x: 50, y: 400, w: 150, h: 30 } },
      ],
      tone: 'やわらかめ',
      notes: '効果訴求と社会的証明のテキストが確認できた。',
    },
    // パターン3: 安心訴求中心
    {
      components: [
        { type: '商品画像', text: null, bbox: { x: 50, y: 50, w: 300, h: 300 } },
        { type: 'ロゴ', text: null, bbox: { x: 20, y: 20, w: 100, h: 40 } },
        { type: '価格', text: '¥12,800', bbox: { x: 400, y: 200, w: 120, h: 40 } },
        { type: 'CTA', text: '無料お試し', bbox: { x: 400, y: 300, w: 150, h: 50 } },
        { type: '保証', text: '30日返金保証', bbox: { x: 50, y: 380, w: 200, h: 30 } },
      ],
      appeal_axes: [
        { type: '安心', evidence_text: '30日返金保証', bbox: { x: 50, y: 380, w: 200, h: 30 } },
        { type: '時短', evidence_text: '無料お試し', bbox: { x: 400, y: 300, w: 150, h: 50 } },
      ],
      tone: null,
      notes: '安心訴求と時短訴求のテキストが確認できた。',
    },
  ];

  const pattern = patterns[patternIndex];

  return {
    banner_id: bannerId,
    brand: brands[brandIndex] || null,
    channel: channels[index % 3] || null,
    format: '静止画',
    components: pattern.components,
    appeal_axes: pattern.appeal_axes,
    tone: pattern.tone,
    notes: pattern.notes,
    confidence: 0.85,
  };
}

export function generateDummyAggregation(extractions: Extraction[]): Aggregation {
  return generateAggregation(extractions);
}

// 後方互換性のために残す（必要に応じて）
export function generateDummyInsights(aggregation: Aggregation): Insights {
  const overlaps = [
    ...aggregation.component_frequencies
      .filter((cf) => cf.percentage >= 50)
      .map((cf) => ({
        aspect: 'components',
        item: cf.type,
        frequency: cf.count,
        percentage: cf.percentage,
        note: `${cf.type}が${cf.percentage}%のバナーで使用されている`,
      })),
    ...aggregation.appeal_axis_frequencies
      .filter((af) => af.percentage >= 50)
      .map((af) => ({
        aspect: 'appeal_axes',
        item: af.type,
        frequency: af.count,
        percentage: af.percentage,
        note: `${af.type}訴求が${af.percentage}%のバナーで使用されている`,
      })),
  ];

  const rareComponents = aggregation.component_frequencies.filter((cf) => cf.percentage < 20);
  const rareAppeals = aggregation.appeal_axis_frequencies.filter((af) => af.percentage < 20);

  const differentiationOpportunities: Insights['differentiation_opportunities'] = [];

  if (rareComponents.length > 0) {
    differentiationOpportunities.push({
      aspect: 'components',
      missing_or_rare_items: rareComponents.map((rc) => rc.type),
      note: `以下の要素は使用頻度が低い: ${rareComponents.map((rc) => rc.type).join(', ')}`,
    });
  }

  if (rareAppeals.length > 0) {
    differentiationOpportunities.push({
      aspect: 'appeal_axes',
      missing_or_rare_items: rareAppeals.map((ra) => ra.type),
      note: `以下の訴求軸は使用頻度が低い: ${rareAppeals.map((ra) => ra.type).join(', ')}`,
    });
  }

  return {
    overlaps,
    differentiation_opportunities: differentiationOpportunities,
  };
}

/**
 * C1, C2, D を生成するヘルパー関数
 */
export function generateFullInsights(
  extractions: Extraction[],
  aggregation: Aggregation,
  personaInfo?: string
) {
  const marketInsights = generateMarketInsights(aggregation, extractions);
  const strategyOptions = generateStrategyOptions(marketInsights, aggregation, personaInfo);
  const planningHooks = generatePlanningHooks(strategyOptions);

  return {
    marketInsights,
    strategyOptions,
    planningHooks,
  };
}
