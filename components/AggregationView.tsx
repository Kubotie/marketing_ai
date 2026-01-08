'use client';

import { Aggregation } from '@/types/schema';

interface AggregationViewProps {
  aggregation: Aggregation;
  filters: {
    appealAxis?: string;
    component?: string;
    brand?: string;
  };
  onFilterChange: (filters: { appealAxis?: string; component?: string; brand?: string }) => void;
}

export default function AggregationView({
  aggregation,
  filters,
  onFilterChange,
}: AggregationViewProps) {
  // フィルタリング
  const filteredComponentFrequencies = aggregation.component_frequencies.filter((cf) => {
    if (filters.component && cf.type !== filters.component) return false;
    return true;
  });

  const filteredAppealAxisFrequencies = aggregation.appeal_axis_frequencies.filter((af) => {
    if (filters.appealAxis && af.type !== filters.appealAxis) return false;
    return true;
  });

  // ユニークなブランドを取得
  const brands = Array.from(
    new Set(
      aggregation.brand_differences?.map((bd) => bd.brand) || []
    )
  );

  return (
    <div className="space-y-6">
      {/* フィルタ */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">フィルタ</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">訴求軸</label>
            <select
              className="w-full px-3 py-2 border rounded text-sm"
              value={filters.appealAxis || ''}
              onChange={(e) =>
                onFilterChange({ ...filters, appealAxis: e.target.value || undefined })
              }
            >
              <option value="">すべて</option>
              {aggregation.appeal_axis_frequencies.map((af) => (
                <option key={af.type} value={af.type}>
                  {af.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">要素</label>
            <select
              className="w-full px-3 py-2 border rounded text-sm"
              value={filters.component || ''}
              onChange={(e) =>
                onFilterChange({ ...filters, component: e.target.value || undefined })
              }
            >
              <option value="">すべて</option>
              {aggregation.component_frequencies.map((cf) => (
                <option key={cf.type} value={cf.type}>
                  {cf.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ブランド</label>
            <select
              className="w-full px-3 py-2 border rounded text-sm"
              value={filters.brand || ''}
              onChange={(e) =>
                onFilterChange({ ...filters, brand: e.target.value || undefined })
              }
            >
              <option value="">すべて</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* サマリ */}
      <div className="bg-white rounded-lg border p-4">
        <div className="text-sm">
          <span className="font-medium">総バナー数:</span> {aggregation.total_banners}
        </div>
      </div>

      {/* 要素の出現率 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">要素の出現率</h3>
        <div className="bg-white rounded-lg border">
          <div className="divide-y">
            {filteredComponentFrequencies.map((cf, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between">
                <span className="font-medium">{cf.type}</span>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {cf.count}回 ({cf.percentage}%)
                  </div>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${cf.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 訴求軸の出現率 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">訴求軸の出現率</h3>
        <div className="bg-white rounded-lg border">
          <div className="divide-y">
            {filteredAppealAxisFrequencies.map((af, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between">
                <span className="font-medium">{af.type}</span>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {af.count}回 ({af.percentage}%)
                  </div>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${af.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* よくある組み合わせ（componentsのみ） */}
      {aggregation.common_combinations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">よくある要素の組み合わせ</h3>
          <div className="bg-white rounded-lg border">
            <div className="divide-y">
              {aggregation.common_combinations.map((combo, idx) => (
                <div key={idx} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{combo.components.join(' + ')}</span>
                    <span className="text-sm text-gray-600">
                      {combo.count}回 ({combo.percentage}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* components×appeal_axesの組み合わせ */}
      {aggregation.component_appeal_combinations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            よくある要素×訴求軸の組み合わせ
          </h3>
          <div className="bg-white rounded-lg border">
            <div className="divide-y">
              {aggregation.component_appeal_combinations.map((combo, idx) => (
                <div key={idx} className="p-4">
                  <div className="mb-2">
                    <div className="font-medium text-blue-600 mb-1">
                      要素: {combo.components.join(' + ')}
                    </div>
                    <div className="font-medium text-green-600">
                      訴求軸: {combo.appeal_axes.join(' + ')}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-600">
                      {combo.count}回 ({combo.percentage}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ブランド別の構成差分 */}
      {aggregation.brand_differences && aggregation.brand_differences.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">ブランド別の構成差分</h3>
          <div className="bg-white rounded-lg border">
            <div className="divide-y">
              {aggregation.brand_differences
                .filter((bd) => !filters.brand || bd.brand === filters.brand)
                .map((bd, idx) => (
                  <div key={idx} className="p-4">
                    <div className="font-medium mb-2">{bd.brand}</div>
                    <div className="space-y-1">
                      {bd.differences.map((diff, diffIdx) => (
                        <div key={diffIdx} className="text-sm text-gray-700">
                          • {diff.detail}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
