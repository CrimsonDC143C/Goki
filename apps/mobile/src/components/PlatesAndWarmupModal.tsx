import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GeneratedWarmupSet,
  WarmupPresetCount,
  WeightUnit,
  calculateBarbellPlatesPerSide,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  generateRampedWarmupSets,
} from '@gymify/game-engine';
import { CRIMSON_ONI } from '../theme';

export interface PlatesAndWarmupModalProps {
  visible: boolean;
  mode?: 'PLATES' | 'WARMUP';
  exerciseName: string;
  equipmentType?: string;
  unit: WeightUnit;
  initialWorkingWeightKg: number;
  barWeightKg: number;
  warmupPresetCount: WarmupPresetCount;
  onSelectBarWeightKg: (barKg: number) => void;
  onSelectWarmupPresetCount: (count: WarmupPresetCount) => void;
  onInsertWarmupSets: (sets: GeneratedWarmupSet[]) => void;
  onClose: () => void;
}

const BAR_PRESETS: readonly { barKg: number; labelKg: string; labelLbs: string }[] = [
  { barKg: 20, labelKg: '20kg Bar', labelLbs: '45lb Bar' },
  { barKg: 15, labelKg: '15kg Bar', labelLbs: '35lb Bar' },
  { barKg: 10, labelKg: '10kg EZ/Smith', labelLbs: '25lb EZ/Smith' },
  { barKg: 0, labelKg: '0kg Landmine/Pin', labelLbs: '0lb Landmine/Pin' },
];

const WARMUP_COUNT_OPTIONS: readonly {
  count: WarmupPresetCount;
  title: string;
  sub: string;
}[] = [
  { count: 1, title: '1 Set', sub: 'Quick (65%)' },
  { count: 2, title: '2 Sets', sub: '50% · 75%' },
  { count: 3, title: '3 Sets', sub: '45% · 65% · 82%' },
];

