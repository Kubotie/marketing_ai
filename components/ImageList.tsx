'use client';

import { Extraction } from '@/types/schema';

interface ImageListProps {
  banners: Array<{ id: string; imageUrl: string; extraction: Extraction }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: {
    appealAxis?: string;
    component?: string;
  };
  onFilterChange: (filters: { appealAxis?: string; component?: string }) => void;
  highlightedBannerIds?: Set<string>;
}

export default function ImageList({
  banners,
  selectedId,
  onSelect,
  filters,
  onFilterChange,
  highlightedBannerIds = new Set(),
}: ImageListProps) {
  // フィルタリング
  const filteredBanners = banners.filter((banner) => {
    if (filters.appealAxis) {
      const hasAppeal = banner.extraction.appeal_axes.some(
        (a) => a.type === filters.appealAxis
      );
      if (!hasAppeal) return false;
    }
    if (filters.component) {
      const hasComponent = banner.extraction.components.some(
        (c) => c.type === filters.component
      );
      if (!hasComponent) return false;
    }
    return true;
  });

  // ユニークな訴求軸とコンポーネントを取得
  const uniqueAppealAxes = Array.from(
    new Set(banners.flatMap((b) => b.extraction.appeal_axes.map((a) => a.type)))
  );
  const uniqueComponents = Array.from(
    new Set(banners.flatMap((b) => b.extraction.components.map((c) => c.type)))
  );

  return (
    <div className="h-full flex flex-col">
      {/* フィルタ */}
      <div className="p-4 border-b space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">訴求軸でフィルタ</label>
          <select
            className="w-full px-3 py-2 border rounded"
            value={filters.appealAxis || ''}
            onChange={(e) =>
              onFilterChange({ ...filters, appealAxis: e.target.value || undefined })
            }
          >
            <option value="">すべて</option>
            {uniqueAppealAxes.map((axis) => (
              <option key={axis} value={axis}>
                {axis}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">要素でフィルタ</label>
          <select
            className="w-full px-3 py-2 border rounded"
            value={filters.component || ''}
            onChange={(e) =>
              onFilterChange({ ...filters, component: e.target.value || undefined })
            }
          >
            <option value="">すべて</option>
            {uniqueComponents.map((comp) => (
              <option key={comp} value={comp}>
                {comp}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 画像一覧 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredBanners.map((banner) => (
            <div
              key={banner.id}
              className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                selectedId === banner.id
                  ? 'border-blue-500 shadow-lg'
                  : highlightedBannerIds.has(banner.id)
                  ? 'border-yellow-500 shadow-md bg-yellow-50'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => onSelect(banner.id)}
            >
              <img
                src={banner.imageUrl}
                alt={`バナー ${banner.id}`}
                className="w-full h-auto"
              />
              <div className="p-2 bg-white text-xs">
                <div className="font-medium truncate">{banner.id}</div>
                {banner.extraction.brand && (
                  <div className="text-gray-600">{banner.extraction.brand}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {filteredBanners.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            フィルタ条件に一致するバナーがありません
          </div>
        )}
      </div>
    </div>
  );
}
