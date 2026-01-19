'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { usePersonaStore } from '@/store/usePersonaStore';

interface MenuItem {
  label: string;
  path: string;
  locked?: boolean;
  unlockCondition?: () => boolean; // 鍵を外す条件
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function UnifiedSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isExtractionFinalized, aggregation, personas, personaAxes } = usePersonaStore();

  // メニューセクション（動的にロック状態を判定）
  const menuSections: MenuSection[] = [
    {
      title: 'サービス・製品登録',
      items: [
        { label: 'サービス・製品登録', path: '/products' },
      ],
    },
    {
      title: 'ペルソナ要約・比較',
      items: [
        { label: 'データ入力', path: '/persona-app?step=input' },
        { label: 'Extraction生成・確認', path: '/persona-app?step=extraction' },
        { 
          label: 'Aggregation', 
          path: '/persona-app?step=aggregation', 
          locked: true,
          unlockCondition: () => isExtractionFinalized()
        },
        { 
          label: 'ペルソナ軸設定', 
          path: '/persona-app?step=persona-axis', 
          locked: true,
          unlockCondition: () => !!aggregation && aggregation.clusters.length > 0
        },
        { 
          label: 'Persona', 
          path: '/persona-app?step=summary', 
          locked: true,
          unlockCondition: () => !!aggregation && personaAxes.length > 0
        },
        { 
          label: '比較', 
          path: '/persona-app?step=comparison', 
          locked: true,
          unlockCondition: () => personas.length >= 2
        },
      ],
    },
    {
      title: 'バナー分析',
      items: [
        { label: '画像読み込み', path: '/banner-analyzer' },
        { label: '保存画像一覧', path: '/banner-analyzer/images' },
        { label: '個別分析(A)', path: '/banner-analyzer?tab=analysis' },
        { label: '集計(B)', path: '/banner-analyzer?tab=aggregation' },
        { label: '市場インサイト(C1)', path: '/banner-analyzer?tab=insight' },
        { label: '戦略オプション(C2)', path: '/banner-analyzer?tab=strategy' },
        { label: '企画フック(D)', path: '/banner-analyzer?tab=planning' },
        { label: 'ペルソナ企画サマリー', path: '/banner-analyzer?tab=summary' },
      ],
    },
    {
      title: 'ワークフロー',
      items: [
        { label: 'ワークフロー', path: '/workflow' },
        { label: '成果物一覧', path: '/workflow/artifacts' },
      ],
    },
    {
      title: 'ナレッジベース',
      items: [
        { label: 'ナレッジベース', path: '/kb' },
        { label: '確定Extraction一覧', path: '/extractions' },
      ],
    },
  ];

  const handleNavigation = (path: string, item: MenuItem) => {
    // ロック状態を動的に判定
    const isActuallyLocked = item.locked && (!item.unlockCondition || !item.unlockCondition());
    
    if (isActuallyLocked) {
      // ロックされている場合でもクリック可能にして、条件を満たしていれば遷移
      if (item.unlockCondition && item.unlockCondition()) {
        // 条件を満たしている場合は遷移
        const [basePath, query] = path.split('?');
        if (query) {
          router.push(`${basePath}?${query}`);
        } else {
          router.push(basePath);
        }
      } else {
        // 条件を満たしていない場合は警告
        let message = 'この機能を使用するには、前のステップを完了する必要があります。';
        if (item.path.includes('aggregation')) {
          message = 'Extraction Recordを確定してから進んでください。';
        } else if (item.path.includes('persona-axis')) {
          message = 'Aggregationを生成してから進んでください。';
        } else if (item.path.includes('summary')) {
          message = 'Aggregationとペルソナ軸を設定してから進んでください。';
        } else if (item.path.includes('comparison')) {
          message = 'Personaを2つ以上生成してから進んでください。';
        }
        alert(message);
      }
      return;
    }
    
    const [basePath, query] = path.split('?');
    if (query) {
      router.push(`${basePath}?${query}`);
    } else {
      router.push(basePath);
    }
  };

  // 現在のパスとクエリパラメータを取得
  // パスを正規化（末尾のスラッシュを除去、ただしルートパスは除く）
  const normalizePath = (path: string) => {
    if (path === '/') return path;
    return path.endsWith('/') ? path.slice(0, -1) : path;
  };
  
  const currentPath = normalizePath(pathname);
  // URLから直接クエリパラメータを取得（useSearchParamsを使用）
  const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-4">
        <nav className="space-y-6">
          {menuSections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              <h3 className="text-sm font-bold text-gray-900 mb-2 px-2">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item, itemIdx) => {
                  const pathParts = item.path.split('?');
                  const itemBasePath = normalizePath(pathParts[0]);
                  const itemQuery = pathParts[1] || '';
                  
                  // 完全一致でハイライト判定（パスとクエリパラメータの両方が一致する場合のみ）
                  let isActive = false;
                  if (currentPath === itemBasePath) {
                    // クエリパラメータの有無が一致しているか確認
                    const hasItemQuery = itemQuery.length > 0;
                    const hasCurrentQuery = currentSearch.length > 0;
                    
                    if (hasItemQuery === hasCurrentQuery) {
                      if (!hasItemQuery) {
                        // 両方ともクエリパラメータがない場合
                        isActive = true;
                      } else {
                        // 両方ともクエリパラメータがある場合、完全一致を確認
                        try {
                          const itemParams = new URLSearchParams(itemQuery);
                          const currentParams = new URLSearchParams(currentSearch);
                          
                          // すべてのキーと値が一致するか確認
                          const itemKeys = Array.from(itemParams.keys()).sort();
                          const currentKeys = Array.from(currentParams.keys()).sort();
                          
                          if (itemKeys.length === currentKeys.length) {
                            isActive = itemKeys.every(key => 
                              itemParams.get(key) === currentParams.get(key)
                            );
                          }
                        } catch (e) {
                          // URLSearchParamsのパースエラーが発生した場合は一致しない
                          isActive = false;
                        }
                      }
                    }
                  }
                  
                  // ロック状態を動的に判定
                  const isActuallyLocked = item.locked && (!item.unlockCondition || !item.unlockCondition());
                  const canUnlock = item.locked && item.unlockCondition && item.unlockCondition();
                  
                  return (
                    <button
                      key={itemIdx}
                      onClick={() => handleNavigation(item.path, item)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 font-medium'
                          : isActuallyLocked && !canUnlock
                          ? 'text-gray-400 hover:bg-gray-50 cursor-pointer'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      title={isActuallyLocked && !canUnlock ? '前のステップを完了してください' : ''}
                    >
                      <span className="text-left">{item.label}</span>
                      {isActuallyLocked && !canUnlock && (
                        <Lock className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 ml-2" />
                      )}
                      {isActuallyLocked && canUnlock && (
                        <Lock className="w-3.5 h-3.5 text-green-500 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
