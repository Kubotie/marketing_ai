'use client';

import { useState, useEffect } from 'react';
import UnifiedLayout from '@/components/UnifiedLayout';
import { useProductStore } from '@/store/useProductStore';
import { Product, Competitor } from '@/types/product';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

/**
 * サービス・製品登録・管理ページ
 * /services（/productsのエイリアス）
 */
export default function ServicesPage() {
  const { products, activeProduct, loadProducts, addProduct, updateProduct, removeProduct, setActiveProduct } = useProductStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    category: string;
    description: string;
    competitors: Competitor[];
  }>({
    name: '',
    category: '',
    description: '',
    competitors: [],
  });

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', category: '', description: '', competitors: [] });
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.productId);
    setFormData({
      name: product.name,
      category: product.category || '',
      description: product.description || '',
      competitors: product.competitors || [],
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('商品名は必須です');
      return;
    }

    if (editingId) {
      updateProduct(editingId, {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        competitors: formData.competitors,
      });
      setEditingId(null);
    } else {
      addProduct({
        name: formData.name,
        category: formData.category,
        description: formData.description,
        competitors: formData.competitors,
      });
    }
    setIsCreating(false);
    setFormData({ name: '', category: '', description: '', competitors: [] });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({ name: '', category: '', description: '', competitors: [] });
  };

  const handleDelete = (productId: string) => {
    if (window.confirm('この商品を削除しますか？')) {
      removeProduct(productId);
      if (activeProduct?.productId === productId) {
        setActiveProduct(null);
      }
    }
  };

  const handleAddCompetitor = () => {
    setFormData({
      ...formData,
      competitors: [...formData.competitors, { name: '', url: '' }],
    });
  };

  const handleUpdateCompetitor = (index: number, field: 'name' | 'url', value: string) => {
    const updated = [...formData.competitors];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, competitors: updated });
  };

  const handleRemoveCompetitor = (index: number) => {
    setFormData({
      ...formData,
      competitors: formData.competitors.filter((_, i) => i !== index),
    });
  };

  return (
    <UnifiedLayout>
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">サービス・製品登録</h2>
            <p className="text-gray-600">分析対象のサービス・製品を登録・管理します</p>
          </div>

          {/* 新規作成・編集フォーム */}
          {(isCreating || editingId) && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingId ? '商品を編集' : '新しい商品を追加'}
                </h3>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    商品名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: ECサイト"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    カテゴリ
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: Eコマース"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    説明
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="商品の説明を入力してください"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      競合サービス
                    </label>
                    <button
                      onClick={handleAddCompetitor}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + 追加
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formData.competitors.map((comp, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => handleUpdateCompetitor(idx, 'name', e.target.value)}
                          placeholder="競合サービス名"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="url"
                          value={comp.url}
                          onChange={(e) => handleUpdateCompetitor(idx, 'url', e.target.value)}
                          placeholder="URL"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleRemoveCompetitor(idx)}
                          className="px-3 py-2 text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 商品一覧 */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">登録済み商品</h3>
              {!isCreating && !editingId && (
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  新規追加
                </button>
              )}
            </div>

            <div className="divide-y divide-gray-200">
              {products.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  登録済みの商品がありません。新規追加ボタンから商品を追加してください。
                </div>
              ) : (
                products.map((product) => {
                  const isActive = activeProduct?.productId === product.productId;
                  return (
                    <div
                      key={product.productId}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        isActive ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">
                              {product.name}
                            </h4>
                            {isActive && (
                              <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
                                選択中
                              </span>
                            )}
                          </div>
                          {product.category && (
                            <p className="text-sm text-gray-600 mb-1">
                              カテゴリ: {product.category}
                            </p>
                          )}
                          {product.description && (
                            <p className="text-sm text-gray-700 mb-2">{product.description}</p>
                          )}
                          {product.competitors && product.competitors.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-gray-500 mb-1">
                                競合サービス:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {product.competitors.map((comp, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                                  >
                                    {comp.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {!isActive && (
                            <button
                            onClick={() => setActiveProduct(product.productId)}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              選択
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2 text-gray-600 hover:text-blue-600"
                            title="編集"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.productId)}
                            className="p-2 text-gray-600 hover:text-red-600"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </UnifiedLayout>
  );
}
