import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  TRAINING_METRIC_TOOLTIPS,
  TrainingMetricTooltipKey,
} from '@gymify/game-engine';
import { CRIMSON_ONI } from '../theme';

export interface MetricInfoBadgeProps {
  onPress: () => void;
  size?: 'xs' | 'sm';
  testID?: string;
}

export const MetricInfoBadge: React.FC<MetricInfoBadgeProps> = ({
  onPress,
  size = 'xs',
  testID,
}) => {
  return (
    <TouchableOpacity
      style={[styles.infoBadge, size === 'sm' && styles.infoBadgeSm]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
      testID={testID}
    >
      <Text style={[styles.infoBadgeText, size === 'sm' && styles.infoBadgeTextSm]}>
        i
      </Text>
    </TouchableOpacity>
  );
};

export interface MetricInfoTooltipModalProps {
  metricKey: TrainingMetricTooltipKey | null;
  contextualHeadline?: string | null;
  contextualNote?: string | null;
  onClose: () => void;
}

export const MetricInfoTooltipModal: React.FC<MetricInfoTooltipModalProps> = ({
  metricKey,
  contextualHeadline,
  contextualNote,
  onClose,
}) => {
  if (!metricKey) return null;
  const info = TRAINING_METRIC_TOOLTIPS[metricKey];
  if (!info) return null;

  return (
    <Modal
      visible={Boolean(metricKey)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.eyebrow}>{info.shortBadge}</Text>
              <Text style={styles.title}>{info.title}</Text>
            </View>
            <TouchableOpacity style={styles.closeIconBtn} onPress={onClose}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {contextualNote ? (
            <View style={styles.contextualBox}>
              {contextualHeadline ? (
                <Text style={styles.contextualHeadline}>{contextualHeadline}</Text>
              ) : null}
              <Text style={styles.contextualText}>{contextualNote}</Text>
            </View>
          ) : null}

          <Text style={styles.summary}>{info.summary}</Text>

          <View style={styles.guideSection}>
            <Text style={styles.guideHeader}>ON THE GYM FLOOR</Text>
            {info.gymFloorGuide.map((line, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>

          <View style={styles.rpgBox}>
            <Text style={styles.rpgLabel}>⚔️ GYMIFY RPG IMPACT</Text>
            <Text style={styles.rpgText}>{info.rpgTieIn}</Text>
          </View>

          <TouchableOpacity style={styles.gotItBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.gotItText}>Got It</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  infoBadge: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198, 154, 69, 0.65)',
    backgroundColor: '#25212B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeSm: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  infoBadgeText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 9,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  infoBadgeTextSm: {
    fontSize: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 10, 14, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  closeIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeIconText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '800',
  },
  contextualBox: {
    backgroundColor: '#2A2216',
    borderColor: CRIMSON_ONI.agedGold,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  contextualHeadline: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },
  contextualText: {
    color: '#E8E6E1',
    fontSize: 12,
    lineHeight: 17,
  },
  summary: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  guideSection: {
    backgroundColor: '#19181E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#312E3A',
    padding: 10,
    marginBottom: 10,
  },
  guideHeader: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  bulletDot: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 6,
  },
  bulletText: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 12,
    lineHeight: 17,
  },
  rpgBox: {
    backgroundColor: '#24151B',
    borderColor: '#6B2130',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  rpgLabel: {
    color: '#FDA4AF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  rpgText: {
    color: '#F3F4F6',
    fontSize: 11,
    lineHeight: 16,
  },
  gotItBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  gotItText: {
    color: '#121114',
    fontSize: 13,
    fontWeight: '900',
  },
});
