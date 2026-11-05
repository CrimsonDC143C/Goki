import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CrashReportPayload,
  diagnosticLogger,
} from '../services/DiagnosticLogger';
import { COLORS, CRIMSON_ONI } from '../theme';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  userNote: string;
  transmissionStatus: 'idle' | 'sending' | 'sent' | 'queued_offline' | 'error';
  pendingCrash: CrashReportPayload | null;
  pendingCrashDismissed: boolean;
  isSendingPending: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      userNote: '',
      transmissionStatus: 'idle',
      pendingCrash: null,
      pendingCrashDismissed: false,
      isSendingPending: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount(): void {
    // Check if an unhandled crash was recorded on prior session launch
    void this.checkForPendingCrash();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    diagnosticLogger.logError('CRASH_EXCEPTION', error.message, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    void diagnosticLogger.persistCrashReportImmediately({
      timestamp: Date.now(),
      errorMessage: error.message,
      stackTrace: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      breadcrumbs: diagnosticLogger.getBreadcrumbs(),
      stateSnapshot: diagnosticLogger.getStateSnapshot(),
      deviceMetadata: diagnosticLogger.getDeviceMetadata(),
      source: 'React.ErrorBoundary',
    });
  }

  private async checkForPendingCrash(): Promise<void> {
    try {
      const pending = await diagnosticLogger.getPendingCrashReport();
      if (pending) {
        this.setState({ pendingCrash: pending });
      }
    } catch {
      // Ignore
    }
  }

  private handleTransmitCrash = async (): Promise<void> => {
    const { error, errorInfo, userNote } = this.state;
    this.setState({ transmissionStatus: 'sending' });

    try {
      const res = await diagnosticLogger.submitDiagnosticReport({
        severity: 'FATAL',
        category: 'CRASH_EXCEPTION',
        title: `Fatal Crash: ${error?.message || 'Component Crash'}`,
        userDescription: userNote.trim() || undefined,
        errorMessage: error?.message,
        stackTrace: error?.stack,
        componentStack: errorInfo?.componentStack ?? undefined,
      });

      if (res.queuedLocally) {
        await diagnosticLogger.clearPendingCrashReport();
        this.setState({ transmissionStatus: 'queued_offline' });
      } else if (res.ok) {
        await diagnosticLogger.clearPendingCrashReport();
        this.setState({ transmissionStatus: 'sent' });
      } else {
        this.setState({ transmissionStatus: 'error' });
      }
    } catch {
      this.setState({ transmissionStatus: 'error' });
    }
  };

  private handleReloadAndResume = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      userNote: '',
      transmissionStatus: 'idle',
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.reload();
      } catch {
        // Fallback handled by state reset
      }
    }
  };

  private handleTransmitPendingCrash = async (): Promise<void> => {
    const { pendingCrash } = this.state;
    if (!pendingCrash) return;

    this.setState({ isSendingPending: true });
    try {
      const res = await diagnosticLogger.submitDiagnosticReport({
        severity: 'FATAL',
        category: 'CRASH_EXCEPTION',
        title: `Prior Session Fatal Crash: ${pendingCrash.errorMessage}`,
        userDescription: 'Auto-transmitted on subsequent session boot.',
        errorMessage: pendingCrash.errorMessage,
        stackTrace: pendingCrash.stackTrace,
        componentStack: pendingCrash.componentStack,
        breadcrumbs: pendingCrash.breadcrumbs,
        stateSnapshot: pendingCrash.stateSnapshot,
        deviceMetadata: pendingCrash.deviceMetadata,
      });
      if (res.queuedLocally || res.ok) {
        await diagnosticLogger.clearPendingCrashReport();
        this.setState({ pendingCrash: null, isSendingPending: false });
      } else {
        this.setState({ isSendingPending: false });
      }
    } catch {
      this.setState({ isSendingPending: false });
    }
  };

  private handleDismissPendingCrash = async (): Promise<void> => {
    await diagnosticLogger.clearPendingCrashReport();
    this.setState({ pendingCrash: null, pendingCrashDismissed: true });
  };

  render(): ReactNode {
    const {
      hasError,
      error,
      userNote,
      transmissionStatus,
      pendingCrash,
      pendingCrashDismissed,
      isSendingPending,
    } = this.state;

    if (hasError) {
      return (
        <View style={styles.errorContainer}>
          <ScrollView contentContainerStyle={styles.errorContent}>
            {/* Header Badge */}
            <View style={styles.headerRow}>
              <Text style={styles.skullIcon}>💀</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerEyebrow}>FATAL RUNTIME EXCEPTION</Text>
                <Text style={styles.headerTitle}>Encounter Interrupted</Text>
              </View>
            </View>

            {/* Gym Floor Safety Box */}
            <View style={styles.safetyBox}>
              <View style={styles.safetyHeader}>
                <Text style={styles.shieldIcon}>🛡️</Text>
                <Text style={styles.safetyTitle}>Zero Lost Sets Guarantee</Text>
              </View>
              <Text style={styles.safetyBody}>
                Fear not, Adventurer! Your local workout draft, completed sets, active rest timers,
                and character progress are safely persisted in offline storage. Your workout data
                will be intact when you resume.
              </Text>
            </View>

            {/* Error Summary */}
            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Diagnostic Summary</Text>
              <Text style={styles.errorText} numberOfLines={4}>
                {error?.name}: {error?.message}
              </Text>
            </View>

            {/* User Note Input */}
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>What were you doing when this happened? (Optional)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g., Logging set 3 of Barbell Bench Press or opening Guild Hall..."
                placeholderTextColor={CRIMSON_ONI.ashMuted}
                value={userNote}
                onChangeText={(text) => this.setState({ userNote: text })}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Transmission Status Feedback */}
            {transmissionStatus === 'sent' && (
              <View style={styles.feedbackBannerSuccess}>
                <Text style={styles.feedbackTextSuccess}>
                  ✅ Crash scroll transmitted to developers. Thank you for making Gymify RPG resilient!
                </Text>
              </View>
            )}
            {transmissionStatus === 'queued_offline' && (
              <View style={styles.feedbackBannerQueued}>
                <Text style={styles.feedbackTextQueued}>
                  📦 Network unreachable. Crash scroll queued locally and will auto-flush when online.
                </Text>
              </View>
            )}
            {transmissionStatus === 'error' && (
              <View style={styles.feedbackBannerError}>
                <Text style={styles.feedbackTextError}>
                  ⚠️ Unable to transmit crash report. You may still resume your workout.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionColumn}>
              <Pressable
                style={[
                  styles.transmitBtn,
                  (transmissionStatus === 'sending' ||
                    transmissionStatus === 'sent' ||
                    transmissionStatus === 'queued_offline') &&
                    styles.btnDisabled,
                ]}
                onPress={() => void this.handleTransmitCrash()}
                disabled={
                  transmissionStatus === 'sending' ||
                  transmissionStatus === 'sent' ||
                  transmissionStatus === 'queued_offline'
                }
              >
                <Text style={styles.transmitBtnText}>
                  {transmissionStatus === 'sending'
                    ? 'Transmitting Diagnostic Scroll...'
                    : transmissionStatus === 'sent' || transmissionStatus === 'queued_offline'
                    ? '✓ Diagnostic Scroll Dispatched'
                    : '📜 Transmit Crash Scroll to Developers'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.resumeBtn}
                onPress={this.handleReloadAndResume}
              >
                <Text style={styles.resumeBtnText}>⚔️ Reload &amp; Resume Encounter</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {this.props.children}

        {/* Prior Crash Startup Banner */}
        {pendingCrash && !pendingCrashDismissed && (
          <Modal transparent animationType="fade" visible={true}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalIcon}>📜</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalEyebrow}>SYSTEM RECOVERY NOTICE</Text>
                    <Text style={styles.modalTitle}>Prior Crash Scroll Detected</Text>
                  </View>
                </View>

                <Text style={styles.modalBody}>
                  Gymify caught an unexpected crash during your previous session. Diagnostic
                  breadcrumbs and sanitized state have been saved locally. Would you like to
                  transmit this report to help developers fix it?
                </Text>

                <View style={styles.modalErrorBox}>
                  <Text style={styles.modalErrorText} numberOfLines={2}>
                    {pendingCrash.errorMessage}
                  </Text>
                </View>

                <View style={styles.modalButtonRow}>
                  <Pressable
                    style={styles.modalDismissBtn}
                    onPress={() => void this.handleDismissPendingCrash()}
                  >
                    <Text style={styles.modalDismissText}>Dismiss</Text>
                  </Pressable>

                  <Pressable
                    style={styles.modalTransmitBtn}
                    onPress={() => void this.handleTransmitPendingCrash()}
                    disabled={isSendingPending}
                  >
                    <Text style={styles.modalTransmitText}>
                      {isSendingPending ? 'Transmitting...' : 'Transmit Scroll'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#0E0D10',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingTop:
      Platform.OS === 'web'
        ? 24
        : Platform.OS === 'ios'
        ? 58
        : (StatusBar.currentHeight ?? 28) + 16,
    paddingBottom: 28,
  },
  errorContent: {
    maxWidth: 620,
    width: '100%',
    paddingVertical: 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C1D21',
    paddingBottom: 16,
  },
  skullIcon: {
    fontSize: 36,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FEE2E2',
    letterSpacing: 0.5,
  },
  safetyBox: {
    backgroundColor: '#14201A',
    borderColor: '#1F4735',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldIcon: {
    fontSize: 18,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#86EFAC',
  },
  safetyBody: {
    fontSize: 12,
    color: '#D1FAE5',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#1E1417',
    borderColor: '#4A1D24',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FCA5A5',
    textTransform: 'uppercase',
  },
  errorText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#FECDD3',
  },
  noteBox: {
    gap: 6,
  },
  noteLabel: {
    fontSize: 12,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  noteInput: {
    backgroundColor: '#1B191E',
    borderColor: '#36333B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: '#F3F4F6',
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  feedbackBannerSuccess: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  feedbackTextSuccess: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackBannerQueued: {
    backgroundColor: '#451A03',
    borderColor: '#D97706',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  feedbackTextQueued: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackBannerError: {
    backgroundColor: '#450A0A',
    borderColor: '#DC2626',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  feedbackTextError: {
    color: '#FECACA',
    fontSize: 12,
    fontWeight: '600',
  },
  actionColumn: {
    gap: 10,
    marginTop: 6,
  },
  transmitBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transmitBtnText: {
    color: '#FEE2E2',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  resumeBtn: {
    backgroundColor: '#26242B',
    borderColor: '#4A4652',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeBtnText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop:
      Platform.OS === 'web'
        ? 20
        : Platform.OS === 'ios'
        ? 58
        : (StatusBar.currentHeight ?? 28) + 16,
    paddingBottom: 28,
  },
  modalCard: {
    backgroundColor: '#1E1C22',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 20,
    maxWidth: 480,
    width: '100%',
    gap: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIcon: {
    fontSize: 28,
  },
  modalEyebrow: {
    fontSize: 10,
    color: '#C69A45',
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  modalTitle: {
    fontSize: 18,
    color: '#F9FAFB',
    fontWeight: '900',
  },
  modalBody: {
    fontSize: 13,
    color: '#D1D5DB',
    lineHeight: 18,
  },
  modalErrorBox: {
    backgroundColor: '#2B1A1E',
    borderColor: '#5E222A',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  modalErrorText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalDismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  modalDismissText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalTransmitBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  modalTransmitText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
  },
});
