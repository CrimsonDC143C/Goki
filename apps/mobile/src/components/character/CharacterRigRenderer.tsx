import React, { useMemo } from 'react';
import { type ImageSourcePropType, StyleSheet, View, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
  getEquipmentRigOverlaySource,
  getMorphEvolutionOverlay,
  getRigBodyPartIllustration,
  type MorphEvolutionOverlaySlotKey,
} from '../../assets/rpgArtRegistry';
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

function renderDropInOverlay(
  source: ImageSourcePropType | null,
  width: number,
  height: number,
  offsetX = -width / 2,
  offsetY = 0
): React.ReactElement | null {
  if (!source) return null;
  return (
    <ExpoImage
      source={source as any}
      style={{
        position: 'absolute',
        left: offsetX,
        top: offsetY,
        width,
        height,
      }}
      contentFit="contain"
    />
  );
}

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

  // Milestone 6 drop-in raster overrides (all null by default until final art is added)
  const auraOverlayKey = metrics.aura.visible
    ? (`energy_aura_t${Math.min(3, Math.max(1, metrics.aura.tier))}` as MorphEvolutionOverlaySlotKey)
    : null;
  const hornsOverlayKey = metrics.horns.visible
    ? (`oni_horns_t${Math.min(3, Math.max(1, metrics.horns.tier))}` as MorphEvolutionOverlaySlotKey)
    : null;
  const tailsOverlayKey =
    metrics.tails.count > 0
      ? (`kitsune_tails_${Math.min(9, Math.max(1, metrics.tails.count))}` as MorphEvolutionOverlaySlotKey)
      : null;

  const auraArt = auraOverlayKey ? getMorphEvolutionOverlay(auraOverlayKey) : null;
  const hornsArt = hornsOverlayKey ? getMorphEvolutionOverlay(hornsOverlayKey) : null;
  const tailsArt = tailsOverlayKey ? getMorphEvolutionOverlay(tailsOverlayKey) : null;
  const headArt = getRigBodyPartIllustration(effectiveRace, 'head');
  const torsoArt = getRigBodyPartIllustration(effectiveRace, 'torso');
  const upperArmArt = getRigBodyPartIllustration(effectiveRace, 'upperArm');
  const forearmArt = getRigBodyPartIllustration(effectiveRace, 'forearm');
  const thighArt = getRigBodyPartIllustration(effectiveRace, 'thigh');
  const shinArt = getRigBodyPartIllustration(effectiveRace, 'shin');
  const headGearArt = equipped.head ? getEquipmentRigOverlaySource(equipped.head.variant) : null;
  const chestGearArt = equipped.chest ? getEquipmentRigOverlaySource(equipped.chest.variant) : null;
  const legsGearArt = equipped.legs ? getEquipmentRigOverlaySource(equipped.legs.variant) : null;
  const bootsGearArt = equipped.boots ? getEquipmentRigOverlaySource(equipped.boots.variant) : null;
  const mainHandGearArt = equipped.mainHand
    ? getEquipmentRigOverlaySource(equipped.mainHand.variant)
    : null;
  const offHandGearArt =
    showOffhandGear && equipped.offHand
      ? getEquipmentRigOverlaySource(equipped.offHand.variant)
      : null;
  const acc1GearArt = equipped.accessory1
    ? getEquipmentRigOverlaySource(equipped.accessory1.variant)
    : null;
  const acc2GearArt = equipped.accessory2
    ? getEquipmentRigOverlaySource(equipped.accessory2.variant)
    : null;

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
              {renderDropInOverlay(auraArt, 180, 220, -90, -110) ?? (
                <AuraBackdropSvg metrics={metrics} />
              )}
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
              tailsArt ? (
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
                  <RigAnimatedView style={[ZERO_PIVOT, animation.tailWaveStyle]}>
                    {renderDropInOverlay(tailsArt, 130, 110, -110, -75)}
                  </RigAnimatedView>
                </View>
              ) : (
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
              )
            )}

            {/* 3B. Back Leg Chain: backThigh -> backShin */}
            <RigAnimatedView
              style={[
                ZERO_PIVOT,
                { left: backHipX, top: 1, zIndex: 2 },
                animation.backThighStyle,
              ]}
            >
              {renderDropInOverlay(thighArt, metrics.thigh.width * 1.4, metrics.thigh.length + 6, -(metrics.thigh.width * 0.7), -2) ?? (
                <ThighPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  hasLegsArmor={hasLegsArmor}
                  isFront={false}
                />
              )}
              {equipped.legs &&
                (renderDropInOverlay(legsGearArt, metrics.thigh.width * 1.6, metrics.thigh.length + 8, -(metrics.thigh.width * 0.8), -3) ?? (
                  <LegsArmorSvg
                    profile={equipped.legs}
                    metrics={metrics}
                    isFront={false}
                  />
                ))}

              {/* Knee -> backShin */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: 0, top: metrics.thigh.length },
                  animation.backShinStyle,
                ]}
              >
                {renderDropInOverlay(shinArt, metrics.shin.width * 1.4, metrics.shin.length + 8, -(metrics.shin.width * 0.7), -2) ?? (
                  <ShinPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    hasBootsArmor={hasBootsArmor}
                    isFront={false}
                  />
                )}
                {equipped.boots &&
                  (renderDropInOverlay(bootsGearArt, metrics.shin.width * 1.8, metrics.shin.length + 10, -(metrics.shin.width * 0.9), -2) ?? (
                    <BootsArmorSvg
                      profile={equipped.boots}
                      metrics={metrics}
                      isFront={false}
                    />
                  ))}
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
              {renderDropInOverlay(thighArt, metrics.thigh.width * 1.4, metrics.thigh.length + 6, -(metrics.thigh.width * 0.7), -2) ?? (
                <ThighPartSvg
                  metrics={metrics}
                  identity={effectiveConfig.identity}
                  hasLegsArmor={hasLegsArmor}
                  isFront
                />
              )}
              {equipped.legs &&
                (renderDropInOverlay(legsGearArt, metrics.thigh.width * 1.6, metrics.thigh.length + 8, -(metrics.thigh.width * 0.8), -3) ?? (
                  <LegsArmorSvg
                    profile={equipped.legs}
                    metrics={metrics}
                    isFront
                  />
                ))}

              {/* Knee -> frontShin */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: 0, top: metrics.thigh.length },
                  animation.frontShinStyle,
                ]}
              >
                {renderDropInOverlay(shinArt, metrics.shin.width * 1.4, metrics.shin.length + 8, -(metrics.shin.width * 0.7), -2) ?? (
                  <ShinPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    hasBootsArmor={hasBootsArmor}
                    isFront
                  />
                )}
                {equipped.boots &&
                  (renderDropInOverlay(bootsGearArt, metrics.shin.width * 1.8, metrics.shin.length + 10, -(metrics.shin.width * 0.9), -2) ?? (
                    <BootsArmorSvg
                      profile={equipped.boots}
                      metrics={metrics}
                      isFront
                    />
                  ))}
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
                {renderDropInOverlay(upperArmArt, metrics.upperArm.width * 1.5, metrics.upperArm.length + 6, -(metrics.upperArm.width * 0.75), -3) ?? (
                  <UpperArmPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    isFront={false}
                  />
                )}
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
                  {renderDropInOverlay(forearmArt, metrics.forearm.width * 1.5, metrics.forearm.length + 6, -(metrics.forearm.width * 0.75), -3) ?? (
                    <ForearmPartSvg
                      metrics={metrics}
                      identity={effectiveConfig.identity}
                      morphs={effectiveConfig.morphs}
                      isFront={false}
                    />
                  )}
                  {showOffhandGear && equipped.offHand && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length },
                      ]}
                    >
                      {renderDropInOverlay(offHandGearArt, 54, 54, -27, -27) ?? (
                        <OffhandPartSvg
                          profile={equipped.offHand}
                          metrics={metrics}
                        />
                      )}
                    </View>
                  )}
                </RigAnimatedView>
              </RigAnimatedView>

              {/* Torso Body + Chest Armor + Accessory 2 Neck Pendant */}
              <View style={[ZERO_PIVOT, { left: 0, top: 0, zIndex: 3 }]}>
                {renderDropInOverlay(torsoArt, metrics.torso.shoulderSpan * 1.35, metrics.torso.height + 10, -(metrics.torso.shoulderSpan * 0.675), -metrics.torso.height - 4) ?? (
                  <TorsoPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    hasChestArmor={hasChestArmor}
                    hasLegsArmor={hasLegsArmor}
                  />
                )}
                {equipped.chest &&
                  (renderDropInOverlay(chestGearArt, metrics.torso.shoulderSpan * 1.5, metrics.torso.height + 12, -(metrics.torso.shoulderSpan * 0.75), -metrics.torso.height - 5) ?? (
                    <ChestArmorSvg profile={equipped.chest} metrics={metrics} />
                  ))}
                {equipped.accessory2 && (
                  <View
                    style={[
                      ZERO_PIVOT,
                      { left: 0, top: -metrics.torso.height * 0.78 },
                    ]}
                  >
                    {renderDropInOverlay(acc2GearArt, 26, 26, -13, -6) ?? (
                      <AccessoryNeckSvg
                        profile={equipped.accessory2}
                        metrics={metrics}
                      />
                    )}
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
                {renderDropInOverlay(headArt, metrics.head.width * 1.35, metrics.head.height * 1.25, -(metrics.head.width * 0.675), -(metrics.head.height * 1.05)) ?? (
                  <HeadPartSvg
                    race={effectiveRace}
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    hideHairTop={hideHairTop}
                    showHorns={false}
                  />
                )}
                {equipped.head &&
                  (renderDropInOverlay(headGearArt, metrics.head.width * 1.5, metrics.head.height * 1.4, -(metrics.head.width * 0.75), -(metrics.head.height * 1.15)) ?? (
                    <HeadArmorSvg profile={equipped.head} metrics={metrics} />
                  ))}
                {metrics.horns.visible &&
                  (renderDropInOverlay(hornsArt, metrics.head.width * 1.7, metrics.head.height * 1.1, -(metrics.head.width * 0.85), -(metrics.head.height * 1.45)) ?? (
                    <OniHornsLayerSvg metrics={metrics} />
                  ))}
              </RigAnimatedView>

              {/* Front Arm Chain (in front of torso & thighs): frontUpperArm -> frontForearm -> accessory1 + mainHand */}
              <RigAnimatedView
                style={[
                  ZERO_PIVOT,
                  { left: frontShoulderX, top: shoulderY, zIndex: 8 },
                  animation.frontUpperArmStyle,
                ]}
              >
                {renderDropInOverlay(upperArmArt, metrics.upperArm.width * 1.5, metrics.upperArm.length + 6, -(metrics.upperArm.width * 0.75), -3) ?? (
                  <UpperArmPartSvg
                    metrics={metrics}
                    identity={effectiveConfig.identity}
                    morphs={effectiveConfig.morphs}
                    isFront
                  />
                )}
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
                  {renderDropInOverlay(forearmArt, metrics.forearm.width * 1.5, metrics.forearm.length + 6, -(metrics.forearm.width * 0.75), -3) ?? (
                    <ForearmPartSvg
                      metrics={metrics}
                      identity={effectiveConfig.identity}
                      morphs={effectiveConfig.morphs}
                      isFront
                    />
                  )}
                  {equipped.accessory1 && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length * 0.72 },
                      ]}
                    >
                      {renderDropInOverlay(acc1GearArt, 20, 20, -10, -10) ?? (
                        <AccessoryWristSvg
                          profile={equipped.accessory1}
                          metrics={metrics}
                        />
                      )}
                    </View>
                  )}
                  {equipped.mainHand && (
                    <View
                      style={[
                        ZERO_PIVOT,
                        { left: 0, top: metrics.forearm.length },
                      ]}
                    >
                      {renderDropInOverlay(mainHandGearArt, 68, 96, -34, -72) ?? (
                        <WeaponPartSvg
                          profile={equipped.mainHand}
                          metrics={metrics}
                        />
                      )}
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
