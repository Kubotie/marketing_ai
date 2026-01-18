'use client';

import { useState, useEffect } from 'react';
import UnifiedLayout from '@/components/UnifiedLayout';
import { useProductStore } from '@/store/useProductStore';
import { getImageAssets, deleteImageAsset } from '@/lib/image-asset-db';
import { ImageAsset } from '@/types/image-asset';
import { Grid, List, Search, X } from 'lucide-react';

/**
 * 保存画像一覧ページ
 * /banners/images（/banner-analyzer/imagesの置き換え）
 */
export default function BannersImagesPage() {
  const { activeProduct, products } = useProductStore();
  const [viewMode, setViewMode] = useState<'tile' | 'list'>('tile');
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<ImageAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<ImageAsset | null>(null);
  const [filters, setFilters] = useState<{
    productId?: string;
    hasExtraction?: boolean;
    q?: string;
  }>({
    productId: activeProduct?.productId,
    hasExtraction: undefined,
    q: '',
  });

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [assets, filters]);

  useEffect(() => {
    if (activeProduct) {
      setFilters((prev) => ({ ...prev, productId: activeProduct.productId }));
    }
  }, [activeProduct]);

  const loadAssets = () => {
    const loaded = getImageAssets();
    setAssets(loaded);
  };

  const applyFilters = () => {
    let filtered = [...assets];

    if (filters.productId) {
      filtered = filtered.filter((a) => a.productId === filters.productId);
    }
    if (filters.hasExtraction !== undefined) {
      filtered = filtered.filter((a) => a.hasExtraction === filters.hasExtraction);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.title && a.title.toLowerCase().includes(q)) ||
          (a.tags && a.tags.some((tag) => tag.toLowerCase().includes(q))) ||
          (a.notes && a.notes.toLowerCase().includes(q))
      );
    }

    setFilteredAssets(filtered);
  };

  const handleDelete = (imageId: string) => {
    if (window.confirm('この画像を削除しますか？')) {
      deleteImageAsset(imageId);
      loadAssets();
      if (selectedAsset?.imageId === imageId) {
        setSelectedAsset(null);
      }
    }
  };

  return (
    <UnifiedLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">保存画像一覧</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('tile')}
                className={`p-2 rounded ${
                  viewMode === 'tile' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
                title="タイル表示"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
                title="一覧表示"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* フィルタ */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">サービス・製品</label>
                <select
                  value={filters.productId || ''}
                  onChange={(e) => setFilters({ ...filters, productId: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">すべて</option>
                  {products.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Extraction状態</label>
                <select
                  value={filters.hasExtraction === undefined ? '' : filters.hasExtraction ? 'true' : 'false'}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      hasExtraction: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">すべて</option>
                  <option value="true">Extractionあり</option>
                  <option value="false">Extractionなし</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">検索</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={filters.q || ''}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                    placeholder="タイトル、タグ、メモで検索"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="flex gap-6">
            {/* メインエリア */}
            <div className={selectedAsset ? 'flex-1' : 'w-full'}>
              {viewMode === 'tile' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.imageId}
                      onClick={() => setSelectedAsset(asset)}
                      className="bg-white rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow"
                    >
                      <div className="aspect-square bg-gray-100 rounded-t-lg overflow-hidden">
                        <img
                          src={asset.storageRef || (asset as any).imageUrl}
                          alt={asset.title || '画像'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{asset.title || '無題'}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {asset.hasExtraction && (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                              Extractionあり
                            </span>
                          )}
                          {asset.hasManualLayout && (
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                              レイアウトあり
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.imageId}
                      onClick={() => setSelectedAsset(asset)}
                      className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition-shadow flex items-center gap-4"
                    >
                      <div className="w-24 h-24 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        <img
                          src={asset.storageRef || (asset as any).imageUrl} alt={asset.title || '画像'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{asset.title || '無題'}</h3>
                        <p className="text-sm text-gray-600">
                          {asset.productId && products.find((p) => p.productId === asset.productId)?.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          更新: {new Date(asset.updatedAt).toLocaleString('ja-JP')}
                        </p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {asset.hasExtraction && (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                              Extractionあり
                            </span>
                          )}
                          {asset.hasManualLayout && (
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                              レイアウトあり
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filteredAssets.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  保存された画像がありません
                </div>
              )}
            </div>

            {/* 詳細ペイン */}
            {selectedAsset && (
              <div className="w-96 bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold">{selectedAsset.title || '無題'}</h3>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mb-4">
                  <img
                    src={selectedAsset.storageRef || (selectedAsset as any).imageUrl}
                    alt={selectedAsset.title || '画像'}
                    className="w-full rounded-lg"
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">サービス・製品:</span>{' '}
                    {selectedAsset.productId
                      ? products.find((p) => p.productId === selectedAsset.productId)?.name || '不明'
                      : '未設定'}
                  </div>
                  <div>
                    <span className="font-medium">Extraction:</span>{' '}
                    {selectedAsset.hasExtraction ? 'あり' : 'なし'}
                  </div>
                  <div>
                    <span className="font-medium">レイアウト:</span>{' '}
                    {selectedAsset.hasManualLayout ? 'あり' : 'なし'}
                    {selectedAsset.lastLayoutKbId && (
                      <span className="text-xs text-gray-500 ml-2">
                        (KB ID: {selectedAsset.lastLayoutKbId.substring(0, 8)}...)
                      </span>
                    )}
                  </div>
                  {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                    <div>
                      <span className="font-medium">タグ:</span>{' '}
                      {selectedAsset.tags.map((tag, idx) => (
                        <span key={idx} className="inline-block px-2 py-0.5 bg-gray-100 rounded text-xs mr-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedAsset.notes && (
                    <div>
                      <span className="font-medium">メモ:</span>
                      <p className="text-gray-700">{selectedAsset.notes}</p>
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    作成: {new Date(selectedAsset.createdAt).toLocaleString('ja-JP')}
                    <br />
                    更新: {new Date(selectedAsset.updatedAt).toLocaleString('ja-JP')}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleDelete(selectedAsset.imageId)}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </UnifiedLayout>
  );
}
