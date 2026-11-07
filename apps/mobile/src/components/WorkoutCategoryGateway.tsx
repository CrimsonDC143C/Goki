import React, { useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import {
  WorkoutCategory,
  WORKOUT_CATEGORIES,
  WorkoutCategoryDescriptor,
  WorkoutPresetDefinition,
} from '@gymify/game-engine';
import { MODALITY_BADGE_SVGS } from '../assets/v0Vault';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  GYM: '#E63946',
  CARDIO: '#38BDF8',
  SPORT: '#F59E0B',
  RECOVERY: '#10B981',
};

const CATEGORY_BADGE_SVGS: Record<WorkoutCategory, string> = {
  GYM: MODALITY_BADGE_SVGS.resistance,
  CARDIO: MODALITY_BADGE_SVGS.cardio,
  SPORT: MODALITY_BADGE_SVGS.sport,
  RECOVERY: MODALITY_BADGE_SVGS.yogaMobility,
};

export interface WorkoutCategoryGatewayProps {
  selectedCategory: WorkoutCategory | null;
  secondaryCategories: WorkoutCategory[];
  segmentOrder?: WorkoutCategory[];
  presets: WorkoutPresetDefinition[];
  isOffline?: boolean;
  onSelectPrimaryCategory: (category: WorkoutCategory) => void;
  onAddSecondarySegment: (category: WorkoutCategory) => void;
  onRemoveSecondarySegment: (category: WorkoutCategory) => void;
  onMoveSegment?: (category: WorkoutCategory, direction: -1 | 1) => void;
  onResetCategory: () => void;
  onLoadPreset: (preset: WorkoutPresetDefinition) => void;
  onOpenPresetDesigner?: () => void;
  onOpenTrainingHistory?: () => void;
}

