import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ExerciseGymPreferenceMap,
  normalizeGymId,
  resolveExerciseStickyNote,
} from '@gymify/game-engine';
import { CRIMSON_ONI } from '../theme';

export interface ExerciseStickyNoteRowProps {
  exerciseId: string;
  activeGymId?: string | null;
  activeGymName?: string | null;
  preferences: ExerciseGymPreferenceMap;
  onSaveNote: (params: {
    exerciseId: string;
    note: string;
    activeGymId?: string | null;
    activeGymName?: string | null;
  }) => void;
}

export const ExerciseStickyNoteRow: React.FC<ExerciseStickyNoteRowProps> = ({
  exerciseId,
  activeGymId,
  activeGymName,
  preferences,
  onSaveNote,
}) => {
  const resolved = resolveExerciseStickyNote(preferences, exerciseId, activeGymId);
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(resolved.note);

  useEffect(() => {
    setDraftNote(resolved.note);
    setEditing(false);
  }, [exerciseId, activeGymId, resolved.note]);

  const normGym = normalizeGymId(activeGymId);
  const isSpecificGym = Boolean(normGym && normGym !== 'open-world');
  const shortGymLabel = activeGymName || normGym || 'Global';

  const handleCommit = () => {
    onSaveNote({
      exerciseId,
      note: draftNote,
      activeGymId,
      activeGymName,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.editorWrap}>
        <View style={styles.editorInputRow}>
          <TextInput
            style={styles.editorInput}
            value={draftNote}
            onChangeText={setDraftNote}
            placeholder={
              isSpecificGym
                ? `Setup @ ${shortGymLabel} (e.g. Seat 4, Pin 6)...`
                : 'Sticky setup note (e.g. Seat 4, elbows tucked)...'
            }
            placeholderTextColor={CRIMSON_ONI.ashMuted}
            returnKeyType="done"
            onSubmitEditing={handleCommit}
            autoFocus
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleCommit} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setDraftNote(resolved.note);
              setEditing(false);
            }}
          >
            <Text style={styles.cancelBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {resolved.otherGymNotes.length > 0 ? (
          <View style={styles.otherGymsWrap}>
            {resolved.otherGymNotes.map((og) => (
              <TouchableOpacity
                key={og.gymId}
                style={styles.otherGymChip}
                onPress={() => setDraftNote(og.note)}
                activeOpacity={0.75}
              >
                <Text style={styles.otherGymChipText} numberOfLines={1}>
                  📋 Copy from {og.gymName}: “{og.note}”
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (!resolved.note) {
    return (
      <TouchableOpacity
        style={styles.emptyPinBtn}
        onPress={() => setEditing(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.emptyPinText} numberOfLines={1}>
          📌 Gym-Specific Notes (seat height, pin placement, cues...)
        </Text>
      </TouchableOpacity>
    );
  }

  const scopeBadge =
    resolved.source === 'ACTIVE_GYM' && isSpecificGym
      ? `@ ${shortGymLabel}`
      : resolved.source === 'OTHER_GYM' && resolved.sourceGymName
        ? `↪ ${resolved.sourceGymName}`
        : null;

  return (
    <TouchableOpacity
      style={styles.pinnedRow}
      onPress={() => setEditing(true)}
      activeOpacity={0.75}
    >
      <Text style={styles.pinnedText} numberOfLines={1}>
        📌 {resolved.note}
      </Text>
      {scopeBadge ? <Text style={styles.scopePill}>{scopeBadge}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  emptyPinBtn: {
    paddingVertical: 3,
    marginBottom: 6,
  },
  emptyPinText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#231F18',
    borderColor: 'rgba(198, 154, 69, 0.4)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    gap: 6,
  },
  pinnedText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '700',
  },
  scopePill: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#19181D',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  editorWrap: {
    marginBottom: 8,
    gap: 5,
  },
  editorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorInput: {
    flex: 1,
    backgroundColor: '#17161C',
    borderColor: CRIMSON_ONI.agedGold,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    color: '#FFFFFF',
    fontSize: 11,
  },
  saveBtn: {
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  saveBtnText: {
    color: '#121114',
    fontSize: 11,
    fontWeight: '900',
  },
  cancelBtn: {
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
  },
  otherGymsWrap: {
    gap: 4,
  },
  otherGymChip: {
    backgroundColor: '#1D1B24',
    borderColor: '#373445',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  otherGymChipText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
  },
});
