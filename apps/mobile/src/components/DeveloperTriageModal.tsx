import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../api/apiClient';
import { useGame } from '../state/GameContext';
import { COLORS, CRIMSON_ONI } from '../theme';

export type TriageStatusFilter = 'ALL' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';
export type TriageSeverityFilter = 'ALL' | 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
export type TriageCategoryFilter =
  | 'ALL'
  | 'FEATURE_SUGGESTION'
  | 'BUGS_ONLY'
  | 'CRASH_EXCEPTION'
  | 'WORKOUT_SYNC'
  | 'UI_UX';

export interface BugReportEntry {
  id: string;
  userId: string | null;
  characterId: string | null;
  severity: 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
  category: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';
  title: string;
  userDescription: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  componentStack: string | null;
  breadcrumbs: Array<{
    timestamp: number | string;
    level: string;
    category: string;
    message: string;
    data?: Record<string, unknown> | null;
  }>;
  stateSnapshot: Record<string, unknown>;
  deviceMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperTriageModalProps {
  visible: boolean;
  onClose: () => void;
}

const STATUS_FILTERS: TriageStatusFilter[] = ['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'];
const SEVERITY_FILTERS: TriageSeverityFilter[] = ['ALL', 'FATAL', 'ERROR', 'WARNING', 'INFO'];
const CATEGORY_FILTERS: Array<{ key: TriageCategoryFilter; label: string }> = [
  { key: 'ALL', label: 'All Items' },
  { key: 'FEATURE_SUGGESTION', label: '💡 Suggestions' },
  { key: 'BUGS_ONLY', label: '🐛 Bugs Only' },
  { key: 'CRASH_EXCEPTION', label: '💥 Crashes' },
  { key: 'WORKOUT_SYNC', label: '🔄 Sync' },
  { key: 'UI_UX', label: '🎨 UI/UX' },
];

export const DeveloperTriageModal: React.FC<DeveloperTriageModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const safeTop =
    Platform.OS === 'web'
      ? 0
      : Math.max(insets.top, Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 28) + 4);
  const safeBottom =
    Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 12);

  const [reports, setReports] = useState<BugReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TriageStatusFilter>('ALL');
  const [severityFilter, setSeverityFilter] = useState<TriageSeverityFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<TriageCategoryFilter>('ALL');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ [id: string]: string }>({});

  const { fatigueState, resilienceShields, simulateLayoffHours } = useGame();
  const hoursSinceLastWorkout =
    fatigueState?.lastWorkoutAt !== null && fatigueState?.lastWorkoutAt !== undefined
      ? Math.round((Date.now() - new Date(fatigueState.lastWorkoutAt).getTime()) / (3600 * 1000))
      : 0;
  const antiCollapseStatus = {
    hoursSinceLastWorkout,
    isReturningAfterGap: hoursSinceLastWorkout >= 72,
    resilienceTokenAvailable: resilienceShields > 0 || hoursSinceLastWorkout >= 72,
  };

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const queryParams = new URLSearchParams();
    if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
    if (severityFilter !== 'ALL') queryParams.set('severity', severityFilter);
    if (categoryFilter !== 'ALL' && categoryFilter !== 'BUGS_ONLY') {
      queryParams.set('category', categoryFilter);
    }
    queryParams.set('limit', '50');

    try {
      const res = await apiFetch(`/api/diagnostics/reports?${queryParams.toString()}`, {
        method: 'GET',
      }, 5000);

      if (res.status === 401) {
        setErrorMessage('Authentication required. Please log into an adventurer account first.');
        setReports([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || `Failed to fetch reports (${res.status})`);
        setLoading(false);
        return;
      }

      const json = await res.json();
      let list = json.reports || [];
      if (categoryFilter === 'BUGS_ONLY') {
        list = list.filter((r: BugReportEntry) => r.category !== 'FEATURE_SUGGESTION');
      }
      setReports(list);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error: could not connect to server.'
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, categoryFilter]);

  useEffect(() => {
    if (visible) {
      void fetchReports();
    }
  }, [visible, fetchReports]);

  const handleUpdateStatus = async (
    reportId: string,
    newStatus: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED'
  ) => {
    setUpdatingId(reportId);
    try {
      const res = await apiFetch(`/api/diagnostics/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }, 5000);

      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
        );
      }
    } catch {
      // Keep optimistic or ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyJson = async (report: BugReportEntry) => {
    const raw = JSON.stringify(report, null, 2);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        setCopyFeedback((prev) => ({ ...prev, [report.id]: 'Copied!' }));
      } else {
        setCopyFeedback((prev) => ({ ...prev, [report.id]: 'Ready below' }));
      }
    } catch {
      setCopyFeedback((prev) => ({ ...prev, [report.id]: 'Failed' }));
    }
    setTimeout(() => {
      setCopyFeedback((prev) => {
        const next = { ...prev };
        delete next[report.id];
        return next;
      });
    }, 2500);
  };

  const severityBadgeColor = (sev: string) => {
    switch (sev) {
      case 'FATAL':
        return { bg: '#450A0A', text: '#F87171', border: '#DC2626' };
      case 'ERROR':
        return { bg: '#3B181B', text: '#FCA5A5', border: '#EF4444' };
      case 'WARNING':
        return { bg: '#352A15', text: '#FCD34D', border: '#D97706' };
      case 'INFO':
      default:
        return { bg: '#132A42', text: '#7DD3FC', border: '#0284C7' };
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return { bg: '#064E3B', text: '#6EE7B7', border: '#059669' };
      case 'INVESTIGATING':
        return { bg: '#431407', text: '#FDBA74', border: '#EA580C' };
      case 'IGNORED':
        return { bg: '#1F2937', text: '#9CA3AF', border: '#4B5563' };
      case 'OPEN':
      default:
        return { bg: '#450A0A', text: '#FCA5A5', border: '#DC2626' };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.modalBackdrop,
          { paddingTop: safeTop + 12, paddingBottom: safeBottom + 12 },
        ]}
      >
        <View style={styles.triageContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerIcon}>🛠️</Text>
              <View>
                <Text style={styles.headerTitle}>Developer Sanctum • Bug Triage</Text>
                <Text style={styles.headerSubtitle}>
                  Live inspection &amp; resolution of crash logs &amp; telemetry
                </Text>
              </View>
            </View>
            <View style={styles.headerActionRow}>
              <Pressable
                style={styles.refreshBtn}
                onPress={() => void fetchReports()}
                disabled={loading}
              >
                <Text style={styles.refreshBtnText}>{loading ? '...' : '🔄 Refresh'}</Text>
              </Pressable>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Filter Chips Bar */}
          <View style={styles.filterBar}>
            {/* Status Filters */}
            <View style={styles.filterRow}>
              <Text style={styles.filterSectionLabel}>Status:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {STATUS_FILTERS.map((s) => {
                  const active = statusFilter === s;
                  return (
                    <Pressable
                      key={s}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setStatusFilter(s)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Category / Type Filters */}
            <View style={styles.filterRow}>
              <Text style={styles.filterSectionLabel}>Type:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {CATEGORY_FILTERS.map((cat) => {
                  const active = categoryFilter === cat.key;
                  const isSugg = cat.key === 'FEATURE_SUGGESTION';
                  return (
                    <Pressable
                      key={cat.key}
                      style={[
                        styles.filterChip,
                        active && styles.filterChipActive,
                        isSugg && active && styles.filterChipSuggestionActive,
                      ]}
                      onPress={() => setCategoryFilter(cat.key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                          isSugg && active && styles.filterChipSuggestionText,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Severity Filters */}
            <View style={styles.filterRow}>
              <Text style={styles.filterSectionLabel}>Severity:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {SEVERITY_FILTERS.map((sev) => {
                  const active = severityFilter === sev;
                  return (
                    <Pressable
                      key={sev}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setSeverityFilter(sev)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {sev}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Main Content List */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 🧪 Simulation & Recovery Debug Tools */}
            <View style={styles.debugSection}>
              <View style={styles.debugHeaderRow}>
                <Text style={styles.debugSectionTitle}>🧪 Simulation &amp; Recovery Debug Tools</Text>
                <View style={styles.debugBadgePill}>
                  <Text style={styles.debugBadgePillText}>
                    {antiCollapseStatus.hoursSinceLastWorkout}h Since Last Workout
                  </Text>
                </View>
              </View>
              <View style={styles.debugActionsRow}>
                <Pressable
                  testID="dev-triage-simulate-layoff-btn"
                  style={styles.simulateLayoffBtn}
                  onPress={() => simulateLayoffHours(96)}
                >
                  <Text style={styles.simulateLayoffBtnText}>
                    ⏱️ Simulate 96h Missed-Session Gap
                  </Text>
                </Pressable>
                <View style={styles.debugMetricsPills}>
                  <Text
                    style={[
                      styles.debugStatusText,
                      antiCollapseStatus.resilienceTokenAvailable
                        ? styles.debugStatusActive
                        : styles.debugStatusInactive,
                    ]}
                  >
                    🛡️ Resilience Token:{' '}
                    {antiCollapseStatus.resilienceTokenAvailable ? 'ACTIVE' : 'INACTIVE'} (
                    {resilienceShields} Shields)
                  </Text>
                </View>
              </View>
            </View>
            {loading && reports.length === 0 && (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color="#C69A45" />
                <Text style={styles.emptyStateText}>Consulting Developer Sanctum records...</Text>
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {!loading && !errorMessage && reports.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🛡️</Text>
                <Text style={styles.emptyStateTitle}>Zero Reports Found</Text>
                <Text style={styles.emptyStateText}>
                  The realm is quiet. No reports match your active filter criteria.
                </Text>
              </View>
            )}

            {reports.map((report) => {
              const isExpanded = expandedReportId === report.id;
              const isSuggestion = report.category === 'FEATURE_SUGGESTION';
              const sevColor = severityBadgeColor(report.severity);
              const statColor = statusBadgeColor(report.status);
              const isBusy = updatingId === report.id;
              const createdDate = new Date(report.createdAt).toLocaleString();
              const osSnippet = report.deviceMetadata?.platform
                ? `${report.deviceMetadata.platform} ${report.deviceMetadata.osVersion || ''}`
                : 'Unknown device';

              return (
                <View
                  key={report.id}
                  style={[styles.reportCard, isSuggestion && styles.reportCardSuggestion]}
                >
                  {/* Card Header */}
                  <Pressable
                    style={styles.cardHeader}
                    onPress={() =>
                      setExpandedReportId((prev) => (prev === report.id ? null : report.id))
                    }
                  >
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: sevColor.bg, borderColor: sevColor.border },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: sevColor.text }]}>
                          {report.severity}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.categoryPill,
                          isSuggestion && styles.categoryPillSuggestion,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryPillText,
                            isSuggestion && styles.categoryPillTextSuggestion,
                          ]}
                        >
                          {isSuggestion ? '💡 Suggestion' : report.category}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: statColor.bg, borderColor: statColor.border },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: statColor.text }]}>
                          {report.status}
                        </Text>
                      </View>

                      <Text style={styles.timestampText}>{createdDate}</Text>
                    </View>

                    <Text style={styles.reportTitle}>{report.title}</Text>

                    {report.userDescription && (
                      <Text
                        style={[
                          styles.userDescText,
                          isSuggestion && styles.userDescTextSuggestion,
                        ]}
                        numberOfLines={isExpanded ? undefined : 3}
                      >
                        {isSuggestion ? '💡 ' : '💬 "'}{report.userDescription}{isSuggestion ? '' : '"'}
                      </Text>
                    )}

                    <View style={styles.metaRow}>
                      <Text style={styles.metaDeviceText}>📱 {osSnippet}</Text>
                      <Text style={styles.expandToggleText}>
                        {isExpanded
                          ? isSuggestion
                            ? '▲ Collapse Suggestion'
                            : '▲ Collapse Scroll'
                          : isSuggestion
                          ? '▼ Inspect Suggestion & Details'
                          : '▼ Inspect Diagnostic Bundle'}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Expanded Diagnostic Deep-Dive */}
                  {isExpanded && (
                    <View style={styles.expandedSection}>
                      {/* Error Message & Stack Trace */}
                      {report.errorMessage && (
                        <View style={styles.codeBox}>
                          <Text style={styles.codeBoxTitle}>Error Message</Text>
                          <Text style={styles.codeText}>{report.errorMessage}</Text>
                        </View>
                      )}

                      {report.stackTrace && (
                        <View style={styles.codeBox}>
                          <Text style={styles.codeBoxTitle}>Stack Trace Snippet</Text>
                          <ScrollView style={styles.stackTraceScroll} nestedScrollEnabled>
                            <Text style={styles.codeText}>{report.stackTrace}</Text>
                          </ScrollView>
                        </View>
                      )}

                      {/* State Snapshot */}
                      {report.stateSnapshot && Object.keys(report.stateSnapshot).length > 0 && (
                        <View style={styles.codeBox}>
                          <Text style={styles.codeBoxTitle}>State Snapshot (Sanitized)</Text>
                          <Text style={styles.codeText}>
                            {JSON.stringify(report.stateSnapshot, null, 2)}
                          </Text>
                        </View>
                      )}

                      {/* Breadcrumbs Timeline */}
                      {Array.isArray(report.breadcrumbs) && report.breadcrumbs.length > 0 && (
                        <View style={styles.breadcrumbsContainer}>
                          <Text style={styles.codeBoxTitle}>
                            Rolling Breadcrumbs Timeline ({report.breadcrumbs.length} Events)
                          </Text>
                          <View style={styles.breadcrumbsList}>
                            {report.breadcrumbs.map((b, idx) => (
                              <View key={idx} style={styles.breadcrumbItem}>
                                <Text style={styles.crumbLevel}>[{b.level.toUpperCase()}]</Text>
                                <Text style={styles.crumbCategory}>{b.category}:</Text>
                                <Text style={styles.crumbMessage}>{b.message}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Actions Toolbar */}
                      <View style={styles.actionToolbar}>
                        <Pressable
                          style={styles.copyJsonBtn}
                          onPress={() => void handleCopyJson(report)}
                        >
                          <Text style={styles.copyJsonText}>
                            {copyFeedback[report.id] || '📋 Copy Full JSON'}
                          </Text>
                        </Pressable>

                        <View style={styles.statusActionGroup}>
                          {report.status !== 'INVESTIGATING' && (
                            <Pressable
                              style={[styles.statusBtn, styles.statusBtnInvestigate]}
                              onPress={() => handleUpdateStatus(report.id, 'INVESTIGATING')}
                              disabled={isBusy}
                            >
                              <Text style={styles.statusBtnText}>Investigate</Text>
                            </Pressable>
                          )}

                          {report.status !== 'RESOLVED' && (
                            <Pressable
                              style={[styles.statusBtn, styles.statusBtnResolve]}
                              onPress={() => handleUpdateStatus(report.id, 'RESOLVED')}
                              disabled={isBusy}
                            >
                              <Text style={styles.statusBtnText}>✓ Resolve</Text>
                            </Pressable>
                          )}

                          {report.status !== 'IGNORED' && (
                            <Pressable
                              style={[styles.statusBtn, styles.statusBtnIgnore]}
                              onPress={() => handleUpdateStatus(report.id, 'IGNORED')}
                              disabled={isBusy}
                            >
                              <Text style={styles.statusBtnText}>Ignore</Text>
                            </Pressable>
                          )}

                          {report.status !== 'OPEN' && (
                            <Pressable
                              style={[styles.statusBtn, styles.statusBtnReopen]}
                              onPress={() => handleUpdateStatus(report.id, 'OPEN')}
                              disabled={isBusy}
                            >
                              <Text style={styles.statusBtnText}>Reopen</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  triageContainer: {
    backgroundColor: '#16141A',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 12,
    maxWidth: 820,
    width: '100%',
    maxHeight: '88%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2834',
    backgroundColor: '#1E1B24',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 26,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F9FAFB',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshBtn: {
    backgroundColor: '#2D2836',
    borderColor: '#4A4358',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#DFB660',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '700',
  },
  filterBar: {
    backgroundColor: '#1B1822',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2834',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    width: 60,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#26222F',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#383245',
  },
  filterChipActive: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
  },
  filterChipSuggestionActive: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  filterChipTextActive: {
    color: '#FEE2E2',
    fontWeight: '900',
  },
  filterChipSuggestionText: {
    color: '#6EE7B7',
    fontWeight: '900',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F3F4F6',
  },
  emptyStateText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#450A0A',
    borderColor: '#DC2626',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#FECACA',
    fontSize: 12,
    fontWeight: '600',
  },
  reportCard: {
    backgroundColor: '#1F1C26',
    borderColor: '#383344',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  reportCardSuggestion: {
    backgroundColor: '#101B15',
    borderColor: '#059669',
  },
  cardHeader: {
    padding: 14,
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  categoryPill: {
    backgroundColor: '#2C2736',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryPillSuggestion: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  categoryPillTextSuggestion: {
    color: '#6EE7B7',
    fontWeight: '800',
  },
  timestampText: {
    fontSize: 10,
    color: '#6B7280',
    marginLeft: 'auto',
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  userDescText: {
    fontSize: 12,
    color: '#D1D5DB',
    fontStyle: 'italic',
  },
  userDescTextSuggestion: {
    color: '#A7F3D0',
    fontStyle: 'normal',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  metaDeviceText: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  expandToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DFB660',
  },
  expandedSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#2D2837',
    backgroundColor: '#18161F',
    gap: 12,
  },
  codeBox: {
    backgroundColor: '#100E14',
    borderColor: '#2D2837',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 4,
  },
  codeBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
  },
  codeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#E5E7EB',
  },
  stackTraceScroll: {
    maxHeight: 140,
  },
  breadcrumbsContainer: {
    gap: 6,
  },
  breadcrumbsList: {
    backgroundColor: '#100E14',
    borderColor: '#2D2837',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    gap: 4,
    maxHeight: 160,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  crumbLevel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#F59E0B',
  },
  crumbCategory: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  crumbMessage: {
    fontSize: 10,
    color: '#D1D5DB',
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
  },
  copyJsonBtn: {
    backgroundColor: '#2D2836',
    borderWidth: 1,
    borderColor: '#4A4358',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyJsonText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  statusActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBtnInvestigate: {
    backgroundColor: '#431407',
    borderColor: '#EA580C',
  },
  statusBtnResolve: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
  },
  statusBtnIgnore: {
    backgroundColor: '#1F2937',
    borderColor: '#4B5563',
  },
  statusBtnReopen: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
  },
  statusBtnText: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '800',
  },
  debugSection: {
    backgroundColor: '#1C1525',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    padding: 12,
    marginBottom: 14,
  },
  debugHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  debugSectionTitle: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '900',
  },
  debugBadgePill: {
    backgroundColor: '#2E1065',
    borderColor: '#A855F7',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  debugBadgePillText: {
    color: '#E9D5FF',
    fontSize: 10,
    fontWeight: '700',
  },
  debugActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  simulateLayoffBtn: {
    backgroundColor: '#581C87',
    borderColor: '#C084FC',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  simulateLayoffBtnText: {
    color: '#FAF5FF',
    fontSize: 12,
    fontWeight: '800',
  },
  debugMetricsPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 180,
  },
  debugStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  debugStatusActive: {
    color: '#34D399',
  },
  debugStatusInactive: {
    color: '#9CA3AF',
  },
});
