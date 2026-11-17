import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon, RpgIconName } from '../icons/RpgIcon';

export type HairlineTone = 'default' | 'strong' | 'gold';

export interface HairlineDividerProps {
  tone?: HairlineTone;
  spacing?: number;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

const HAIRLINE_TONE_COLORS: Record<HairlineTone, string> = {
  default: SURFACES.hairline,
  strong: SURFACES.hairlineStrong,
  gold: SURFACES.goldHairline,
};

export const HairlineDivider: React.FC<HairlineDividerProps> = ({
  tone = 'default',
  spacing = 0,
  inset = 0,
  style,
}) => (
  <View
    style={[
      styles.hairline,
      {
        backgroundColor: HAIRLINE_TONE_COLORS[tone],
        marginVertical: spacing,
        marginHorizontal: inset,
      },
      style,
    ]}
  />
);

export type SlateSurfaceLevel = 0 | 1 | 2 | 3;

const SLATE_LEVEL_BG: Record<SlateSurfaceLevel, string> = {
  0: SURFACES.canvas,
  1: SURFACES.layer1,
  2: SURFACES.layer2,
  3: SURFACES.layer3,
};

export interface SlateSectionProps {
  level?: SlateSurfaceLevel;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  withBottomDivider?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

export const SlateSection: React.FC<SlateSectionProps> = ({
  level = 1,
  eyebrow,
  title,
  subtitle,
  rightAction,
  withBottomDivider = false,
  style,
  children,
  testID,
}) => {
  const hasHeader = Boolean(eyebrow || title || subtitle || rightAction);
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: SLATE_LEVEL_BG[level] },
        withBottomDivider && styles.sectionBottomDivider,
        style,
      ]}
      testID={testID}
    >
      {hasHeader && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTextCol}>
            {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
            {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
          </View>
          {rightAction ? <View style={styles.sectionRightAction}>{rightAction}</View> : null}
        </View>
      )}
      {children}
    </View>
  );
};

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  icon?: RpgIconName;
  badge?: string | number;
  testID?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <View style={[styles.segmentedTrack, style]} testID={testID}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            style={[styles.segmentedOption, active && styles.segmentedOptionActive]}
            onPress={() => onChange(opt.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={opt.testID}
          >
            {opt.icon ? (
              <RpgIcon
                name={opt.icon}
                size={14}
                color={active ? COLORS.gold : COLORS.textSecondary}
                accentColor={active ? COLORS.gold : COLORS.textMuted}
              />
            ) : null}
            <Text
              style={[styles.segmentedLabel, active && styles.segmentedLabelActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
            {opt.badge !== undefined && opt.badge !== null && opt.badge !== '' ? (
              <View style={[styles.segmentedBadge, active && styles.segmentedBadgeActive]}>
                <Text
                  style={[styles.segmentedBadgeText, active && styles.segmentedBadgeTextActive]}
                >
                  {opt.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface DisclosureBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}

export const DisclosureBottomSheet: React.FC<DisclosureBottomSheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  testID,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot} testID={testID}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={onClose}
          accessibilityLabel="Close bottom sheet"
        />
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom + 12, 22) },
          ]}
        >
          <View style={styles.sheetGrabHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleCol}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.sheetSubtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.sheetHeaderActions}>
              {headerRight}
              <Pressable
                style={styles.sheetCloseBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <RpgIcon name="close" size={16} color={COLORS.textSecondary} />
              </Pressable>
            </View>
          </View>
          <HairlineDivider tone="strong" />
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export interface DisclosureActionRowProps {
  label: string;
  subtitle?: string;
  icon?: RpgIconName;
  badge?: string;
  destructive?: boolean;
  active?: boolean;
  showDivider?: boolean;
  onPress: () => void;
  testID?: string;
}

export const DisclosureActionRow: React.FC<DisclosureActionRowProps> = ({
  label,
  subtitle,
  icon,
  badge,
  destructive = false,
  active = false,
  showDivider = true,
  onPress,
  testID,
}) => {
  const iconColor = destructive
    ? COLORS.danger
    : active
    ? COLORS.gold
    : COLORS.textSecondary;

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.actionRow,
          active && styles.actionRowActive,
        ]}
        onPress={onPress}
        activeOpacity={0.72}
        testID={testID}
      >
        {icon ? (
          <View style={[styles.actionIconBox, active && styles.actionIconBoxActive]}>
            <RpgIcon name={icon} size={17} color={iconColor} />
          </View>
        ) : null}
        <View style={styles.actionTextCol}>
          <Text
            style={[
              styles.actionLabel,
              active && styles.actionLabelActive,
              destructive && styles.actionLabelDestructive,
            ]}
          >
            {label}
          </Text>
          {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
        </View>
        {badge ? (
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>{badge}</Text>
          </View>
        ) : null}
        <RpgIcon
          name={active ? 'check' : 'chevron-right'}
          size={15}
          color={destructive ? COLORS.danger : active ? COLORS.gold : COLORS.textMuted}
        />
      </TouchableOpacity>
      {showDivider ? <HairlineDivider inset={48} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  section: {
    borderRadius: RADII.lg,
    padding: SPACING.md,
  },
  sectionBottomDivider: {
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionHeaderTextCol: {
    flex: 1,
    gap: 2,
  },
  sectionEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.gold,
  },
  sectionTitle: {
    ...TYPOGRAPHY.titleMd,
  },
  sectionSubtitle: {
    ...TYPOGRAPHY.bodySm,
  },
  sectionRightAction: {
    flexShrink: 0,
  },
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    padding: 3,
    gap: 3,
  },
  segmentedOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: RADII.sm + 2,
    gap: 5,
    minHeight: 34,
  },
  segmentedOptionActive: {
    backgroundColor: SURFACES.layer3,
  },
  segmentedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  segmentedLabelActive: {
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  segmentedBadge: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  segmentedBadgeActive: {
    backgroundColor: 'rgba(245, 184, 65, 0.2)',
  },
  segmentedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  segmentedBadgeTextActive: {
    color: COLORS.gold,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SURFACES.scrim,
  },
  sheetContainer: {
    backgroundColor: SURFACES.layer2,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACES.hairlineStrong,
    maxHeight: '82%',
    paddingTop: SPACING.sm,
  },
  sheetGrabHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.hairlineStrong,
    marginBottom: SPACING.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sheetTitleCol: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    ...TYPOGRAPHY.titleLg,
  },
  sheetSubtitle: {
    ...TYPOGRAPHY.bodySm,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.pill,
    backgroundColor: SURFACES.layer3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.md,
    gap: SPACING.md,
  },
  actionRowActive: {
    backgroundColor: 'rgba(245, 184, 65, 0.08)',
  },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm + 2,
    backgroundColor: SURFACES.layer3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBoxActive: {
    backgroundColor: 'rgba(245, 184, 65, 0.16)',
  },
  actionTextCol: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionLabelActive: {
    color: COLORS.gold,
  },
  actionLabelDestructive: {
    color: COLORS.danger,
  },
  actionSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionBadge: {
    backgroundColor: SURFACES.layer3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADII.pill,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
});
