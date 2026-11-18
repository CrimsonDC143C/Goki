import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MAX_COMPANY_ACTIVE_SQUAD_SIZE, MAX_COMPANY_ROSTER_SIZE } from '@goki/game-engine';
import type { SocialCompanyDto, SocialCompanyMemberDto } from '../../api/apiClient';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';
import { RpgIcon } from '../icons/RpgIcon';
import { HairlineDivider, SlateSection } from '../ui';

export interface AdventurerCompanyViewProps {
  activeCompany: SocialCompanyDto | null;
  availableCompanies: SocialCompanyDto[];
  activeCharacterId: string;
  busyAction: boolean;
  statusMessage: string | null;
  onCreateCompany: (payload: { name: string; tag: string; motto?: string }) => void;
  onJoinCompany: (companyId: string) => void;
  onLeaveCompany: () => void;
  onSaveActiveSquad: (assignments: Array<{ characterId: string; squadSlot: number }>) => void;
  onOpenQuartermasterBriefing: () => void;
}

export const AdventurerCompanyView: React.FC<AdventurerCompanyViewProps> = ({
  activeCompany,
  availableCompanies,
  activeCharacterId,
  busyAction,
  statusMessage,
  onCreateCompany,
  onJoinCompany,
  onLeaveCompany,
  onSaveActiveSquad,
  onOpenQuartermasterBriefing,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [mottoInput, setMottoInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const rosterMembers: SocialCompanyMemberDto[] = useMemo(
    () => activeCompany?.members ?? [],
    [activeCompany]
  );

  // Local draft of active squad characterIds in slot order 1..4
  const [draftSquadIds, setDraftSquadIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeCompany?.members) {
      setDraftSquadIds([]);
      return;
    }
    const slotted = activeCompany.members
      .filter((m) => m.activeSquadSlot !== null && m.activeSquadSlot !== undefined)
      .sort((a, b) => (a.activeSquadSlot ?? 99) - (b.activeSquadSlot ?? 99))
      .map((m) => m.characterId)
      .slice(0, MAX_COMPANY_ACTIVE_SQUAD_SIZE);
    setDraftSquadIds(slotted);
  }, [activeCompany]);

  const handleCreate = () => {
    const name = nameInput.trim();
    const tag = tagInput.trim().toUpperCase();
    if (name.length < 3) {
      setFormError('Company name must be at least 3 characters.');
      return;
    }
    if (tag.length < 2 || tag.length > 5) {
      setFormError('Company tag must be 2–5 characters.');
      return;
    }
    setFormError(null);
    onCreateCompany({
      name,
      tag,
      motto: mottoInput.trim() || undefined,
    });
    setNameInput('');
    setTagInput('');
    setMottoInput('');
  };

  const toggleSquadMember = (characterId: string) => {
    setDraftSquadIds((prev) => {
      if (prev.includes(characterId)) {
        return prev.filter((id) => id !== characterId);
      }
      if (prev.length >= MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
        return [...prev.slice(0, MAX_COMPANY_ACTIVE_SQUAD_SIZE - 1), characterId];
      }
      return [...prev, characterId];
    });
  };

  const handleSaveSquad = () => {
    const assignments = draftSquadIds.map((characterId, idx) => ({
      characterId,
      squadSlot: idx + 1,
    }));
    onSaveActiveSquad(assignments);
  };

  const memberById = useMemo(() => {
    const map = new Map<string, SocialCompanyMemberDto>();
    for (const m of rosterMembers) {
      map.set(m.characterId, m);
    }
    return map;
  }, [rosterMembers]);

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
        eyebrow="ADVENTURER COMPANIES"
        title="Cross-Gym 30-Member Roster & 4-Player Squad"
        subtitle="Train with friends across any gym or home setup and assign up to 4 active squadmates."
        rightAction={
          <TouchableOpacity
            style={styles.briefBtn}
            onPress={onOpenQuartermasterBriefing}
            activeOpacity={0.75}
          >
            <RpgIcon name="chat" size={13} color="#A855F7" />
            <Text style={styles.briefBtnText}>Veyra</Text>
          </TouchableOpacity>
        }
      >
        {!activeCompany ? (
          <>
            <Text style={styles.sectionSubheading}>Found a New Company</Text>
            <View style={styles.formStack}>
              <View style={styles.formRow}>
                <TextInput
                  style={styles.inputFlex}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Company Name (e.g. Dawnbreakers)"
                  placeholderTextColor={COLORS.textMuted}
                  testID="company-name-input"
                />
                <TextInput
                  style={styles.inputTag}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="TAG"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={5}
                  autoCapitalize="characters"
                  testID="company-tag-input"
                />
              </View>
              <TextInput
                style={styles.inputFull}
                value={mottoInput}
                onChangeText={setMottoInput}
                placeholder="Company motto (optional)"
                placeholderTextColor={COLORS.textMuted}
                testID="company-motto-input"
              />
              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
              <TouchableOpacity
                style={styles.primaryCta}
                onPress={handleCreate}
                disabled={busyAction}
                activeOpacity={0.8}
                testID="company-create-btn"
              >
                <RpgIcon name="banners" size={14} color={SURFACES.canvas} />
                <Text style={styles.primaryCtaText}>Create Adventurer Company</Text>
              </TouchableOpacity>
            </View>

            <HairlineDivider spacing={SPACING.md} />

            <Text style={styles.sectionSubheading}>Open Companies Directory</Text>
            <View style={styles.companyList}>
              {availableCompanies.map((comp) => (
                <View key={comp.id} style={styles.companyRow}>
                  <View style={styles.companyInfoCol}>
                    <Text style={styles.companyName}>
                      {comp.name} [{comp.tag}]
                    </Text>
                    <Text style={styles.companyMeta}>
                      {comp.memberCount} / {comp.maxRosterSize || MAX_COMPANY_ROSTER_SIZE} Members •
                      Lv.{comp.companyLevel}
                      {comp.motto ? ` • "${comp.motto}"` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => onJoinCompany(comp.id)}
                    disabled={busyAction}
                    activeOpacity={0.8}
                    testID={`company-join-btn-${comp.id}`}
                  >
                    <Text style={styles.joinBtnText}>Join</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {availableCompanies.length === 0 ? (
                <Text style={styles.emptyText}>No open companies listed yet. Found one above!</Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            {/* Active Company Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryTitleCol}>
                  <Text style={styles.summaryName}>
                    {activeCompany.name} [{activeCompany.tag}]
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {activeCompany.memberCount || rosterMembers.length} /{' '}
                    {activeCompany.maxRosterSize || MAX_COMPANY_ROSTER_SIZE} Members • Rep{' '}
                    {activeCompany.companyReputation.toLocaleString()}
                  </Text>
                  {activeCompany.motto ? (
                    <Text style={styles.summaryMotto}>&ldquo;{activeCompany.motto}&rdquo;</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.leaveBtn}
                  onPress={onLeaveCompany}
                  disabled={busyAction}
                  activeOpacity={0.8}
                  testID="company-leave-btn"
                >
                  <Text style={styles.leaveBtnText}>Leave Company</Text>
                </TouchableOpacity>
              </View>
            </View>

            <HairlineDivider spacing={SPACING.md} />

            {/* 4-Player Active Squad */}
            <View testID="company-squad-section">
              <View style={styles.squadHeaderRow}>
                <Text style={styles.sectionSubheading}>4-Player Active Squad</Text>
                <Text style={styles.squadCountText}>
                  {draftSquadIds.length} / {MAX_COMPANY_ACTIVE_SQUAD_SIZE} Assigned
                </Text>
              </View>

              <View style={styles.squadGrid}>
                {[1, 2, 3, 4].map((slotNumber) => {
                  const charId = draftSquadIds[slotNumber - 1];
                  const member = charId ? memberById.get(charId) : undefined;
                  return (
                    <View key={slotNumber} style={styles.squadSlotCard}>
                      <Text style={styles.squadSlotLabel}>SLOT {slotNumber}</Text>
                      {member ? (
                        <>
                          <Text style={styles.squadMemberName} numberOfLines={1}>
                            {member.characterName}
                          </Text>
                          <Text style={styles.squadMemberMeta}>
                            Lv.{member.overallLevel} • {member.role}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.squadEmptyText}>Empty Slot</Text>
                      )}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.saveSquadBtn}
                onPress={handleSaveSquad}
                disabled={busyAction}
                activeOpacity={0.8}
                testID="company-save-squad-btn"
              >
                <RpgIcon name="check" size={14} color={SURFACES.canvas} />
                <Text style={styles.saveSquadBtnText}>Save Active Squad</Text>
              </TouchableOpacity>

              <View
                style={styles.coopReadyStrip}
                testID="company-coop-ready-strip"
              >
                <RpgIcon name="sparkles" size={13} color="#38BDF8" />
                <Text style={styles.coopReadyStripText}>
                  4-player Active Squad slots sync into live company-quest:runId WebSocket rooms in Adventure → Guild Quests.
                </Text>
              </View>
            </View>

            <HairlineDivider spacing={SPACING.md} />

            {/* Company Roster */}
            <Text style={styles.sectionSubheading}>
              Company Roster ({rosterMembers.length} / {MAX_COMPANY_ROSTER_SIZE})
            </Text>
            <View style={styles.rosterList}>
              {rosterMembers.map((member) => {
                const slotIndex = draftSquadIds.indexOf(member.characterId);
                const inSquad = slotIndex !== -1;
                const isSelf = member.characterId === activeCharacterId;
                return (
                  <View key={member.characterId} style={styles.rosterRow}>
                    <View style={styles.rosterInfoCol}>
                      <View style={styles.rosterNameRow}>
                        <Text style={styles.rosterName}>
                          {member.characterName}
                          {isSelf ? ' (You)' : ''}
                        </Text>
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>{member.role}</Text>
                        </View>
                      </View>
                      <Text style={styles.rosterMeta}>
                        Lv.{member.overallLevel} • Rep {(member.contributedReputation ?? 0).toLocaleString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.squadToggleBtn, inSquad && styles.squadToggleBtnActive]}
                      onPress={() => toggleSquadMember(member.characterId)}
                      activeOpacity={0.8}
                      testID={`company-squad-toggle-${member.characterId}`}
                    >
                      <Text
                        style={[
                          styles.squadToggleText,
                          inSquad && styles.squadToggleTextActive,
                        ]}
                      >
                        {inSquad ? `Slot ${slotIndex + 1}` : '+ Squad'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.footerCtaRow}>
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={onOpenQuartermasterBriefing}
            activeOpacity={0.8}
          >
            <RpgIcon name="chat" size={14} color={COLORS.textPrimary} />
            <Text style={styles.secondaryCtaText}>Brief with Commander Veyra</Text>
          </TouchableOpacity>
        </View>
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
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  briefBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A855F7',
  },
  sectionSubheading: {
    ...TYPOGRAPHY.eyebrow,
    marginBottom: SPACING.sm,
  },
  formStack: {
    gap: SPACING.sm,
  },
  formRow: {
    flexDirection: 'row',
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
  inputTag: {
    width: 84,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  inputFull: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 11,
  },
  primaryCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  companyList: {
    gap: SPACING.sm,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  companyInfoCol: {
    flex: 1,
    gap: 2,
  },
  companyName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  companyMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  joinBtn: {
    backgroundColor: '#A855F7',
    borderRadius: RADII.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
  summaryCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  summaryTitleCol: {
    flex: 1,
    minWidth: 170,
    gap: 3,
  },
  summaryName: {
    ...TYPOGRAPHY.titleLg,
    fontSize: 16,
  },
  summaryMeta: {
    ...TYPOGRAPHY.bodySm,
    color: COLORS.gold,
  },
  summaryMotto: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  leaveBtn: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.strength,
  },
  leaveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.strength,
  },
  squadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  squadCountText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.gold,
  },
  squadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  squadSlotCard: {
    width: '48%',
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
    gap: 2,
  },
  squadSlotLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A855F7',
    letterSpacing: 0.7,
  },
  squadMemberName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  squadMemberMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  squadEmptyText: {
    ...TYPOGRAPHY.bodySm,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  saveSquadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 10,
  },
  saveSquadBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  coopReadyStrip: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADII.sm,
    backgroundColor: SURFACES.layer2,
  },
  coopReadyStripText: {
    flex: 1,
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  rosterList: {
    gap: SPACING.sm,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  rosterInfoCol: {
    flex: 1,
    gap: 2,
  },
  rosterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rosterName: {
    ...TYPOGRAPHY.titleMd,
    fontSize: 13,
  },
  roleBadge: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#A855F7',
  },
  rosterMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  squadToggleBtn: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  squadToggleBtnActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderColor: '#A855F7',
  },
  squadToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  squadToggleTextActive: {
    color: '#D8B4FE',
  },
  footerCtaRow: {
    marginTop: SPACING.md,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingVertical: 11,
  },
  secondaryCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