export const WorkoutCategoryGateway: React.FC<WorkoutCategoryGatewayProps> = ({
  selectedCategory,
  secondaryCategories,
  segmentOrder,
  presets,
  isOffline = false,
  onSelectPrimaryCategory,
  onAddSecondarySegment,
  onRemoveSecondarySegment,
  onMoveSegment,
  onLoadPreset,
  onOpenPresetDesigner,
  onOpenTrainingHistory,
}) => {
  const insets = useSafeAreaInsets();
  const safeTop =
    Platform.OS === 'web'
      ? 0
      : Math.max(insets.top, Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 28) + 4);
  const safeBottom =
    Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 12);

  const [showSecondaryPicker, setShowSecondaryPicker] = useState<boolean>(false);
  const [showPresetsDrawer, setShowPresetsDrawer] = useState<boolean>(false);

  // If no category has been selected yet, render the full Gateway selection portal
  if (!selectedCategory) {
    return (
      <View style={styles.gatewayContainer}>
        <View style={styles.gatewayHeader}>
          <Text style={styles.gatewayTitle}>Select Training Discipline</Text>
          <Text style={styles.gatewaySubtitle}>
            {isOffline
              ? 'Offline mode: Distraction-free tracking with rewards queued for world entry.'
              : 'Online mode: Real-time PR Crits, dungeon buffs, and raid channeling active.'}
          </Text>
        </View>

        <View style={styles.categoryGrid}>
          {WORKOUT_CATEGORIES.map((cat: WorkoutCategoryDescriptor) => {
            const color = CATEGORY_COLORS[cat.key];
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryCard, { borderLeftColor: color }]}
                activeOpacity={0.8}
                onPress={() => {
                  triggerSensoryCue('OPEN_WORLD_THRESHOLD_PULSE');
                  onSelectPrimaryCategory(cat.key);
                }}
              >
                <View style={styles.cardHeaderRow}>
                  {CATEGORY_BADGE_SVGS[cat.key] ? (
                    <View style={styles.badgeWrap}>
                      <SvgXml xml={CATEGORY_BADGE_SVGS[cat.key]} width={42} height={42} />
                    </View>
                  ) : (
                    <Text style={styles.cardIcon}>{cat.icon}</Text>
                  )}
                  <View
                    style={[
                      styles.tagBadge,
                      { borderColor: color, backgroundColor: `${color}22` },
                    ]}
                  >
                    <Text style={[styles.tagBadgeText, { color }]}>{cat.shortTitle}</Text>
                  </View>
                </View>

                <Text style={styles.cardTagline}>{cat.title}</Text>
                <Text style={styles.cardDescription}>{cat.subtitle}</Text>
                <Text style={[styles.cardStatFocus, { color }]}>{cat.rpgStatFocus}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Quick Routine Presets Row */}
        <View style={styles.presetSection}>
          <View style={styles.presetSectionHeader}>
            <Text style={styles.presetSectionTitle}>Or Load a Routine Preset</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {onOpenTrainingHistory ? (
                <TouchableOpacity
                  style={styles.historyLinkBtn}
                  onPress={() => {
                    triggerSensoryCue('SET_MICRO_REWARD_TICK');
                    onOpenTrainingHistory();
                  }}
                  testID="gateway-history-link-btn"
                >
                  <Text style={styles.historyLinkText}>📊 Training History</Text>
                </TouchableOpacity>
              ) : null}
              {onOpenPresetDesigner ? (
                <TouchableOpacity
                  style={styles.designerLinkBtn}
                  onPress={() => {
                    triggerSensoryCue('SET_MICRO_REWARD_TICK');
                    onOpenPresetDesigner();
                  }}
                >
                  <Text style={styles.designerLinkText}>+ Preset Designer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {presets.map((preset) => {
              const catDesc = WORKOUT_CATEGORIES.find((c) => c.key === preset.category);
              const exerciseCount = preset.blocks?.exerciseBlocks?.length ?? 0;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={styles.presetChip}
                  onPress={() => {
                    triggerSensoryCue('WORKOUT_PRESET_LOADED');
                    onLoadPreset(preset);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.presetChipIcon}>{catDesc?.icon || '📋'}</Text>
                  <View style={styles.presetChipTextContainer}>
                    <Text style={styles.presetChipName} numberOfLines={1}>
                      {preset.name}
                    </Text>
                    <Text style={styles.presetChipMeta}>
                      {exerciseCount} exercises • {preset.category}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }

  // If a category is selected, render the sleek 1-row segmented discipline bar + Secondary segment controls
  const orderedSegments: WorkoutCategory[] =
    segmentOrder && segmentOrder.length > 0
      ? segmentOrder
      : [
          selectedCategory,
          ...secondaryCategories.filter((c) => c !== selectedCategory),
        ];

  return (
    <View style={styles.compactHeaderBanner}>
      <View style={styles.compactMainRow}>
        {/* Compact 1-Row Segmented Discipline Strip (1-Tap Primary Switch without Inline 4-Card Wall) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          {WORKOUT_CATEGORIES.map((cat) => {
            const isPrimary = cat.key === selectedCategory;
            const isSecondary = secondaryCategories.includes(cat.key);
            const color = CATEGORY_COLORS[cat.key];
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.switchCategoryBtn,
                  isPrimary && [
                    styles.activeCategoryPill,
                    { borderColor: color, backgroundColor: `${color}22`, flex: 0 },
                  ],
                  isSecondary && { borderColor: color, borderStyle: 'dashed' },
                ]}
                onPress={() => {
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                  onSelectPrimaryCategory(cat.key);
                }}
                activeOpacity={0.75}
                testID={`discipline-pill-${cat.key}`}
              >
                <Text
                  style={[
                    styles.switchCategoryText,
                    (isPrimary || isSecondary) && { color, fontWeight: '900' },
                  ]}
                  numberOfLines={1}
                >
                  {cat.icon} {cat.shortTitle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.presetsBtn}
            onPress={() => setShowPresetsDrawer(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.presetsBtnText}>📋 Presets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addSecondaryBtn}
            onPress={() => setShowSecondaryPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.addSecondaryBtnText}>+ Segment</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Reorderable Active Segments Strip (Drag or Tap Arrows to Reorder Workout Segments) */}
      {orderedSegments.length > 1 ? (
        <View style={styles.secondarySegmentsList}>
          <Text style={styles.secondarySegmentsLabel}>Segment Order (Drag / Reorder):</Text>
          {orderedSegments.map((segCat, idx) => {
            const segMeta = WORKOUT_CATEGORIES.find((c) => c.key === segCat);
            const segColor = CATEGORY_COLORS[segCat];
            const isPrimary = segCat === selectedCategory;
            return (
              <View
                key={segCat}
                style={[styles.secSegmentPill, { borderColor: segColor }]}
                onStartShouldSetResponder={() => Boolean(onMoveSegment)}
                onMoveShouldSetResponder={() => Boolean(onMoveSegment)}
                onResponderRelease={(e) => {
                  if (!onMoveSegment) return;
                  const dx = e.nativeEvent.locationX;
                  if (dx < 0 && idx > 0) {
                    onMoveSegment(segCat, -1);
                  }
                }}
              >
                {onMoveSegment && idx > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      triggerSensoryCue('SET_MICRO_REWARD_TICK');
                      onMoveSegment(segCat, -1);
                    }}
                    style={{ paddingHorizontal: 3 }}
                    accessibilityLabel={`Move ${segMeta?.shortTitle} segment up`}
                  >
                    <Text style={{ color: '#E5E7EB', fontSize: 11, fontWeight: '900' }}>↑</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.secSegmentText, { color: segColor }]}>
                  #{idx + 1} {segMeta?.icon} {segMeta?.shortTitle}
                </Text>
                {onMoveSegment && idx < orderedSegments.length - 1 && (
                  <TouchableOpacity
                    onPress={() => {
                      triggerSensoryCue('SET_MICRO_REWARD_TICK');
                      onMoveSegment(segCat, 1);
                    }}
                    style={{ paddingHorizontal: 3 }}
                    accessibilityLabel={`Move ${segMeta?.shortTitle} segment down`}
                  >
                    <Text style={{ color: '#E5E7EB', fontSize: 11, fontWeight: '900' }}>↓</Text>
                  </TouchableOpacity>
                )}
                {!isPrimary && (
                  <TouchableOpacity
                    onPress={() => onRemoveSecondarySegment(segCat)}
                    style={styles.secSegmentCloseBtn}
                  >
                    <Text style={styles.secSegmentCloseText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Secondary Modality Picker Modal */}
      <Modal
        visible={showSecondaryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSecondaryPicker(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingTop: safeTop + 16, paddingBottom: safeBottom + 16 },
          ]}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Secondary Segment</Text>
            <Text style={styles.modalSub}>
              Attach an additional workout segment (e.g. post-lift Zone 2 cardio or mobility cooldown).
            </Text>

            <View style={styles.modalOptionList}>
              {WORKOUT_CATEGORIES
                .filter((cat) => cat.key !== selectedCategory && !secondaryCategories.includes(cat.key))
                .map((cat) => {
                  const color = CATEGORY_COLORS[cat.key];
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[styles.modalOptionBtn, { borderColor: color }]}
                      onPress={() => {
                        triggerSensoryCue('SET_MICRO_REWARD_TICK');
                        onAddSecondarySegment(cat.key);
                        setShowSecondaryPicker(false);
                      }}
                    >
                      {CATEGORY_BADGE_SVGS[cat.key] ? (
                        <View style={styles.modalBadgeWrap}>
                          <SvgXml xml={CATEGORY_BADGE_SVGS[cat.key]} width={32} height={32} />
                        </View>
                      ) : (
                        <Text style={styles.modalOptionIcon}>{cat.icon}</Text>
                      )}
                      <View style={styles.modalOptionTextContainer}>
                        <Text style={[styles.modalOptionName, { color }]}>
                          {cat.shortTitle}
                        </Text>
                        <Text style={styles.modalOptionDesc}>{cat.title}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowSecondaryPicker(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Presets Drawer Modal */}
      <Modal
        visible={showPresetsDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPresetsDrawer(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingTop: safeTop + 16, paddingBottom: safeBottom + 16 },
          ]}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Workout Routine</Text>
              {onOpenPresetDesigner ? (
                <TouchableOpacity
                  style={styles.designerLinkBtn}
                  onPress={() => {
                    setShowPresetsDrawer(false);
                    onOpenPresetDesigner();
                  }}
                >
                  <Text style={styles.designerLinkText}>+ Designer</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={styles.presetModalScroll}>
              {presets.map((preset) => {
                const catDesc = WORKOUT_CATEGORIES.find((c) => c.key === preset.category);
                const exerciseCount = preset.blocks?.exerciseBlocks?.length ?? 0;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={styles.presetModalItem}
                    onPress={() => {
                      triggerSensoryCue('WORKOUT_PRESET_LOADED');
                      onLoadPreset(preset);
                      setShowPresetsDrawer(false);
                    }}
                  >
                    <Text style={styles.presetModalIcon}>{catDesc?.icon || '📋'}</Text>
                    <View style={styles.presetModalText}>
                      <Text style={styles.presetModalName}>{preset.name}</Text>
                      <Text style={styles.presetModalMeta}>
                        {preset.category} • {exerciseCount} exercises
                        {preset.notes ? ` • ${preset.notes}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowPresetsDrawer(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  gatewayContainer: {
    padding: 16,
    backgroundColor: '#161518',
    borderRadius: 14,
    borderColor: '#2F2D33',
    borderWidth: 1,
    marginVertical: 12,
  },
  gatewayHeader: {
    marginBottom: 16,
  },
  gatewayTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E8E6E1',
    letterSpacing: 0.5,
  },
  gatewaySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 18,
  },
  categoryGrid: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#1F1E24',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#36343C',
    borderLeftWidth: 4,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardIcon: {
    fontSize: 24,
  },
  badgeWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBadgeWrap: {
    width: 34,
    height: 34,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalityBadgeIcon: {
    width: 28,
    height: 28,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardTagline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E6E1',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  cardStatFocus: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  presetSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2B2930',
  },
  presetSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  presetSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  designerLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2A282E',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 6,
  },
  designerLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
  },
  historyLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2A241A',
    borderColor: '#DFB660',
    borderWidth: 1,
    borderRadius: 6,
  },
  historyLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
  },
  presetScroll: {
    flexDirection: 'row',
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D22',
    borderColor: '#3D3842',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
    maxWidth: 240,
  },
  presetChipIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  presetChipTextContainer: {
    flex: 1,
  },
  presetChipName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  presetChipMeta: {
    fontSize: 10,
    color: '#7A787D',
    marginTop: 2,
  },
  compactHeaderBanner: {
    backgroundColor: '#1A191C',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  compactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchCategoryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2A282E',
    borderColor: '#4A4650',
    borderWidth: 1,
  },
  switchCategoryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#D1D5DB',
  },
  activeCategoryPill: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  activePillIcon: {
    fontSize: 13,
  },
  activePillBadgeIcon: {
    width: 15,
    height: 15,
  },
  activePillLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyBtn: {
    backgroundColor: '#2A241A',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  historyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
  },
  presetsBtn: {
    backgroundColor: '#26242B',
    borderColor: '#423F49',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  presetsBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
  },
  addSecondaryBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#8A2535',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addSecondaryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FEE2E2',
  },
  secondarySegmentsList: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2B2930',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  secondarySegmentsLabel: {
    fontSize: 10,
    color: '#7A787D',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  secSegmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#1E1D22',
  },
  secSegmentText: {
    fontSize: 11,
    color: '#E8E6E1',
    fontWeight: '700',
  },
  secSegmentCloseBtn: {
    marginLeft: 4,
  },
  secSegmentCloseText: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1C1B20',
    borderColor: '#3D3842',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#E8E6E1',
  },
  modalSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 14,
  },
  modalOptionList: {
    gap: 10,
    marginBottom: 16,
  },
  modalOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24222A',
    borderColor: '#3F3B47',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  modalOptionIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  modalOptionBadgeIcon: {
    width: 26,
    height: 26,
    marginRight: 10,
  },
  modalOptionTextContainer: {
    flex: 1,
  },
  modalOptionName: {
    fontSize: 13,
    fontWeight: '800',
  },
  modalOptionDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  modalCloseBtn: {
    backgroundColor: '#2E2B34',
    borderColor: '#4A4652',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  presetModalScroll: {
    maxHeight: 320,
  },
  presetModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222027',
    borderColor: '#3A3642',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  presetModalIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  presetModalText: {
    flex: 1,
  },
  presetModalName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  presetModalMeta: {
    fontSize: 11,
    color: '#8A8890',
    marginTop: 2,
  },
});
