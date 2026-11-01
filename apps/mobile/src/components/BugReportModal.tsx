import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { diagnosticLogger } from '../services/DiagnosticLogger';
import { COLORS, CRIMSON_ONI } from '../theme';

export type BugReportCategoryType =
  | 'UI_UX'
  | 'WORKOUT_SYNC'
  | 'WEARABLE_TELEMETRY'
  | 'COMBAT_DUNGEON'
  | 'OTHER';

export interface BugReportModalProps {
  visible: boolean;
  onClose: () => void;
  characterId?: string | null;
  userId?: string | null;
}

const CATEGORIES: Array<{
  key: BugReportCategoryType;
  label: string;
  icon: string;
}> = [
  { key: 'UI_UX', label: 'UI / Display', icon: '🎨' },
  { key: 'WORKOUT_SYNC', label: 'Workout Sync', icon: '🔄' },
  { key: 'WEARABLE_TELEMETRY', label: 'Wearable Telemetry', icon: '⌚' },
  { key: 'COMBAT_DUNGEON', label: 'Combat & Dungeon', icon: '⚔️' },
  { key: 'OTHER', label: 'Other', icon: '📦' },
];

export const BugReportModal: React.FC<BugReportModalProps> = ({
  visible,
  onClose,
  characterId,
  userId,
}) => {
  const [category, setCategory] = useState<BugReportCategoryType>('UI_UX');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showLogsAccordion, setShowLogsAccordion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    status: 'success' | 'queued' | 'error';
    message: string;
  } | null>(null);

  const diagnosticBundle = useMemo(() => {
    return {
      timestamp: new Date().toISOString(),
      breadcrumbs: diagnosticLogger.getBreadcrumbs(),
      stateSnapshot: diagnosticLogger.getStateSnapshot(),
      deviceMetadata: diagnosticLogger.getDeviceMetadata(),
    };
  }, [showLogsAccordion]);

  const rawJsonString = useMemo(() => {
    return JSON.stringify(diagnosticBundle, null, 2);
  }, [diagnosticBundle]);

  const handleCopyLogs = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawJsonString);
        setCopyFeedback('Copied to clipboard!');
      } else {
        // Fallback for native/other environments
        setCopyFeedback('JSON ready for inspection below');
      }
    } catch {
      setCopyFeedback('Failed to copy');
    }
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setSubmitResult({
        status: 'error',
        message: 'Please enter a brief summary / title for the issue.',
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await diagnosticLogger.submitDiagnosticReport({
        severity: 'WARNING',
        category,
        title: title.trim(),
        userDescription: description.trim() || undefined,
        breadcrumbs: includeDiagnostics ? diagnosticBundle.breadcrumbs : [],
        stateSnapshot: includeDiagnostics ? diagnosticBundle.stateSnapshot : {},
        deviceMetadata: diagnosticBundle.deviceMetadata,
        characterId,
        userId,
      });

      if (res.queuedLocally) {
        setSubmitResult({
          status: 'queued',
          message: 'Offline: Bug report queued locally and will auto-upload when connectivity returns.',
        });
      } else if (res.ok) {
        setSubmitResult({
          status: 'success',
          message: 'Bug report sent directly to developers. Thank you for your feedback!',
        });
      } else {
        setSubmitResult({
          status: 'error',
          message: res.error || 'Failed to submit bug report.',
        });
      }
    } catch (err) {
      setSubmitResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Submission failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAndReset = () => {
    setTitle('');
    setDescription('');
    setSubmitResult(null);
    setShowLogsAccordion(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCloseAndReset}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerIcon}>🐛</Text>
              <View>
                <Text style={styles.headerTitle}>Report an Issue</Text>
                <Text style={styles.headerSubtitle}>Transmit feedback &amp; telemetry</Text>
              </View>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={handleCloseAndReset}
              accessibilityLabel="Close bug report modal"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Category Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryWrap}>
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      style={[
                        styles.categoryChip,
                        isSelected && styles.categoryChipSelected,
                      ]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Text style={styles.chipIcon}>{cat.icon}</Text>
                      <Text
                        style={[
                          styles.chipLabel,
                          isSelected && styles.chipLabelSelected,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Set rest timer didn't vibrate, UI cutoff on small screen..."
                placeholderTextColor={CRIMSON_ONI.ashMuted}
                value={title}
                onChangeText={setTitle}
                maxLength={200}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe what steps you took, what you expected vs what occurred..."
                placeholderTextColor={CRIMSON_ONI.ashMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                maxLength={2000}
              />
            </View>

            {/* Toggle Include Diagnostics */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Include Diagnostic Logs</Text>
                <Text style={styles.toggleSubtitle}>
                  Recent ring-buffer breadcrumbs &amp; sanitized state (no passwords/tokens)
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={setIncludeDiagnostics}
                trackColor={{ false: '#374151', true: '#5E1924' }}
                thumbColor={includeDiagnostics ? '#DFB660' : '#9CA3AF'}
              />
            </View>

            {/* Accordion: View Recent Logs */}
            <View style={styles.accordionContainer}>
              <Pressable
                style={styles.accordionHeader}
                onPress={() => setShowLogsAccordion((prev) => !prev)}
              >
                <Text style={styles.accordionTitle}>
                  {showLogsAccordion ? '▼ Hide Diagnostic Bundle' : '▶ View Recent Logs & Telemetry'}
                </Text>
                <Text style={styles.accordionBadge}>
                  {diagnosticBundle.breadcrumbs.length} logs
                </Text>
              </Pressable>

              {showLogsAccordion && (
                <View style={styles.accordionBody}>
                  <View style={styles.copyRow}>
                    <Text style={styles.copyHint}>
                      Inspect or copy diagnostic JSON to share with support:
                    </Text>
                    <Pressable style={styles.copyBtn} onPress={handleCopyLogs}>
                      <Text style={styles.copyBtnText}>
                        {copyFeedback ? copyFeedback : '📋 Copy JSON'}
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.rawJsonBox} nestedScrollEnabled>
                    <Text style={styles.rawJsonText}>{rawJsonString}</Text>
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Submission Status Message */}
            {submitResult && (
              <View
                style={[
                  styles.statusBox,
                  submitResult.status === 'success' && styles.statusBoxSuccess,
                  submitResult.status === 'queued' && styles.statusBoxQueued,
                  submitResult.status === 'error' && styles.statusBoxError,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    submitResult.status === 'success' && styles.statusTextSuccess,
                    submitResult.status === 'queued' && styles.statusTextQueued,
                    submitResult.status === 'error' && styles.statusTextError,
                  ]}
                >
                  {submitResult.message}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Submit Buttons */}
          <View style={styles.footerRow}>
            <Pressable
              style={styles.cancelBtn}
              onPress={handleCloseAndReset}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Transmitting...' : '📜 Send Bug Report'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    backgroundColor: '#18161B',
    borderColor: '#3D3944',
    borderWidth: 1,
    borderRadius: 12,
    maxWidth: 600,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2B2830',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F9FAFB',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '700',
  },
  formScroll: {
    flexGrow: 1,
  },
  formContent: {
    padding: 16,
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#232027',
    borderColor: '#36333D',
    borderWidth: 1,
  },
  categoryChipSelected: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: '#FEE2E2',
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: '#201D24',
    borderColor: '#36333D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: '#F3F4F6',
    fontSize: 13,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#201D24',
    borderRadius: 8,
    padding: 12,
    borderColor: '#36333D',
    borderWidth: 1,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  toggleSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  accordionContainer: {
    borderColor: '#36333D',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#1E1B22',
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#242129',
  },
  accordionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DFB660',
  },
  accordionBadge: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  accordionBody: {
    padding: 12,
    gap: 8,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyHint: {
    fontSize: 11,
    color: '#9CA3AF',
    flex: 1,
  },
  copyBtn: {
    backgroundColor: '#342F3B',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A4454',
  },
  copyBtnText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  rawJsonBox: {
    maxHeight: 180,
    backgroundColor: '#121115',
    borderRadius: 6,
    padding: 8,
    borderColor: '#2D2A33',
    borderWidth: 1,
  },
  rawJsonText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: '#A7F3D0',
  },
  statusBox: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBoxSuccess: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
  },
  statusBoxQueued: {
    backgroundColor: '#451A03',
    borderColor: '#D97706',
  },
  statusBoxError: {
    backgroundColor: '#450A0A',
    borderColor: '#DC2626',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: '#A7F3D0',
  },
  statusTextQueued: {
    color: '#FDE68A',
  },
  statusTextError: {
    color: '#FECACA',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2B2830',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  submitBtnText: {
    color: '#FEE2E2',
    fontSize: 13,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
