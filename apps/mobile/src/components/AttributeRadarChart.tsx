import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  calculateStatRadarGeometry,
  StatInputMap,
} from '@gymify/game-engine';

export interface AttributeRadarChartProps {
  stats: StatInputMap;
  height?: number;
  width?: number | string;
  testID?: string;
}

/**
 * Builds the SVG markup dynamically for the 7-stat attribute synergy radar matrix.
 * Accurately translates real stat levels and current XP progression into regular/skewed
 * polygon vertices and coordinates against concentric heptagonal grid rings.
 *
 * Geometry & Scaling:
 * - Center: (160, 160) inside viewBox="0 0 320 320"
 * - Outer web radius: 112 px (Ring 4 = 100%)
 * - Grid rings: Ring 1 (25% = 28px), Ring 2 (50% = 56px), Ring 3 (75% = 84px), Ring 4 (100% = 112px)
 * - Level 1 baseline: Sits precisely at Ring 1 (25% radius), rendering a perfectly balanced,
 *   symmetrical regular heptagon for freshly created characters.
 * - Dynamic expansion: As stats gain XP and level up, vertices smoothly pull outward toward
 *   the outer boundary according to tier caps (Lv. 10, 25, 50, 100).
 */
export function buildDynamicStatRadarSvg(stats: StatInputMap): {
  svg: string;
  scaleMax: number;
} {
  const geometry = calculateStatRadarGeometry(stats);

  const labelsAndPipsSvg = geometry.vertices
    .map(
      (v) => `    <g>
      <text x="${v.labelX.toFixed(2)}" y="${v.labelY.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${v.color}" font-family="Cinzel-Bold, system-ui, sans-serif" font-size="13" font-weight="bold">${v.abbrev}</text>
      <circle cx="${v.x.toFixed(2)}" cy="${v.y.toFixed(2)}" r="5" fill="#090C12" stroke="${v.color}" stroke-width="2.5" role="button" aria-label="${v.name}: Lv.${v.level} (${v.xp}/${v.nextReq} XP)"></circle>
    </g>`
    )
    .join('\n');

  const svg = `<svg viewBox="0 0 320 320" class="w-full overflow-visible" role="img" aria-label="${geometry.ariaLabel}">
  <defs>
    <radialGradient id="radar-synergy-fill">
      <stop offset="0" stop-color="#DFB660" stop-opacity="0.15"></stop>
      <stop offset="1" stop-color="#8B2637" stop-opacity="0.55"></stop>
    </radialGradient>
  </defs>
  <!-- Concentric Reference Heptagons (25%, 50%, 75%, 100%) -->
  <polygon points="160,132 181.89128150910483,142.54228554795546 187.29798154109108,166.23058615077682 172.14874469529164,185.22712830126773 147.8512553047084,185.22712830126773 132.70201845890892,166.23058615077682 138.10871849089517,142.54228554795546" fill="none" stroke="#273248" stroke-width="1" stroke-dasharray="3 4"></polygon>
  <polygon points="160,104 203.78256301820966,125.08457109591092 214.59596308218212,172.4611723015536 184.29748939058325,210.45425660253548 135.70251060941675,210.45425660253548 105.40403691781788,172.4611723015536 116.21743698179033,125.08457109591093" fill="none" stroke="#273248" stroke-width="1" stroke-dasharray="3 4"></polygon>
  <polygon points="160,76 225.67384452731451,107.62685664386639 241.89394462327317,178.69175845233042 196.4462340858749,235.6813849038032 123.55376591412512,235.6813849038032 78.10605537672681,178.69175845233042 94.32615547268549,107.6268566438664" fill="none" stroke="#273248" stroke-width="1" stroke-dasharray="3 4"></polygon>
  <polygon points="160,48 247.56512603641934,90.16914219182185 269.19192616436425,184.9223446031072 208.5949787811665,260.90851320507096 111.4050212188335,260.90851320507096 50.80807383563575,184.92234460310723 72.43487396358066,90.16914219182186" fill="#121722" stroke="#273248" stroke-width="1.5"></polygon>
  <!-- Axis Spokes -->
  <line x1="160" y1="160" x2="160" y2="48" stroke="#273248"></line>
  <line x1="160" y1="160" x2="247.56512603641934" y2="90.16914219182185" stroke="#273248"></line>
  <line x1="160" y1="160" x2="269.19192616436425" y2="184.9223446031072" stroke="#273248"></line>
  <line x1="160" y1="160" x2="208.5949787811665" y2="260.90851320507096" stroke="#273248"></line>
  <line x1="160" y1="160" x2="111.4050212188335" y2="260.90851320507096" stroke="#273248"></line>
  <line x1="160" y1="160" x2="50.80807383563575" y2="184.92234460310723" stroke="#273248"></line>
  <line x1="160" y1="160" x2="72.43487396358066" y2="90.16914219182186" stroke="#273248"></line>
  <!-- Dynamic Stat Polygon -->
  <polygon points="${geometry.polygonPoints}" fill="url(#radar-synergy-fill)" stroke="#DFB660" stroke-width="2" stroke-linejoin="round" style="transform-origin: 50% 50%;"></polygon>
  <!-- Stat Labels & Pips -->
${labelsAndPipsSvg}
</svg>`;

  return { svg, scaleMax: geometry.scaleMax };
}

export const AttributeRadarChart: React.FC<AttributeRadarChartProps> = ({
  stats,
  height = 220,
  width = '100%',
  testID,
}) => {
  const { svg } = useMemo(() => buildDynamicStatRadarSvg(stats), [stats]);

  return (
    <View style={[styles.container, { height }]} testID={testID}>
      <SvgXml xml={svg} width={width} height={height} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
