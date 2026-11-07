import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CRIMSON_ONI } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export const RPE_SLIDER_STEPS = [
  10.0,
  9.5,
  9.0,
  8.5,
  8.0,
  7.5,
  7.0,
  6.5,
  6.0,
] as const;

const MIN_RPE = 6.0;
const MAX_RPE = 10.0;

function getRpeDescriptor(rpe: number): {
  title: string;
  rirText: string;
  color: string;
} {
  if (rpe >= 10) {
    return {
      title: 'Max Effort / Limit',
      rirText: '0 reps left in tank (0 RIR)',
      color: '#EF4444',
    };
  }
  if (rpe >= 9.5) {
    return {
      title: 'Near Limit',
      rirText: 'No more reps, maybe slightly more weight (0–0.5 RIR)',
      color: '#F97316',
    };
  }
  if (rpe >= 9.0) {
    return {
      title: 'Heavy Effort',
      rirText: '1 rep definitely left in tank (1 RIR)',
      color: '#F59E0B',
    };
  }
  if (rpe >= 8.5) {
    return {
      title: 'Sweet Spot Plus',
      rirText: '1–2 reps left in tank (1.5 RIR)',
      color: '#FDE68A',
    };
  }
  if (rpe >= 8.0) {
    return {
      title: 'Hypertrophy Sweet Spot',
      rirText: '2 reps left in tank (2 RIR)',
      color: '#FDE68A',
    };
  }
  if (rpe >= 7.5) {
    return {
      title: 'Moderate-Hard',
      rirText: '2–3 reps left in tank (2.5 RIR)',
      color: '#34D399',
    };
  }
  if (rpe >= 7.0) {
    return {
      title: 'Controlled Speed',
      rirText: '3 reps left in tank (3 RIR)',
      color: '#34D399',
    };
  }
  return {
    title: 'Light / Speed Work',
    rirText: '4+ reps left in tank (4+ RIR)',
    color: '#60A5FA',
  };
}

export interface RpeVerticalSliderModalProps {
  visible: boolean;
  initialRpe: number;
  subtitle?: string;
  onSelectRpe: (rpe: number) => void;
  onClose: () => void;
}

