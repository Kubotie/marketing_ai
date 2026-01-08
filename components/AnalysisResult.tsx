'use client';

import { Extraction } from '@/types/schema';
import BannerImage from './BannerImage';

interface AnalysisResultProps {
  extraction: Extraction;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
}

// BBox用の色定義
const COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // yellow
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

export default function AnalysisResult({
  extraction,
  imageUrl,
  imageWidth,
  imageHeight,
}: AnalysisResultProps) {
  // BBoxデータを準備
  const bboxItems: Array<{ bbox: Extraction['components'][0]['bbox']; label: string; color: string }> = [
    ...extraction.components.map((comp, idx) => ({
      bbox: comp.bbox,
      label: `${comp.type}${comp.text ? `: ${comp.text}` : ''}`,
      color: COLORS[idx % COLORS.length],
    })),
    ...extraction.appeal_axes.map((appeal, idx) => ({
      bbox: appeal.bbox,
      label: `訴求: ${appeal.type} (${appeal.evidence_text})`,
      color: COLORS[(extraction.components.length + idx) % COLORS.length],
    })),
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">分析結果 (Extraction)</h2>
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">バナーID:</span> {extraction.banner_id}
            </div>
            {extraction.brand && (
              <div>
                <span className="font-medium">ブランド:</span> {extraction.brand}
              </div>
            )}
            {extraction.channel && (
              <div>
                <span className="font-medium">チャネル:</span> {extraction.channel}
              </div>
            )}
            {extraction.format && (
              <div>
                <span className="font-medium">フォーマット:</span> {extraction.format}
              </div>
            )}
            {extraction.tone && (
              <div>
                <span className="font-medium">トーン（候補）:</span> {extraction.tone}
              </div>
            )}
            <div>
              <span className="font-medium">信頼度:</span>{' '}
              <span className={extraction.confidence >= 0.7 ? 'text-green-600' : 'text-yellow-600'}>
                {(extraction.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 画像とBBox表示 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">画像分析（BBoxハイライト）</h3>
        <BannerImage
          imageUrl={imageUrl}
          width={imageWidth}
          height={imageHeight}
          bboxes={bboxItems}
        />
      </div>

      {/* 構成要素 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">構成要素 (Components)</h3>
        <div className="bg-white rounded-lg border">
          <div className="divide-y">
            {extraction.components.map((comp, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-blue-600">{comp.type}</div>
                    {comp.text && (
                      <div className="text-sm text-gray-700 mt-1">テキスト: {comp.text}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      BBox: ({comp.bbox.x}, {comp.bbox.y}) サイズ: {comp.bbox.w} × {comp.bbox.h}
                    </div>
                  </div>
                  <div
                    className="w-6 h-6 rounded border-2"
                    style={{ borderColor: COLORS[idx % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 訴求軸 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">訴求軸 (Appeal Axes)</h3>
        <div className="bg-white rounded-lg border">
          <div className="divide-y">
            {extraction.appeal_axes.map((appeal, idx) => (
              <div key={idx} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-green-600">{appeal.type}</div>
                    <div className="text-sm text-gray-700 mt-1">
                      根拠テキスト: {appeal.evidence_text}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      BBox: ({appeal.bbox.x}, {appeal.bbox.y}) サイズ: {appeal.bbox.w} ×{' '}
                      {appeal.bbox.h}
                    </div>
                  </div>
                  <div
                    className="w-6 h-6 rounded border-2"
                    style={{
                      borderColor:
                        COLORS[(extraction.components.length + idx) % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 構造の読み取り：選ばれている理由 */}
      {extraction.selected_reason_hypothesis && (
        <div>
          <h3 className="text-lg font-semibold mb-3">この表現が選ばれている理由（仮説）</h3>
          <div className="bg-white rounded-lg border p-4 border-purple-300">
            <p className="text-sm text-purple-700">{extraction.selected_reason_hypothesis}</p>
          </div>
        </div>
      )}

      {/* 構造の読み取り：避けている表現 */}
      {extraction.avoided_expressions_hypothesis && (
        <div>
          <h3 className="text-lg font-semibold mb-3">避けている表現（仮説）</h3>
          <div className="bg-white rounded-lg border p-4 border-orange-300">
            <p className="text-sm text-orange-700">{extraction.avoided_expressions_hypothesis}</p>
          </div>
        </div>
      )}

      {/* 備考 */}
      {extraction.notes && (
        <div>
          <h3 className="text-lg font-semibold mb-3">備考 (Notes)</h3>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-700">{extraction.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
