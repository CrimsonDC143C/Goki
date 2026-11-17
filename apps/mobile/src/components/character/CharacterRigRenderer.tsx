import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Ellipse, G, Path, Polygon } from 'react-native-svg';
import {
  adaptCustomizationForRaceChange,
  computeCharacterRigMetrics,
  createDefaultCustomizationConfig,
  deriveCustomizationFromLegacyAppearance,
  normalizeCustomizationConfig,
  type CharacterCustomizationConfig,
  type CharacterRace,
  type EquipmentLoadoutMap,
} from '@goki/game-engine';
import {
  AuraBackdropSvg,
  ForearmPartSvg,
  HeadPartSvg,
  KitsuneTailSvg,
  OniHornsLayerSvg,
  ShinPartSvg,
  ThighPartSvg,
  TorsoPartSvg,
  UpperArmPartSvg,
  resolveHairColor,
  resolveSkinPalette,
} from './BodyPartSvg';
import {
  AccessoryNeckSvg,
  AccessoryWristSvg,
  BootsArmorSvg,
  ChestArmorSvg,
  HeadArmorSvg,
  LegsArmorSvg,
  OffhandPartSvg,
  ShoulderPauldronSvg,
  WeaponPartSvg,
  resolveLoadoutVisualProfiles,
} from './EquipmentPartSvg';
import {
  RigAnimatedView,
  type RigAnimationState,
  useCharacterRigAnimation,
} from './rigAnimation';

export const RIG_STAGE_WIDTH = 200;
export const RIG_STAGE_HEIGHT = 270;

export interface CharacterRigRendererProps {
  race?: CharacterRace;
  customizationConfig?: CharacterCustomizationConfig | null;
  appearanceId?: string | null;
  equippedLoadout?: Partial<EquipmentLoadoutMap> | null;
  animationState?: RigAnimationState;
  actionTriggerKey?: number;
  mode?: 'full' | 'bust';
  width?: number;
  height?: number;
  flipHorizontal?: boolean;
  playbackRate?: number;
  hitFlash?: boolean;
  paused?: boolean;
  onAnimationComplete?: (completedState: RigAnimationState, actionKey?: number) => void;
  testID?: string;
}

const ZERO_PIVOT: ViewStyle = {
  position: 'absolute',
  width: 0,
  height: 0,
  overflow: 'visible',
};

