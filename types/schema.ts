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
  // 構造の読み取り：この表現が選ばれている理由（仮説）
  selected_reason_hypothesis: string | null; // この表現が選ばれている理由（仮説）
  // 構造の読み取り：避けている表現（仮説）
  avoided_expressions_hypothesis: string | null; // 避けている表現（仮説）
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
 * 構造の読み取り：4要素必須
 */
export interface MarketInsight {
  // 1. 想定されているペルソナ前提（人の不安・制約）（仮説）
  persona_assumption: {
    assumption: string; // ペルソナが持っている前提・不安・制約（仮説）
    evidence: string; // 根拠（出現率、要素の多寡など）
  };
  // 2. 観測された競合の選択（事実 + 根拠）
  competitor_choice: {
    choice: string; // 競合が選択している表現・要素（事実）
    evidence: string; // 根拠（出現率、要素の多寡など）
    bbox_references?: Array<{ banner_id: string; bbox: { x: number; y: number; w: number; h: number } }>; // BBox参照（任意）
  };
  // 3. なぜその選択が合理的か（仮説）
  rationality_hypothesis: string; // なぜその選択が合理的か（仮説）
  // 4. 当たり前になっている可能性（外すとリスク）（仮説）
  taken_for_granted_risk: string; // 当たり前になっている可能性、外すとリスク（仮説）
  supporting_banners: string[]; // 根拠となるバナーID
  category: 'high_frequency' | 'low_frequency' | 'combination' | 'brand_difference';
  // バナー/LP企画に使うための問い（Planning Hooks）
  planning_hooks: Array<{
    question: string; // 企画に使える問い
    context: string; // 背景・文脈
  }>;
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
 * 企画への接続：バナー/LP企画に使える"問い"
 */
export interface PlanningHook {
  strategy_option: 'A' | 'B' | 'C';
  hooks: Array<{
    question: string; // バナー/LP企画に使える問い
    context: string; // 背景・文脈（市場インサイトや競合の選択から）
    related_insights?: string[]; // 関連する市場インサイトのID（任意）
  }>;
}

/**
 * Insights (C) スキーマ定義（後方互換性のため）
 * ※「勝てる」等の断定は禁止
 */
export interface Overlap {
  aspect: string; // "components" | "appeal_axes" | "tone" 等
  item: string; // 被っている項目
  frequency: number; // 出現回数
  percentage: number; // 出現率
  note: string; // 事実ベースの説明（断定表現なし）
}

export interface DifferentiationOpportunity {
  aspect: string; // 観点
  missing_or_rare_items: string[]; // 存在しない/少ない要素（事実として）
  note: string; // 事実ベースの説明（断定表現なし）
}

export interface Insights {
  overlaps: Overlap[]; // 被り（よくある構成）
  differentiation_opportunities: DifferentiationOpportunity[]; // 差別化余地
}
