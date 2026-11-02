import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useGame } from '../state/GameContext';
import { COLORS, CRIMSON_ONI } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { register, login, isAuthenticated, currentUser, logout } = useGame();

  const [mode, setMode] = useState<'REGISTER' | 'LOGIN'>('REGISTER');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState<'STANDARD' | 'IRONMAN_VERIFIED'>('STANDARD');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'REGISTER') {
        const uName = username.trim() || email.split('@')[0] || 'Adventurer';
        const res = await register({
          email: email.trim(),
          username: uName,
          password: password.trim(),
          characterName: characterName.trim() || uName,
          gameMode: selectedGameMode,
        });

        if (!res.ok) {
          setErrorMessage(res.error ?? 'Registration failed. Try again.');
          setLoading(false);
          return;
        }
      } else {
        const res = await login({
          email: email.trim(),
          password: password.trim(),
        });

        if (!res.ok) {
          setErrorMessage(res.error ?? 'Invalid email or password.');
          setLoading(false);
          return;
        }
      }

      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      setLoading(false);
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error.');
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialogCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.titleText}>
              {mode === 'REGISTER' ? '⚔️ Register Adventurer' : '🔐 Sign In to Realm'}
            </Text>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close"
              testID="auth-close-btn"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {isAuthenticated ? (
            <View style={styles.alreadyAuthedBox}>
              <Text style={styles.alreadyAuthedText}>
                Signed in as <Text style={{ color: COLORS.gold }}>{currentUser?.username}</Text> ({currentUser?.email})
              </Text>
              <Pressable
                style={styles.logoutBtn}
                onPress={() => {
                  logout();
                  setErrorMessage(null);
                }}
                testID="auth-logout-btn"
              >
                <Text style={styles.logoutBtnText}>Sign Out</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Tab Selector */}
              <View style={styles.tabsRow}>
                <Pressable
                  style={[styles.tabBtn, mode === 'REGISTER' && styles.tabBtnActive]}
                  onPress={() => {
                    setMode('REGISTER');
                    setErrorMessage(null);
                  }}
                  testID="auth-tab-register"
                >
                  <Text
                    style={[
                      styles.tabBtnText,
                      mode === 'REGISTER' && styles.tabBtnTextActive,
                    ]}
                  >
                    Register
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.tabBtn, mode === 'LOGIN' && styles.tabBtnActive]}
                  onPress={() => {
                    setMode('LOGIN');
                    setErrorMessage(null);
                  }}
                  testID="auth-tab-login"
                >
                  <Text
                    style={[
                      styles.tabBtnText,
                      mode === 'LOGIN' && styles.tabBtnTextActive,
                    ]}
                  >
                    Sign In
                  </Text>
                </Pressable>
              </View>

              {errorMessage && (
                <View style={styles.errorBox} testID="auth-error-message">
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Form Fields */}
              {mode === 'REGISTER' && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Username</Text>
                  <TextInput
                    style={styles.textInput}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="none"
                    testID="auth-username-input"
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter email address"
                  placeholderTextColor="#6B7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="auth-email-input"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter secure password"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  testID="auth-password-input"
                />
              </View>

              {mode === 'REGISTER' && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Starting Realm & Game Mode</Text>
                    <View style={styles.modeSelectorRow}>
                      <Pressable
                        style={[
                          styles.modeBtn,
                          selectedGameMode === 'STANDARD' && styles.modeBtnActiveStandard,
                        ]}
                        onPress={() => setSelectedGameMode('STANDARD')}
                        testID="auth-mode-standard-btn"
                      >
                        <Text
                          style={[
                            styles.modeBtnTitle,
                            selectedGameMode === 'STANDARD' && styles.modeBtnTitleActiveStandard,
                          ]}
                        >
                          ⚔️ Standard
                        </Text>
                        <Text style={styles.modeBtnDesc}>100% Honesty System</Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.modeBtn,
                          selectedGameMode === 'IRONMAN_VERIFIED' && styles.modeBtnActiveIronman,
                        ]}
                        onPress={() => setSelectedGameMode('IRONMAN_VERIFIED')}
                        testID="auth-mode-ironman-btn"
                      >
                        <Text
                          style={[
                            styles.modeBtnTitle,
                            selectedGameMode === 'IRONMAN_VERIFIED' && styles.modeBtnTitleActiveIronman,
                          ]}
                        >
                          🛡️ Ironman
                        </Text>
                        <Text style={styles.modeBtnDesc}>Wearable Telemetry</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.modeNoteText}>
                      * Up to 2 heroes allowed per account (1 Standard, 1 Ironman). You can forge your second hero anytime.
                    </Text>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Hero / Character Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={characterName}
                      onChangeText={setCharacterName}
                      placeholder="Character display name (optional)"
                      placeholderTextColor="#6B7280"
                      testID="auth-char-input"
                    />
                  </View>
                </>
              )}

              {/* Submit CTA */}
              <Pressable
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                testID="auth-submit-btn"
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.bgDeep} />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {mode === 'REGISTER' ? 'Register Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 12, 18, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabBtnTextActive: {
    color: COLORS.gold,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  modeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  modeBtnActiveStandard: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 184, 65, 0.12)',
  },
  modeBtnActiveIronman: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  modeBtnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  modeBtnTitleActiveStandard: {
    color: COLORS.gold,
  },
  modeBtnTitleActiveIronman: {
    color: '#60A5FA',
  },
  modeBtnDesc: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  modeNoteText: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: COLORS.bgDeep,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alreadyAuthedBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  alreadyAuthedText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 14,
  },
  logoutBtn: {
    backgroundColor: '#37181F',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logoutBtnText: {
    color: '#FCA5A5',
    fontWeight: '800',
    fontSize: 12,
  },
});
