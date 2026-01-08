/**
 * Extraction (A) スキーマ定義
 * 推測しない／断定しない／根拠を必ず紐付ける
 */

// Bounding Box: 根拠として必須
export interface BBox {
  x: number; // 左上のx座標
  y: number; // 左上のy座標
  w: number; // 幅
  h: number; // 高さ
}

// コンポーネント（要素）
export interface Component {
  type: string; // "商品画像" | "人物" | "ロゴ" | "価格" | "CTA" | "バッジ" | "レビュー" | "保証" | "期間限定" 等
  text: string | null; // 画像内テキスト（なければnull）
  bbox: BBox; // 根拠として必須
}

// 訴求軸（根拠テキスト+bbox必須）
export interface AppealAxis {
  type: string; // "価格" | "効果" | "安心" | "時短" | "限定" | "社会的証明" 等
  evidence_text: string; // 根拠となるテキスト
  bbox: BBox; // 根拠として必須
}

// Extraction (A) 全体スキーマ
export interface Extraction {
  banner_id: string; // バナーID
  brand: string | null; // ブランド名（不明はnull）
  channel: string | null; // チャネル（不明はnull）
  format: string | null; // フォーマット（静止画/カルーセル等：不明はnull）
  components: Component[]; // 構成要素
  appeal_axes: AppealAxis[]; // 訴求軸（根拠必須）
  tone: string | null; // トーン（断定せず候補として。根拠が弱ければnull）
  notes: string; // 事実のみ（推測や断定を含まない）
  confidence: number; // 根拠量にもとづく説明可能なルール（0.0-1.0）
}

/**
 * Aggregation (B) スキーマ定義
 */
export interface ComponentFrequency {
  type: string;
  count: number;
  percentage: number;
}

export interface AppealAxisFrequency {
  type: string;
  count: number;
  percentage: number;
}

export interface ComponentSet {
  components: string[]; // コンポーネントタイプの配列
  count: number;
  percentage: number;
}

export interface BrandDifference {
  brand: string;
  differences: {
    aspect: string; // "components" | "appeal_axes" | "tone"
    detail: string; // 差分の詳細
  }[];
}

export interface Aggregation {
  total_banners: number;
  component_frequencies: ComponentFrequency[];
  appeal_axis_frequencies: AppealAxisFrequency[];
  common_combinations: ComponentSet[]; // よくある組み合わせ（componentsのみ）
  component_appeal_combinations: ComponentAppealCombination[]; // components×appeal_axesの組み合わせ
  brand_differences: BrandDifference[] | null; // ブランド別の差分（差分がある場合のみ）
}

/**
 * Aggregation (B) の拡張
 * components×appeal_axesの組み合わせ
 */
export interface ComponentAppealCombination {
  components: string[]; // コンポーネントタイプの配列
  appeal_axes: string[]; // 訴求軸タイプの配列
  count: number;
  percentage: number;
  banner_ids: string[]; // 根拠となるバナーID
}

/**
 * Market Insight (C1) スキーマ定義
 * 市場で共有されている前提・当たり前を抽出
 */
export interface MarketInsight {
  fact: string; // 観測された事実（Bの数値・分布）
  hypothesis: string; // そこから言える市場の前提（仮説表現）
  supporting_banners: string[]; // 根拠となるバナーID
  category: 'high_frequency' | 'low_frequency' | 'combination' | 'brand_difference';
}

/**
 * Strategy Option (C2) スキーマ定義
 * 自社の選択肢
 */
export interface StrategyOption {
  option_type: 'A' | 'B' | 'C'; // A: 市場に同調 / B: 部分的にずらす / C: あえて外す
  title: string;
  referenced_elements: {
    components?: string[];
    appeal_axes?: string[];
  }; // 参考にしている競合要素
  avoided_elements: {
    components?: string[];
    appeal_axes?: string[];
  }; // あえて使わない要素
  potential_benefits: string[]; // 想定されるメリット（仮説）
  potential_risks: string[]; // 想定されるリスク（仮説）
  target_persona?: string; // 想定ペルソナ（ある場合のみ）
}

/**
 * Planning Hook (D) スキーマ定義
 * 企画への接続：思考の起点
 */
export interface PlanningHook {
  strategy_option: 'A' | 'B' | 'C';
  hooks: Array<{
    question: string; // 考えるフック（質問形式）
    context: string; // 背景・文脈
  }>;
}