const CharacterRigRendererComponent: React.FC<CharacterRigRendererProps> = ({
  race,
  customizationConfig,
  appearanceId,
  equippedLoadout,
  animationState = 'idle',
  actionTriggerKey = 0,
  mode = 'full',
  width,
  height,
  flipHorizontal = false,
  playbackRate = 1,
  hitFlash = false,
  paused = false,
  onAnimationComplete,
  testID,
}) => {
  const { effectiveRace, effectiveConfig } = useMemo(() => {
    if (customizationConfig) {
      const resolvedRace =
        race ??
        (appearanceId
          ? deriveCustomizationFromLegacyAppearance(appearanceId).race
          : 'HUMAN');
      return {
        effectiveRace: resolvedRace,
        effectiveConfig: normalizeCustomizationConfig(
          customizationConfig,
          resolvedRace,
          appearanceId
        ),
      };
    }

    if (appearanceId) {
      const legacy = deriveCustomizationFromLegacyAppearance(appearanceId);
      const resolvedRace = race ?? legacy.race;
      return {
        effectiveRace: resolvedRace,
        effectiveConfig:
          race && race !== legacy.race
            ? adaptCustomizationForRaceChange(legacy.config, race)
            : legacy.config,
      };
    }

    const fallbackRace: CharacterRace = race ?? 'HUMAN';
    return {
      effectiveRace: fallbackRace,
      effectiveConfig: createDefaultCustomizationConfig(fallbackRace),
    };
  }, [race, customizationConfig, appearanceId]);

  const metrics = useMemo(
    () => computeCharacterRigMetrics(effectiveRace, effectiveConfig),
    [effectiveRace, effectiveConfig]
  );

  const equipped = useMemo(
    () => resolveLoadoutVisualProfiles(equippedLoadout),
    [equippedLoadout]
  );

  const animation = useCharacterRigAnimation({
    state: animationState,
    actionTriggerKey,
    stanceAngles: metrics.stanceAngles,
    playbackRate,
    paused,
    onAnimationComplete,
  });

  const skinPalette = useMemo(
    () => resolveSkinPalette(effectiveConfig.identity.skinPalette),
    [effectiveConfig.identity.skinPalette]
  );
  const hairColor = useMemo(
    () => resolveHairColor(effectiveConfig.identity.hairColor),
    [effectiveConfig.identity.hairColor]
  );

  const isBust = mode === 'bust';
  const targetWidth = width ?? (isBust ? 96 : RIG_STAGE_WIDTH);
  const targetHeight = height ?? (isBust ? 96 : RIG_STAGE_HEIGHT);

  const stageTransformStyle = useMemo<ViewStyle>(() => {
    if (isBust) {
      const headPivotY = metrics.hipY - metrics.torso.height - metrics.head.neckLength;
      const hornOffset = metrics.horns.visible ? 4 + metrics.horns.tier * 3 : 0;
      const focusY = headPivotY - 8 - hornOffset * 0.45;
      const cropSpan = metrics.horns.visible ? 92 + metrics.horns.tier * 7 : 84;
      const bustScale = Math.min(targetWidth, targetHeight) / cropSpan;
      const panY = (RIG_STAGE_HEIGHT / 2 - focusY) * bustScale;
      return {
        transform: [
          { translateY: panY },
          { scale: bustScale },
          { scaleX: flipHorizontal ? -1 : 1 },
        ],
      };
    }

    const uniformScale = Math.min(
      targetWidth / RIG_STAGE_WIDTH,
      targetHeight / RIG_STAGE_HEIGHT
    );
    return {
      transform: [
        { scale: uniformScale },
        { scaleX: flipHorizontal ? -1 : 1 },
      ],
    };
  }, [isBust, metrics, targetWidth, targetHeight, flipHorizontal]);

  const hasChestArmor = equipped.chest !== null;
  const hasLegsArmor = equipped.legs !== null;
  const hasBootsArmor = equipped.boots !== null;
  const showOffhandGear =
    equipped.offHand !== null && equipped.mainHand?.handedness !== 'TWO_HANDED';
  const hideHairTop =
    equipped.head !== null && equipped.head.variant !== 'crown_circlet';

  // Anatomical joint coordinates relative to parent bones
  const shoulderY = -metrics.torso.height + 7;
  const backShoulderX = metrics.torso.shoulderSpan * 0.34;
  const frontShoulderX = -metrics.torso.shoulderSpan * 0.38;
  const headPivotY = -(metrics.torso.height + metrics.head.neckLength);
  const backHipX = metrics.thigh.hipSpread * 0.32;
  const frontHipX = -metrics.thigh.hipSpread * 0.32;
  const auraCenterY = metrics.hipY - metrics.torso.height * 0.56;

  return (
    <View
      testID={testID}
      style={[
        styles.viewport,
        {
          width: targetWidth,
          height: targetHeight,
        },
      ]}
    >
      <View style={[styles.stageBox, stageTransformStyle]}>
        {/* 1. Aura Backdrop (behind character) */}
        {metrics.aura.visible && (
          <View
            pointerEvents="none"
            style={[
              ZERO_PIVOT,
              {
                left: metrics.hipX,
                top: auraCenterY,
                zIndex: 1,
              },
            ]}
          >
            <RigAnimatedView style={[ZERO_PIVOT, animation.auraStyle]}>
              <AuraBackdropSvg metrics={metrics} />
            </RigAnimatedView>
          </View>
        )}

        {/* 2. Ground Contact Shadow Ellipse */}
        {!isBust && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: metrics.hipX - 42,
              top: metrics.groundY - 9,
              width: 84,
              height: 18,
              zIndex: 2,
            }}
          >
            <Svg width={84} height={18} viewBox="-42 -9 84 18">
              <Ellipse
                cx={0}
                cy={0}
                rx={34 * metrics.statureScale}
                ry={6.5}
                fill="#05070B"
                fillOpacity={animationState === 'death' ? 0.65 : 0.48}
              />
            </Svg>
          </View>
        )}

        {/* 3. Root Motion Pivot at Pelvis Anchor */}
        <RigAnimatedView
          style={[
            ZERO_PIVOT,
            {
              left: metrics.hipX,
              top: metrics.hipY,
              zIndex: 5,
            },
            animation.rootStyle,
          ]}
        >
          {/* Pelvis Pivot */}
          <RigAnimatedView style={[ZERO_PIVOT, animation.pelvisStyle]}>
            {/* 3A. Kitsune Fan Tails (behind pelvis & legs) */}
            {metrics.tails.count > 0 && (
              <View
                style={[
                  ZERO_PIVOT,
                  {
                    left: -7,
                    top: -5,
                    zIndex: 1,
                  },
                ]}
              >
                {metrics.tails.fanAnglesDeg.map((fanAngle, idx) => (
                  <View
                    key={idx}
                    style={[
                      ZERO_PIVOT,
                      {
                        transform: [{ rotate: `${-52 + fanAngle}deg` }],
                      },
                    ]}
                  >
                    <RigAnimatedView
                      style={[
                        ZERO_PIVOT,
                        idx % 2 === 0
                          ? animation.tailWaveStyle
                          : animation.tailCounterWaveStyle,
                      ]}
                    >
                      <KitsuneTailSvg
                        metrics={metrics}
                        skinPalette={skinPalette}
                        hairColor={hairColor}
                      />
                    </RigAnimatedView>
                  </View>
                ))}
              </View>
            )}

            {/* 3B. Back Leg Chain: backThigh -> backShin */}
            <RigAnimatedView
              style={[
                ZERO_PIVOT,
                { left: backHipX, top: 1, zIndex: 2 },
                animation.backThighStyle,
              ]}
            >
              <ThighPartSvg
                metrics={metrics}
                identity={effectiveConfig.identity}
                hasLegsArmor={hasLegsArmor}
                isFront={false}
              />
              {equipped.legs && (
                <LegsArmorSvg
                  profile={equipped.legs}
                  metrics={metrics}
                  isFront={false}
                />
              )}

              {/* Knee -> backShin */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: 0, top: metrics.thigh.length },
                  animation.backShinStyle,
                ]}
              >
                <ShinPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  hasBootsArmor={hasBootsArmor}
                  isFront={false}
                />
                {equipped.boots && (
                  <BootsArmorSvg
                    profile={equipped.boots}
                    metrics={metrics}
                    isFront={false}
                  />
                )}
              </RigAnimatedView>
            </RigAnimatedView>

            {/* 3C. Front Leg Chain: frontThigh -> frontShin */}
            <RigAnimatedView
              style={[
                ZERO_PIVOT,
                { left: frontHipX, top: 2, zIndex: 4 },
                animation.frontThighStyle,
              ]}
            >
              <ThighPartSvg
                metrics={metrics}
                identity={effectiveConfig.identity}
                hasLegsArmor={hasLegsArmor}
                isFront
              />
              {equipped.legs && (
                <LegsArmorSvg
                  profile={equipped.legs}
                  metrics={metrics}
                  isFront
                />
              )}

              {/* Knee -> frontShin */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: 0, top: metrics.thigh.length },
                  animation.frontShinStyle,
                ]}
              >
                <ShinPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  hasBootsArmor={hasBootsArmor}
                  isFront
                />
                {equipped.boots && (
                  <BootsArmorSvg
                    profile={equipped.boots}
                    metrics={metrics}
                    isFront
                  />
                )}
              </RigAnimatedView>
            </RigAnimatedView>

            {/* 3D. Torso Hierarchy (backUpperArm behind torso; torso + chest + neck pendant; head + horns; frontUpperArm in front) */}
            <RigAnimatedView
              style={[ZERO_PIVOT, { left: 0, top: 0, zIndex: 5 }, animation.torsoStyle]}
            >
              {/* Back Arm Chain (behind torso): backUpperArm -> backForearm -> offHand */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: backShoulderX, top: shoulderY + 1, zIndex: 1 },
                  animation.backUpperArmStyle,
                ]}
              >
                <UpperArmPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  morphs={effectiveConfig.morphs}
                  isFront={false}
                />
                {equipped.chest && (
                  <ShoulderPauldronSvg
                    profile={equipped.chest}
                    metrics={metrics}
                    isFront={false}
                  />
                )}

                {/* Elbow -> backForearm */}
                <RigAnimatedView
                  style={[
                    ZERO_PIVOT,
                    { left: 0, top: metrics.upperArm.length },
                    animation.backForearmStyle,
                  ]}
                >
                  <ForearmPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    isFront={false}
                  />
                  {showOffhandGear && equipped.offHand && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length },
                      ]}
                    >
                      <OffhandPartSvg
                        profile={equipped.offHand}
                        metrics={metrics}
                      />
                    </View>
                  )}
                </RigAnimatedView>
              </RigAnimatedView>

              {/* Torso Body + Chest Armor + Accessory 2 Neck Pendant */}
              <View style={[ZERO_PIVOT, { left: 0, top: 0, zIndex: 3 }]}>
                <TorsoPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  morphs={effectiveConfig.morphs}
                  hasChestArmor={hasChestArmor}
                  hasLegsArmor={hasLegsArmor}
                />
                {equipped.chest && (
                  <ChestArmorSvg profile={equipped.chest} metrics={metrics} />
                )}
                {equipped.accessory2 && (
                  <View
                    style={[
                      ZERO_PIVOT,
                      { left: 0, top: -metrics.torso.height * 0.78 },
                    ]}
                  >
                    <AccessoryNeckSvg
                      profile={equipped.accessory2}
                      metrics={metrics}
                    />
                  </View>
                )}
              </View>

              {/* Head Bone: Head + Hair + Head Armor + Oni Horns */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: 0, top: headPivotY, zIndex: 4 },
                  animation.headStyle,
                ]}
              >
                <HeadPartSvg
                  race={effectiveRace}
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  morphs={effectiveConfig.morphs}
                  hideHairTop={hideHairTop}
                  showHorns={false}
                />
                {equipped.head && (
                  <HeadArmorSvg profile={equipped.head} metrics={metrics} />
                )}
                {metrics.horns.visible && <OniHornsLayerSvg metrics={metrics} />}
              </RigAnimatedView>

              {/* Front Arm Chain (in front of torso & thighs): frontUpperArm -> frontForearm -> accessory1 + mainHand */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: frontShoulderX, top: shoulderY, zIndex: 8 },
                  animation.frontUpperArmStyle,
                ]}
              >
                <UpperArmPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  morphs={effectiveConfig.morphs}
                  isFront
                />
                {equipped.chest && (
                  <ShoulderPauldronSvg
                    profile={equipped.chest}
                    metrics={metrics}
                    isFront
                  />
                )}

                {/* Elbow -> frontForearm */}
                <RigAnimatedView
                  style={[
                    ZERO_PIVOT,
                    { left: 0, top: metrics.upperArm.length },
                    animation.frontForearmStyle,
                  ]}
                >
                  <ForearmPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    isFront
                  />
                  {equipped.accessory1 && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length * 0.72 },
                      ]}
                    >
                      <AccessoryWristSvg
                        profile={equipped.accessory1}
                        metrics={metrics}
                      />
                    </View>
                  )}
                  {equipped.mainHand && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length },
                      ]}
                    >
                      <WeaponPartSvg
                        profile={equipped.mainHand}
                        metrics={metrics}
                      />
                    </View>
                  )}
                </RigAnimatedView>
              </RigAnimatedView>
            </RigAnimatedView>
          </RigAnimatedView>
        </RigAnimatedView>

        {/* 4. Guard Ward / Shield Shimmer Overlay */}
        {animationState === 'guard' && (
          <RigAnimatedView
            pointerEvents="none"
            style={[
              ZERO_PIVOT,
              {
                left: metrics.hipX + 26,
                top: metrics.hipY - metrics.torso.height * 0.55,
                zIndex: 25,
              },
              animation.guardShieldStyle,
            ]}
          >
            <Svg
              width={64}
              height={116}
              viewBox="-32 -58 64 116"
              style={{ position: 'absolute', left: -32, top: -58 }}
            >
              <G>
                <Path
                  d="M -6 -52 Q 28 -26 24 0 Q 28 26 -6 52 Q 10 20 8 0 Q 10 -20 -6 -52 Z"
                  fill="#38BDF8"
                  fillOpacity={0.28}
                  stroke="#BAE6FD"
                  strokeWidth={1.6}
                />
                <Polygon
                  points="8,-26 22,-10 22,10 8,26 -2,12 -2,-12"
                  fill="#7DD3FC"
                  fillOpacity={0.18}
                  stroke="#E0F2FE"
                  strokeWidth={1.1}
                />
              </G>
            </Svg>
          </RigAnimatedView>
        )}

        {/* 5. Hit Flash Overlay */}
        {hitFlash && (
          <View
            pointerEvents="none"
            style={[
              ZERO_PIVOT,
              {
                left: metrics.hipX,
                top: metrics.hipY - metrics.torso.height * 0.65,
                zIndex: 30,
              },
            ]}
          >
            <Svg
              width={110}
              height={170}
              viewBox="-55 -85 110 170"
              style={{ position: 'absolute', left: -55, top: -85 }}
            >
              <Ellipse
                cx={0}
                cy={0}
                rx={42}
                ry={74}
                fill="#FF3B30"
                fillOpacity={0.34}
                stroke="#FFFFFF"
                strokeWidth={1.8}
                strokeOpacity={0.55}
              />
            </Svg>
          </View>
        )}
      </View>
    </View>
  );
};

export const CharacterRigRenderer = React.memo(CharacterRigRendererComponent);

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stageBox: {
    width: RIG_STAGE_WIDTH,
    height: RIG_STAGE_HEIGHT,
    position: 'relative',
    overflow: 'visible',
  },
});
