import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { SocialFriendItemDto, SocialFriendsOverviewDto } from '../../api/apiClient';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { HairlineDivider, SlateSection } from '../ui';

export interface FriendsViewProps {
  friends: SocialFriendsOverviewDto;
  busyAction: boolean;
  statusMessage: string | null;
  onSendFriendRequest: (targetInput: string) => void;
  onRespondFriendRequest: (friendshipId: string, action: 'ACCEPT' | 'DECLINE') => void;
  onRemoveFriend: (friendshipId: string) => void;
  onSparFriend: (friend: SocialFriendItemDto) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  friends,
  busyAction,
  statusMessage,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriend,
  onSparFriend,
}) => {
  const [targetInput, setTargetInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSend = () => {
    const trimmed = targetInput.trim();
    if (trimmed.length < 2) {
      setInputError('Enter a username or hero name (at least 2 characters).');
      return;
    }
    setInputError(null);
    onSendFriendRequest(trimmed);
    setTargetInput('');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {statusMessage ? (
        <View style={styles.statusBanner}>
          <RpgIcon name="check" size={14} color={COLORS.gold} />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      ) : null}

      <SlateSection
        level={1}
        eyebrow="FELLOWSHIP & RIVALS"
        title="Add Friends & Sparring Partners"
        subtitle="Connect with fellow lifters by account username or hero name."
      >
        <View style={styles.sendRow}>
          <TextInput
            style={styles.inputFlex}
            value={targetInput}
            onChangeText={setTargetInput}
            placeholder="Username or Hero name"
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            testID="friend-request-input"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            disabled={busyAction}
            activeOpacity={0.8}
            testID="friend-request-send-btn"
          >
            <RpgIcon name="plus" size={14} color={SURFACES.canvas} />
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
        {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
      </SlateSection>

      {/* Incoming Requests */}
      <SlateSection
        level={1}
        eyebrow="INCOMING REQUESTS"
        title={`Pending Invites (${friends.incoming.length})`}
      >
        {friends.incoming.length === 0 ? (
          <Text style={styles.emptyText}>No incoming friend requests.</Text>
        ) : (
          <View style={styles.listCol}>
            {friends.incoming.map((req) => (
              <View key={req.friendshipId} style={styles.friendRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.nameText}>
                    {req.characterName || req.username}
                    {req.gymClanTag ? ` [${req.gymClanTag}]` : ''}
                  </Text>
                  <Text style={styles.metaText}>
                    @{req.username}
                    {typeof req.overallLevel === 'number' ? ` • Lv.${req.overallLevel}` : ''}
                    {typeof req.arenaRating === 'number' ? ` • Arena ${req.arenaRating}` : ''}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => onRespondFriendRequest(req.friendshipId, 'ACCEPT')}
                    disabled={busyAction}
                    activeOpacity={0.8}
                    testID={`friend-accept-btn-${req.friendshipId}`}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => onRespondFriendRequest(req.friendshipId, 'DECLINE')}
                    disabled={busyAction}
                    activeOpacity={0.8}
                    testID={`friend-decline-btn-${req.friendshipId}`}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </SlateSection>

      {/* Accepted Friends */}
      <SlateSection
        level={1}
        eyebrow="ACCEPTED FRIENDS"
        title={`Training Allies (${friends.accepted.length})`}
      >
        {friends.accepted.length === 0 ? (
          <Text style={styles.emptyText}>
            No accepted friends yet. Send a request or accept an invite above.
          </Text>
        ) : (
          <View style={styles.listCol}>
            {friends.accepted.map((friend) => (
              <View key={friend.friendshipId} style={styles.friendRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.nameText}>
                    {friend.characterName || friend.username}
                    {friend.gymClanTag ? ` [${friend.gymClanTag}]` : ''}
                  </Text>
                  <Text style={styles.metaText}>
                    @{friend.username}
                    {typeof friend.overallLevel === 'number' ? ` • Lv.${friend.overallLevel}` : ''}
                    {typeof friend.arenaRating === 'number'
                      ? ` • Arena ${friend.arenaRating}`
                      : ''}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.sparBtn}
                    onPress={() => onSparFriend(friend)}
                    disabled={busyAction}
                    activeOpacity={0.8}
                    testID={`friend-spar-btn-${friend.friendshipId}`}
                  >
                    <RpgIcon name="combat" size={12} color={SURFACES.canvas} />
                    <Text style={styles.sparBtnText}>Spar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemoveFriend(friend.friendshipId)}
                    disabled={busyAction}
                    activeOpacity={0.8}
                    testID={`friend-remove-btn-${friend.friendshipId}`}
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {friends.outgoing.length > 0 ? (
          <>
            <HairlineDivider spacing={SPACING.md} />
            <Text style={styles.outgoingHeading}>
              Outgoing Requests ({friends.outgoing.length})
            </Text>
            <View style={styles.listCol}>
              {friends.outgoing.map((req) => (
                <View key={req.friendshipId} style={styles.friendRow}>
                  <View style={styles.infoCol}>
                    <Text style={styles.nameText}>{req.characterName || req.username}</Text>
                    <Text style={styles.metaText}>@{req.username} • Pending response</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemoveFriend(req.friendshipId)}
                    disabled={busyAction}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.removeBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </SlateSection>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  statusText: {
    ...TYPOGRAPHY.bodySm,
    color: COLORS.gold,
    flex: 1,
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputFlex: {
    flex: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
  },
  sendBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  errorText: {
    marginTop: SPACING.xs,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  listCol: {
    gap: SPACING.sm,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexWrap: 'wrap',
  },
  infoCol: {
    flex: 1,
    minWidth: 150,
    gap: 2,
  },
  nameText: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  metaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  acceptBtn: {
    backgroundColor: '#26A69A',
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  acceptBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  declineBtn: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  declineBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  sparBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sparBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  removeBtn: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  removeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.strength,
  },
  outgoingHeading: {
    ...TYPOGRAPHY.eyebrow,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
});
