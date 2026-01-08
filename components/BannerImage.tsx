'use client';

import { useState, useRef, useEffect } from 'react';
import { BBox } from '@/types/schema';

interface BannerImageProps {
  imageUrl: string;
  width: number;
  height: number;
  bboxes: Array<{ bbox: BBox; label: string; color: string }>;
}

export default function BannerImage({ imageUrl, width, height, bboxes }: BannerImageProps) {
  const [selectedBbox, setSelectedBbox] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayWidth, setDisplayWidth] = useState<number>(width);
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const calculatedScale = containerWidth / width;
      setScale(calculatedScale);
      setDisplayWidth(width * calculatedScale);
    }
  }, [width]);

  return (
    <div ref={containerRef} className="relative w-full bg-gray-100 rounded-lg overflow-auto">
      <div className="relative" style={{ width: `${displayWidth}px`, height: `${height * scale}px` }}>
        <img
          src={imageUrl}
          alt="バナー画像"
          className="block"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        
        {/* BBox オーバーレイ */}
        {bboxes.map((item, index) => {
          const { bbox, label, color } = item;
          const isSelected = selectedBbox === index;
          
          return (
            <div
              key={index}
              className="absolute border-2 cursor-pointer transition-all hover:opacity-80"
              style={{
                left: `${bbox.x * scale}px`,
                top: `${bbox.y * scale}px`,
                width: `${bbox.w * scale}px`,
                height: `${bbox.h * scale}px`,
                borderColor: isSelected ? color : color,
                backgroundColor: isSelected ? `${color}40` : 'transparent',
                zIndex: isSelected ? 20 : 10,
              }}
              onClick={() => setSelectedBbox(isSelected ? null : index)}
            >
              {/* ラベル */}
              <div
                className="absolute -top-6 left-0 px-2 py-1 text-xs text-white rounded"
                style={{ backgroundColor: color }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