export const PlatesAndWarmupModal: React.FC<PlatesAndWarmupModalProps> = ({
  visible,
  mode = 'PLATES',
  exerciseName,
  unit,
  initialWorkingWeightKg,
  barWeightKg,
  warmupPresetCount,
  onSelectBarWeightKg,
  onSelectWarmupPresetCount,
  onInsertWarmupSets,
  onClose,
}) => {
  const [targetWeightStr, setTargetWeightStr] = useState<string>(() =>
    formatCleanWeightNumber(convertKgToDisplayWeight(initialWorkingWeightKg, unit))
  );

  useEffect(() => {
    if (visible) {
      setTargetWeightStr(
        formatCleanWeightNumber(convertKgToDisplayWeight(initialWorkingWeightKg, unit))
      );
    }
  }, [initialWorkingWeightKg, unit, visible]);

  const effectiveTargetKg = useMemo(
    () => convertDisplayWeightToKg(Math.max(0, Number(targetWeightStr) || 0), unit),
    [targetWeightStr, unit]
  );

  const platePlan = useMemo(
    () =>
      calculateBarbellPlatesPerSide({
        targetWeightKg: effectiveTargetKg,
        barWeightKg,
        unit,
      }),
    [barWeightKg, effectiveTargetKg, unit]
  );

  const warmupSets = useMemo(
    () =>
      generateRampedWarmupSets({
        workingWeightKg: effectiveTargetKg,
        presetCount: warmupPresetCount,
        unit,
        barWeightKg,
      }),
    [barWeightKg, effectiveTargetKg, unit, warmupPresetCount]
  );

  const unitSuffix = unit === 'LBS' ? 'lb' : 'kg';

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.eyebrow}>
                {mode === 'WARMUP' ? '🌡️ WARM-UP SETS' : '🧮 BARBELL PLATES VISUALIZER'}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {exerciseName}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Working Target Weight Input + Bar Selector */}
          <View style={styles.targetRow}>
            <Text style={styles.targetLabel}>Working Set Target ({unit}):</Text>
            <TextInput
              style={styles.targetInput}
              value={targetWeightStr}
              onChangeText={(v) => setTargetWeightStr(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor={CRIMSON_ONI.ashMuted}
            />
          </View>

          <View style={styles.barSelectorRow}>
            {BAR_PRESETS.map((bp) => {
              const active = Math.abs(barWeightKg - bp.barKg) < 0.5;
              return (
                <TouchableOpacity
                  key={bp.barKg}
                  style={[styles.barPill, active && styles.barPillActive]}
                  onPress={() => onSelectBarWeightKg(bp.barKg)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.barPillText, active && styles.barPillTextActive]}>
                    {unit === 'LBS' ? bp.labelLbs : bp.labelKg}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Mode 1: Visual Plate Loader */}
          {mode === 'PLATES' && (
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>
                {platePlan.loadingMode === 'SINGLE_HORN'
                  ? 'LANDMINE / SINGLE-PIN LOADOUT'
                  : 'PLATES PER SIDE OF BAR'}
              </Text>

              {platePlan.plates.length > 0 ? (
                <View style={styles.plateRackRow}>
                  <View style={styles.barSleeveStub} />
                  {platePlan.plates.flatMap((item, pIdx) =>
                    Array.from({ length: Math.min(item.count, 6) }).map((_, cIdx) => {
                      const isLightText =
                        item.colorHex === '#F8FAFC' || item.colorHex === '#EAB308';
                      return (
                        <View
                          key={`${pIdx}_${cIdx}`}
                          style={[
                            styles.plateVisualChip,
                            {
                              backgroundColor: item.colorHex,
                              height: Math.max(30, Math.min(48, 26 + item.plateWeight * 0.85)),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.plateVisualText,
                              isLightText && { color: '#111827' },
                            ]}
                          >
                            {formatCleanWeightNumber(item.plateWeight)}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              <Text style={styles.plateSummaryText}>{platePlan.summaryText}</Text>
              {platePlan.remainderDisplayWeight > 0 ? (
                <Text style={styles.remainderHint}>
                  Closest loadable total: {formatCleanWeightNumber(platePlan.achievableDisplayWeight)}
                  {unitSuffix} ({formatCleanWeightNumber(platePlan.remainderDisplayWeight)}
                  {unitSuffix} micro-gap)
                </Text>
              ) : null}
            </View>
          )}

          {/* Mode 2: Configurable 1 / 2 / 3-Set Warm-Up Generator */}
          {mode === 'WARMUP' && (
            <View style={styles.sectionBox}>
              <View style={styles.warmupHeaderRow}>
                <Text style={styles.sectionTitle}>RAMPED WARM-UP GENERATOR</Text>
                <Text style={styles.rememberedHint}>Saved preference</Text>
              </View>

              <View style={styles.warmupCountRow}>
                {WARMUP_COUNT_OPTIONS.map((opt) => {
                  const active = warmupPresetCount === opt.count;
                  return (
                    <TouchableOpacity
                      key={opt.count}
                      style={[styles.warmupCountBtn, active && styles.warmupCountBtnActive]}
                      onPress={() => onSelectWarmupPresetCount(opt.count)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.warmupCountTitle,
                          active && styles.warmupCountTitleActive,
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text style={styles.warmupCountSub}>{opt.sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {warmupSets.length > 0 ? (
                <View style={styles.warmupPreviewList}>
                  {warmupSets.map((ws) => (
                    <View key={ws.stepNumber} style={styles.warmupPreviewRow}>
                      <Text style={styles.warmupTag}>[W{ws.stepNumber}]</Text>
                      <Text style={styles.warmupPct}>{ws.percentageLabel}</Text>
                      <Text style={styles.warmupVal}>
                        {formatCleanWeightNumber(ws.displayWeight)}
                        {unitSuffix} × {ws.reps} reps
                      </Text>
                      <Text style={styles.warmupRpe}>@ RPE {ws.rpe}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyWarmupHint}>
                  Enter a working weight above 0 to preview ramped warm-up sets.
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.insertWarmupBtn,
                  warmupSets.length === 0 && styles.insertWarmupBtnDisabled,
                ]}
                disabled={warmupSets.length === 0}
                onPress={() => {
                  onInsertWarmupSets(warmupSets);
                  onClose();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.insertWarmupBtnText}>
                  ⚡ Insert {warmupPresetCount} Warm-Up Set{warmupPresetCount > 1 ? 's' : ''} at Top
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 10, 14, 0.84)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    padding: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '800',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18171D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#35323E',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  targetLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
  },
  targetInput: {
    width: 86,
    backgroundColor: '#25232E',
    borderColor: CRIMSON_ONI.agedGold,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  barSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  barPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3B3846',
    backgroundColor: '#1B1A21',
  },
  barPillActive: {
    borderColor: CRIMSON_ONI.agedGold,
    backgroundColor: '#352814',
  },
  barPillText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  barPillTextActive: {
    color: '#FDE68A',
  },
  sectionBox: {
    backgroundColor: '#17161C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F2C38',
    padding: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  plateRackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    marginBottom: 4,
  },
  barSleeveStub: {
    width: 14,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    marginRight: 2,
  },
  plateVisualChip: {
    minWidth: 26,
    paddingHorizontal: 5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  plateVisualText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  plateSummaryText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  remainderHint: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 3,
  },
  warmupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rememberedHint: {
    color: '#6B7280',
    fontSize: 10,
    fontStyle: 'italic',
  },
  warmupCountRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  warmupCountBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#373443',
    backgroundColor: '#211F29',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  warmupCountBtnActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#122938',
  },
  warmupCountTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '900',
  },
  warmupCountTitleActive: {
    color: '#7DD3FC',
  },
  warmupCountSub: {
    color: '#9CA3AF',
    fontSize: 9,
    marginTop: 1,
    fontWeight: '700',
  },
  warmupPreviewList: {
    gap: 4,
    marginBottom: 10,
  },
  warmupPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#211F28',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 8,
  },
  warmupTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '900',
    width: 32,
  },
  warmupPct: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    width: 34,
  },
  warmupVal: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  warmupRpe: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyWarmupHint: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  insertWarmupBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  insertWarmupBtnDisabled: {
    opacity: 0.45,
  },
  insertWarmupBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
