'use client';

import { StrategyOption } from '@/types/schema';

interface StrategyOptionsViewProps {
  options: StrategyOption[];
}

export default function StrategyOptionsView({ options }: StrategyOptionsViewProps) {
  const getOptionColor = (optionType: StrategyOption['option_type']) => {
    switch (optionType) {
      case 'A':
        return 'border-blue-500 bg-blue-50';
      case 'B':
        return 'border-green-500 bg-green-50';
      case 'C':
        return 'border-orange-500 bg-orange-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      {options.length === 0 ? (
        <div className="text-center text-gray-500 py-8">戦略オプションがありません</div>
      ) : (
        options.map((option, idx) => (
          <div
            key={idx}
            className={`border-2 rounded-lg p-6 ${getOptionColor(option.option_type)}`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="text-2xl font-bold">Option {option.option_type}</div>
              <div className="text-lg font-semibold">{option.title}</div>
            </div>

            {/* 参考にしている競合要素 */}
            {((option.referenced_elements.components?.length ?? 0) > 0 ||
              (option.referenced_elements.appeal_axes?.length ?? 0) > 0) && (
              <div className="mb-4 p-3 bg-white rounded border">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  参考にしている競合要素
                </div>
                {(option.referenced_elements.components?.length ?? 0) > 0 && (
                  <div className="text-sm text-gray-600 mb-1">
                    要素: {option.referenced_elements.components!.join(', ')}
                  </div>
                )}
                {(option.referenced_elements.appeal_axes?.length ?? 0) > 0 && (
                  <div className="text-sm text-gray-600">
                    訴求軸: {option.referenced_elements.appeal_axes!.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* あえて使わない要素 */}
            {((option.avoided_elements.components?.length ?? 0) > 0 ||
              (option.avoided_elements.appeal_axes?.length ?? 0) > 0) && (
              <div className="mb-4 p-3 bg-white rounded border">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  あえて使わない要素
                </div>
                {(option.avoided_elements.components?.length ?? 0) > 0 && (
                  <div className="text-sm text-gray-600 mb-1">
                    要素: {option.avoided_elements.components!.join(', ')}
                  </div>
                )}
                {(option.avoided_elements.appeal_axes?.length ?? 0) > 0 && (
                  <div className="text-sm text-gray-600">
                    訴求軸: {option.avoided_elements.appeal_axes!.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* 想定されるメリット */}
            {option.potential_benefits.length > 0 && (
              <div className="mb-4 p-3 bg-white rounded border border-green-300">
                <div className="text-sm font-medium text-green-700 mb-2">
                  想定されるメリット（仮説）
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {option.potential_benefits.map((benefit, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 想定されるリスク */}
            {option.potential_risks.length > 0 && (
              <div className="mb-4 p-3 bg-white rounded border border-red-300">
                <div className="text-sm font-medium text-red-700 mb-2">
                  想定されるリスク（仮説）
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {option.potential_risks.map((risk, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 想定ペルソナ */}
            {option.target_persona && (
              <div className="p-3 bg-white rounded border">
                <div className="text-sm font-medium text-gray-700 mb-1">想定ペルソナ</div>
                <div className="text-sm text-gray-600">{option.target_persona}</div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
