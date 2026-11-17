import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CompletedWorkoutRecord } from '@goki/game-engine';
import { RpgIcon } from '../components/icons/RpgIcon';
import { NpcDialogueOverlay } from '../components/npc';
import { SegmentedControl, SegmentedOption } from '../components/ui';
import { useGame } from '../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES } from '../theme';
import { TrainingHistoryScreen } from './TrainingHistoryScreen';
import { WorkoutLoggerScreen } from './WorkoutLoggerScreen';

export type TrainSubView = 'WORKOUT' | 'HISTORY';

export interface TrainHubScreenProps {
  onOpenOfflineLogger?: () => void;
  onReturnToLanding?: () => void;
  onNavigateToTalents?: () => void;
  onNavigateToPaperdoll?: () => void;
}

const SUB_OPTIONS: ReadonlyArray<SegmentedOption<TrainSubView>> = [
  {
    key: 'WORKOUT',
    label: 'Workout',
    icon: 'train',
    testID: 'train-subtab-workout',
  },
  {
    key: 'HISTORY',
    label: 'History',
    icon: 'history',
    testID: 'train-subtab-history',
  },
];

export const TrainHubScreen: React.FC<TrainHubScreenProps> = ({
  onOpenOfflineLogger,
  onReturnToLanding,
  onNavigateToTalents,
  onNavigateToPaperdoll,
}) => {
  const { workoutsLoggedCount, consistencyStreak } = useGame();
  const [subView, setSubView] = useState<TrainSubView>('WORKOUT');
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<CompletedWorkoutRecord | null>(
    null
  );

  return (
    <View style={styles.root}>
      {/* Segmented Workout | History Bar + Coach NPC */}
      <View style={styles.topBar}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            options={SUB_OPTIONS}
            value={subView}
            onChange={setSubView}
          />
        </View>
        <TouchableOpacity
          style={styles.npcBtn}
          onPress={() => setTrainerOpen(true)}
          activeOpacity={0.75}
          testID="train-npc-btn"
        >
          <RpgIcon name="combat" size={14} color={COLORS.strength} />
          <Text style={styles.npcBtnText}>Coach</Text>
        </TouchableOpacity>
      </View>

      {/* Keep WorkoutLoggerScreen mounted so switching to History never drops sets or rest timers */}
      <View
        style={[
          styles.pane,
          subView !== 'WORKOUT' && styles.paneHidden,
        ]}
      >
        <WorkoutLoggerScreen
          onOpenOfflineLogger={onOpenOfflineLogger}
          onBackToLanding={onReturnToLanding}
          onNavigateToTalents={onNavigateToTalents}
          onNavigateToPaperdoll={onNavigateToPaperdoll}
          onOpenHistory={() => setSubView('HISTORY')}
          externalLoadedSession={pendingSession}
          onConsumeExternalSession={() => setPendingSession(null)}
        />
      </View>

      {subView === 'HISTORY' && (
        <View style={styles.pane}>
          <TrainingHistoryScreen
            embedded
            visible={true}
            onBack={() => setSubView('WORKOUT')}
            onLoadSessionIntoWorkout={(workout) => {
              setPendingSession(workout);
              setSubView('WORKOUT');
            }}
          />
        </View>
      )}

      <NpcDialogueOverlay
        visible={trainerOpen}
        onClose={() => setTrainerOpen(false)}
        npcId="TRAINER"
        dialoguePages={[
          `You have ${workoutsLoggedCount} logged workout${
            workoutsLoggedCount === 1 ? '' : 's'
          } and a ${consistencyStreak}-day streak. Pick a discipline to start a live session or review your Progression Matrix in History.`,
          'In Milestone 4, I will read your 7-day MEV/MAV/MRV muscle volume landmarks and fatigue state to suggest overload targets and deload timing.',
        ]}
        actionChips={[
          {
            id: 'coach-history',
            label: 'View History',
            icon: 'history',
            onPress: () => {
              setTrainerOpen(false);
              setSubView('HISTORY');
            },
          },
          ...(onOpenOfflineLogger
            ? [
                {
                  id: 'coach-offline',
                  label: 'Quick Offline Logger',
                  icon: 'train' as const,
                  onPress: () => {
                    setTrainerOpen(false);
                    onOpenOfflineLogger();
                  },
                },
              ]
            : []),
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACES.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: SURFACES.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
  },
  segmentedWrap: {
    flex: 1,
  },
  npcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  npcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.strength,
  },
  pane: {
    flex: 1,
  },
  paneHidden: {
    display: 'none',
  },
});
