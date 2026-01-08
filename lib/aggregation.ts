import { Extraction, Aggregation, ComponentAppealCombination, BrandDifference } from '@/types/schema';

/**
 * Aggregation (B) 生成
 * 事実のみを集計（解釈・評価は禁止）
 */
export function generateAggregation(extractions: Extraction[]): Aggregation {
  const totalBanners = extractions.length;

  // コンポーネント頻度
  const componentCounts: Record<string, number> = {};
  extractions.forEach((ext) => {
    ext.components.forEach((comp) => {
      componentCounts[comp.type] = (componentCounts[comp.type] || 0) + 1;
    });
  });

  const componentFrequencies = Object.entries(componentCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / totalBanners) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // 訴求軸頻度
  const appealCounts: Record<string, number> = {};
  extractions.forEach((ext) => {
    ext.appeal_axes.forEach((appeal) => {
      appealCounts[appeal.type] = (appealCounts[appeal.type] || 0) + 1;
    });
  });

  const appealAxisFrequencies = Object.entries(appealCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / totalBanners) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // よくある組み合わせ（componentsのみ）
  const componentCombinationCounts: Record<string, { count: number; bannerIds: string[] }> = {};
  extractions.forEach((ext) => {
    const compTypes = ext.components.map((c) => c.type).sort().join(',');
    if (!componentCombinationCounts[compTypes]) {
      componentCombinationCounts[compTypes] = { count: 0, bannerIds: [] };
    }
    componentCombinationCounts[compTypes].count += 1;
    componentCombinationCounts[compTypes].bannerIds.push(ext.banner_id);
  });

  const commonCombinations = Object.entries(componentCombinationCounts)
    .filter(([, data]) => data.count >= 2)
    .map(([combo, data]) => ({
      components: combo.split(','),
      count: data.count,
      percentage: Math.round((data.count / totalBanners) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // components×appeal_axesの組み合わせ
  const componentAppealCombinationCounts: Record<string, { count: number; bannerIds: string[] }> = {};
  extractions.forEach((ext) => {
    const compTypes = ext.components.map((c) => c.type).sort().join(',');
    const appealTypes = ext.appeal_axes.map((a) => a.type).sort().join(',');
    const key = `${compTypes}|${appealTypes}`;
    
    if (!componentAppealCombinationCounts[key]) {
      componentAppealCombinationCounts[key] = { count: 0, bannerIds: [] };
    }
    componentAppealCombinationCounts[key].count += 1;
    componentAppealCombinationCounts[key].bannerIds.push(ext.banner_id);
  });

  const componentAppealCombinations: ComponentAppealCombination[] = Object.entries(
    componentAppealCombinationCounts
  )
    .filter(([, data]) => data.count >= 2)
    .map(([key, data]) => {
      const [compPart, appealPart] = key.split('|');
      return {
        components: compPart.split(',').filter(Boolean),
        appeal_axes: appealPart.split(',').filter(Boolean),
        count: data.count,
        percentage: Math.round((data.count / totalBanners) * 100),
        banner_ids: data.bannerIds,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  // ブランド別の構成差分
  const brandDifferences = calculateBrandDifferences(extractions);

  return {
    total_banners: totalBanners,
    component_frequencies: componentFrequencies,
    appeal_axis_frequencies: appealAxisFrequencies,
    common_combinations: commonCombinations,
    component_appeal_combinations: componentAppealCombinations,
    brand_differences: brandDifferences,
  };
}

/**
 * ブランド別の構成差分を計算
 * 差分がある場合のみ返す
 */
function calculateBrandDifferences(
  extractions: Extraction[]
): BrandDifference[] | null {
  const brandGroups: Record<string, Extraction[]> = {};
  
  extractions.forEach((ext) => {
    if (ext.brand) {
      if (!brandGroups[ext.brand]) {
        brandGroups[ext.brand] = [];
      }
      brandGroups[ext.brand].push(ext);
    }
  });

  // ブランドが2つ以上ある場合のみ差分を計算
  const brands = Object.keys(brandGroups);
  if (brands.length < 2) {
    return null;
  }

  const differences: BrandDifference[] = [];

  brands.forEach((brand) => {
    const brandExtractions = brandGroups[brand];
    const otherExtractions = extractions.filter((e) => e.brand !== brand && e.brand !== null);

    if (otherExtractions.length === 0) return;

    const brandDifferences: BrandDifference['differences'] = [];

    // コンポーネントの差分
    const brandComponents = new Set(
      brandExtractions.flatMap((e) => e.components.map((c) => c.type))
    );
    const otherComponents = new Set(
      otherExtractions.flatMap((e) => e.components.map((c) => c.type))
    );

    const uniqueToBrand = Array.from(brandComponents).filter((c) => !otherComponents.has(c));
    const missingInBrand = Array.from(otherComponents).filter((c) => !brandComponents.has(c));

    if (uniqueToBrand.length > 0) {
      brandDifferences.push({
        aspect: 'components',
        detail: `${brand}にのみ存在する要素: ${uniqueToBrand.join(', ')}`,
      });
    }
    if (missingInBrand.length > 0) {
      brandDifferences.push({
        aspect: 'components',
        detail: `${brand}に存在しない要素: ${missingInBrand.join(', ')}`,
      });
    }

    // 訴求軸の差分
    const brandAppeals = new Set(
      brandExtractions.flatMap((e) => e.appeal_axes.map((a) => a.type))
    );
    const otherAppeals = new Set(
      otherExtractions.flatMap((e) => e.appeal_axes.map((a) => a.type))
    );

    const uniqueAppealsToBrand = Array.from(brandAppeals).filter((a) => !otherAppeals.has(a));
    const missingAppealsInBrand = Array.from(otherAppeals).filter((a) => !brandAppeals.has(a));

    if (uniqueAppealsToBrand.length > 0) {
      brandDifferences.push({
        aspect: 'appeal_axes',
        detail: `${brand}にのみ存在する訴求軸: ${uniqueAppealsToBrand.join(', ')}`,
      });
    }
    if (missingAppealsInBrand.length > 0) {
      brandDifferences.push({
        aspect: 'appeal_axes',
        detail: `${brand}に存在しない訴求軸: ${missingAppealsInBrand.join(', ')}`,
      });
    }

    if (brandDifferences.length > 0) {
      differences.push({
        brand,
        differences: brandDifferences,
      });
    }
  });

  return differences.length > 0 ? differences : null;
}
