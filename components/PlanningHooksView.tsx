'use client';

import { PlanningHook } from '@/types/schema';

interface PlanningHooksViewProps {
  hooks: PlanningHook[];
}

export default function PlanningHooksView({ hooks }: PlanningHooksViewProps) {
  const getOptionColor = (optionType: PlanningHook['strategy_option']) => {
    switch (optionType) {
      case 'A':
        return 'border-l-blue-500';
      case 'B':
        return 'border-l-green-500';
      case 'C':
        return 'border-l-orange-500';
      default:
        return 'border-l-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {hooks.length === 0 ? (
        <div className="text-center text-gray-500 py-8">企画フックがありません</div>
      ) : (
        hooks.map((hook, idx) => (
          <div key={idx} className="bg-white rounded-lg border p-6">
            <div className="mb-4">
              <span className="text-lg font-semibold">Option {hook.strategy_option}</span>
            </div>

            <div className="space-y-4">
              {hook.hooks.map((h, hookIdx) => (
                <div
                  key={hookIdx}
                  className={`border-l-4 pl-4 py-3 ${getOptionColor(hook.strategy_option)}`}
                >
                  {/* 質問（考えるフック） */}
                  <div className="mb-2">
                    <div className="text-sm font-medium text-gray-600 mb-1">【考えるフック】</div>
                    <div className="text-base font-semibold text-gray-900">{h.question}</div>
                  </div>

                  {/* 背景・文脈 */}
                  {h.context && (
                    <div>
                      <div className="text-sm font-medium text-gray-600 mb-1">【背景・文脈】</div>
                      <div className="text-sm text-gray-700">{h.context}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
