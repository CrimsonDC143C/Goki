import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HubEnvironmentSlotId,
  getHubEnvironmentArt,
} from '../../assets/rpgArtRegistry';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon, RpgIconName } from '../icons/RpgIcon';
import { HairlineDivider } from '../ui/SurfacePrimitives';
import {
  NPC_ARCHETYPE_META,
  NpcArchetypeId,
  NpcExpression,
  NpcPortraitSvg,
} from './NpcPortraitSvg';

export interface NpcActionChip {
  id: string;
  label: string;
  icon?: RpgIconName;
  variant?: 'primary' | 'subtle';
  onPress: () => void;
  testID?: string;
}

export interface NpcDialogueOverlayProps {
  visible: boolean;
  onClose: () => void;
  npcId?: NpcArchetypeId;
  npcName?: string;
  npcTitle?: string;
  expression?: NpcExpression;
  pageExpressions?: ReadonlyArray<NpcExpression>;
  sceneSlotId?: HubEnvironmentSlotId;
  portraitSlot?: React.ReactNode;
  dialoguePages?: ReadonlyArray<string>;
  dialogueText?: string;
  actionChips?: ReadonlyArray<NpcActionChip>;
  onFinish?: () => void;
  testID?: string;
}

export const NpcDialogueOverlay: React.FC<NpcDialogueOverlayProps> = ({
  visible,
  onClose,
  npcId = 'GUIDE',
  npcName,
  npcTitle,
  expression = 'neutral',
  pageExpressions,
  sceneSlotId,
  portraitSlot,
  dialoguePages,
  dialogueText,
  actionChips,
  onFinish,
  testID = 'npc-dialogue-overlay',
}) => {
  const insets = useSafeAreaInsets();
  const [pageIndex, setPageIndex] = useState(0);

  const meta = NPC_ARCHETYPE_META[npcId];
  const resolvedName = npcName ?? meta.name;
  const resolvedTitle = npcTitle ?? `${meta.title} • ${meta.faction}`;
  const pages =
    dialoguePages && dialoguePages.length > 0
      ? dialoguePages
      : [dialogueText ?? 'Welcome back, adventurer.'];

  useEffect(() => {
    if (visible) {
      setPageIndex(0);
    }
  }, [visible, npcId]);

  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const currentText = pages[safeIndex] ?? '';
  const activeExpression: NpcExpression = pageExpressions?.[safeIndex] ?? expression;
  const sceneArt = sceneSlotId ? getHubEnvironmentArt(sceneSlotId) : null;
  const hasMultiplePages = pages.length > 1;
  const isLastPage = safeIndex >= pages.length - 1;

  const handleAdvanceOrClose = () => {
    if (!isLastPage) {
      setPageIndex((prev) => Math.min(pages.length - 1, prev + 1));
      return;
    }
    if (onFinish) {
      onFinish();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root} testID={testID}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Dismiss dialogue"
        />

        <View
          style={[
            styles.card,
            {
              marginBottom: Math.max(insets.bottom + 12, 20),
            },
          ]}
        >
          {sceneArt ? (
            <View
              pointerEvents="none"
              style={styles.sceneBackdropSlot}
              testID="npc-dialogue-scene-slot"
            >
              {sceneArt.headerBannerSource ? (
                <>
                  <ExpoImage
                    source={sceneArt.headerBannerSource as any}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    contentPosition="center"
                  />
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: '#0B0F18', opacity: 0.9 },
                    ]}
                  />
                </>
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: sceneArt.ambientTint },
                  ]}
                />
              )}
            </View>
          ) : null}

          {/* Portrait + Identity Header */}
          <View style={styles.headerRow}>
            <View style={styles.portraitWrap}>
              {portraitSlot ?? (
                <NpcPortraitSvg npcId={npcId} size={72} expression={activeExpression} />
              )}
            </View>

            <View style={styles.identityCol}>
              <Text style={[styles.npcRoleEyebrow, { color: meta.accentColor }]} numberOfLines={2}>
                {resolvedTitle}
              </Text>
              <Text style={styles.npcName} numberOfLines={1}>
                {resolvedName}
              </Text>
              {hasMultiplePages ? (
                <Text style={styles.pageIndicator}>
                  Dialogue {safeIndex + 1} / {pages.length}
                </Text>
              ) : null}
            </View>

            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close NPC dialogue"
              testID="npc-dialogue-close-btn"
              hitSlop={8}
            >
              <RpgIcon name="close" size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <HairlineDivider tone="strong" spacing={SPACING.md} />

          {/* Dialogue Body */}
          <Text style={styles.dialogueBody} testID="npc-dialogue-text">
            {currentText}
          </Text>

          {/* Optional Quick-Action Chips */}
          {actionChips && actionChips.length > 0 ? (
            <View style={styles.chipsWrap}>
              {actionChips.map((chip) => {
                const isPrimary = chip.variant === 'primary';
                return (
                  <TouchableOpacity
                    key={chip.id}
                    style={[
                      styles.actionChip,
                      isPrimary && styles.actionChipPrimary,
                    ]}
                    onPress={chip.onPress}
                    activeOpacity={0.75}
                    testID={chip.testID}
                  >
                    {chip.icon ? (
                      <RpgIcon
                        name={chip.icon}
                        size={14}
                        color={isPrimary ? SURFACES.canvas : COLORS.gold}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.actionChipText,
                        isPrimary && styles.actionChipTextPrimary,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <HairlineDivider spacing={SPACING.md} />

          {/* Navigation Footer */}
          <View style={styles.footerRow}>
            {hasMultiplePages && safeIndex > 0 ? (
              <TouchableOpacity
                style={styles.prevBtn}
                onPress={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                activeOpacity={0.75}
                testID="npc-dialogue-prev-btn"
              >
                <RpgIcon name="chevron-left" size={15} color={COLORS.textSecondary} />
                <Text style={styles.prevBtnText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleAdvanceOrClose}
              activeOpacity={0.8}
              testID="npc-dialogue-next-btn"
            >
              <Text style={styles.nextBtnText}>{isLastPage ? 'Close' : 'Next'}</Text>
              <RpgIcon
                name={isLastPage ? 'check' : 'chevron-right'}
                size={15}
                color={SURFACES.canvas}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(4, 7, 13, 0.84)',
  },
  card: {
    backgroundColor: '#0E131E',
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sceneBackdropSlot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  portraitWrap: {
    width: 72,
    height: 72,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: SURFACES.layer1,
  },
  identityCol: {
    flex: 1,
    gap: 2,
  },
  npcRoleEyebrow: {
    ...TYPOGRAPHY.eyebrow,
  },
  npcName: {
    ...TYPOGRAPHY.titleLg,
  },
  pageIndicator: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.layer3,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  dialogueBody: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionChipPrimary: {
    backgroundColor: COLORS.gold,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionChipTextPrimary: {
    color: SURFACES.canvas,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.md,
    backgroundColor: SURFACES.layer3,
  },
  prevBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: RADII.md,
    backgroundColor: COLORS.gold,
  },
  nextBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
});