export const RpeVerticalSliderModal: React.FC<RpeVerticalSliderModalProps> = ({
  visible,
  initialRpe,
  subtitle,
  onSelectRpe,
  onClose,
}) => {
  const clampRpe = (val: number) => {
    const clamped = Math.max(MIN_RPE, Math.min(MAX_RPE, val));
    return Math.round(clamped * 2) / 2;
  };

  const [selectedRpe, setSelectedRpe] = useState<number>(() => clampRpe(initialRpe || 8.0));
  const [trackHeight, setTrackHeight] = useState<number>(250);
  const dragOriginRef = React.useRef<{ pageY: number; startRpe: number } | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedRpe(clampRpe(initialRpe || 8.0));
    }
  }, [visible, initialRpe]);

  const updateRpe = (nextVal: number) => {
    const snapped = clampRpe(nextVal);
    setSelectedRpe((prev) => {
      if (prev !== snapped) {
        triggerSensoryCue('SET_MICRO_REWARD_TICK');
      }
      return snapped;
    });
  };

  const handleTrackTouch = (locationY: number) => {
    const height = Math.max(1, trackHeight);
    // Top (y=0) is MAX_RPE (10.0), Bottom (y=height) is MIN_RPE (6.0)
    const ratioFromTop = Math.max(0, Math.min(1, locationY / height));
    const rawRpe = MAX_RPE - ratioFromTop * (MAX_RPE - MIN_RPE);
    updateRpe(rawRpe);
  };

  const handleConfirm = () => {
    onSelectRpe(selectedRpe);
    onClose();
  };

  if (!visible) return null;

  const descriptor = getRpeDescriptor(selectedRpe);
  // Fill percentage from bottom (6.0 = 0%, 10.0 = 100%)
  const fillPct = Math.max(
    0,
    Math.min(100, ((selectedRpe - MIN_RPE) / (MAX_RPE - MIN_RPE)) * 100)
  );
  // Thumb distance from top (10.0 = 0%, 6.0 = 100%)
  const topPct = 100 - fillPct;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleConfirm}
    >
      {/* Tapping anywhere off-focus confirms the RPE adjustment and closes */}
      <Pressable style={styles.overlay} onPress={handleConfirm}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            dragOriginRef.current = {
              pageY: e.nativeEvent.pageY,
              startRpe: selectedRpe,
            };
          }}
          onResponderMove={(e) => {
            if (!dragOriginRef.current) return;
            const deltaY = dragOriginRef.current.pageY - e.nativeEvent.pageY;
            const deltaRpe = (deltaY / Math.max(120, trackHeight)) * (MAX_RPE - MIN_RPE);
            updateRpe(dragOriginRef.current.startRpe + deltaRpe);
          }}
          onResponderRelease={() => {
            dragOriginRef.current = null;
          }}
        >
          {/* Main Side-by-Side Body: Draggable Vertical Slider on Left, Info/Tooltip/Buttons/Confirm beside it on Right */}
          <View style={styles.sliderSection}>
            {/* Left column: Vertical Drag Slider + +/- Step Caps */}
            <View style={styles.verticalTrackColumn}>
              <TouchableOpacity
                style={styles.stepCapBtn}
                onPress={() => updateRpe(selectedRpe + 0.5)}
                activeOpacity={0.75}
              >
                <Text style={styles.stepCapBtnText}>▲ +0.5</Text>
              </TouchableOpacity>

              <View
                style={styles.verticalTrackTouchArea}
                onLayout={(e) => setTrackHeight(e.nativeEvent.layout.height)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => handleTrackTouch(e.nativeEvent.locationY)}
                onResponderMove={(e) => handleTrackTouch(e.nativeEvent.locationY)}
              >
                <View style={styles.verticalTrackBackdrop}>
                  <View
                    style={[
                      styles.verticalTrackFill,
                      {
                        height: `${fillPct}%`,
                        backgroundColor: descriptor.color,
                      },
                    ]}
                  />
                </View>

                {/* Horizontal tick marks along track */}
                {RPE_SLIDER_STEPS.map((step) => {
                  const stepTopPct = ((MAX_RPE - step) / (MAX_RPE - MIN_RPE)) * 100;
                  return (
                    <View
                      key={step}
                      pointerEvents="none"
                      style={[
                        styles.trackTick,
                        { top: `${stepTopPct}%` },
                        step % 1 === 0 && styles.trackTickMajor,
                      ]}
                    />
                  );
                })}

                {/* Thumb */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.verticalThumb,
                    {
                      top: `${topPct}%`,
                      borderColor: descriptor.color,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.verticalThumbInner,
                      { backgroundColor: descriptor.color },
                    ]}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.stepCapBtn}
                onPress={() => updateRpe(selectedRpe - 0.5)}
                activeOpacity={0.75}
              >
                <Text style={styles.stepCapBtnText}>▼ −0.5</Text>
              </TouchableOpacity>
            </View>

            {/* Right column beside the slider: Tooltip Info Readout + Quick-Tap Scale + Green Confirm Button */}
            <View style={styles.scaleLadderColumn}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>DRAG SLIDER OR TAP • RPE</Text>
                  <Text style={styles.title} numberOfLines={1}>
                    {subtitle || 'Adjust Set RPE'}
                  </Text>
                </View>
              </View>

              {/* Current Value & RIR Tooltip Banner */}
              <View style={[styles.readoutBanner, { borderColor: descriptor.color }]}>
                <View style={styles.readoutLeft}>
                  <Text style={[styles.readoutNumber, { color: descriptor.color }]}>
                    {selectedRpe % 1 === 0 ? selectedRpe.toFixed(0) : selectedRpe.toFixed(1)}
                  </Text>
                  <Text style={styles.readoutUnit}>RPE</Text>
                </View>
                <View style={styles.readoutRight}>
                  <Text style={[styles.readoutTitle, { color: descriptor.color }]}>
                    {descriptor.title}
                  </Text>
                  <Text style={styles.readoutRir}>{descriptor.rirText}</Text>
                </View>
              </View>

              {/* Quick-Tap Scale Ladder */}
              <View style={{ gap: 3 }}>
                {RPE_SLIDER_STEPS.map((step) => {
                  const isSelected = Math.abs(selectedRpe - step) < 0.01;
                  const stepDesc = getRpeDescriptor(step);
                  return (
                    <TouchableOpacity
                      key={step}
                      style={[
                        styles.ladderRowBtn,
                        isSelected && [
                          styles.ladderRowBtnActive,
                          { borderColor: stepDesc.color },
                        ],
                      ]}
                      onPress={() => {
                        updateRpe(step);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.ladderValueText,
                          isSelected && { color: stepDesc.color, fontWeight: '900' },
                        ]}
                      >
                        {step % 1 === 0 ? `${step}.0` : `${step}`}
                      </Text>
                      <Text
                        style={[
                          styles.ladderHintText,
                          isSelected && styles.ladderHintTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {step === 10.0
                          ? 'Max / 0 RIR'
                          : step === 9.5
                            ? '0–0.5 RIR'
                            : step === 9.0
                              ? '1 RIR'
                              : step === 8.5
                                ? '1.5 RIR'
                                : step === 8.0
                                  ? '2 RIR (Target)'
                                  : step === 7.5
                                    ? '2.5 RIR'
                                    : step === 7.0
                                      ? '3 RIR'
                                      : step === 6.5
                                        ? '3.5 RIR'
                                        : '4+ RIR'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Green Confirm Button */}
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirm}
                activeOpacity={0.85}
                testID="rpe-slider-confirm-btn"
              >
                <Text style={styles.confirmBtnText}>
                  ✓ Confirm RPE {selectedRpe % 1 === 0 ? selectedRpe.toFixed(0) : selectedRpe.toFixed(1)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 10, 14, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: CRIMSON_ONI.charcoalCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrow: {
    color: CRIMSON_ONI.agedGold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
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
  readoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17161D',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    gap: 12,
  },
  readoutLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  readoutNumber: {
    fontSize: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  readoutUnit: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  readoutRight: {
    flex: 1,
  },
  readoutTitle: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  readoutRir: {
    color: '#D1D5DB',
    fontSize: 11,
  },
  sliderSection: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    marginBottom: 14,
  },
  verticalTrackColumn: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stepCapBtn: {
    width: '100%',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#252330',
    borderWidth: 1,
    borderColor: '#3B384A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCapBtnText: {
    color: '#F3F4F6',
    fontSize: 11,
    fontWeight: '800',
  },
  verticalTrackTouchArea: {
    flex: 1,
    width: 56,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  verticalTrackBackdrop: {
    width: 14,
    height: '100%',
    backgroundColor: '#23212C',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#3A3749',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  verticalTrackFill: {
    width: '100%',
    borderRadius: 6,
  },
  trackTick: {
    position: 'absolute',
    width: 22,
    height: 1,
    backgroundColor: 'rgba(156, 163, 175, 0.35)',
  },
  trackTickMajor: {
    width: 28,
    height: 1.5,
    backgroundColor: 'rgba(253, 230, 138, 0.5)',
  },
  verticalThumb: {
    position: 'absolute',
    width: 30,
    height: 30,
    marginTop: -15,
    borderRadius: 15,
    backgroundColor: '#191820',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 5,
  },
  verticalThumbInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  scaleLadderColumn: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  ladderRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#1B1A22',
    borderWidth: 1,
    borderColor: '#2B2936',
  },
  ladderRowBtnActive: {
    backgroundColor: '#282434',
    borderWidth: 1.5,
  },
  ladderValueText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 32,
  },
  ladderHintText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  ladderHintTextActive: {
    color: '#F3F4F6',
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#06281E',
    fontSize: 13,
    fontWeight: '900',
  },
});
