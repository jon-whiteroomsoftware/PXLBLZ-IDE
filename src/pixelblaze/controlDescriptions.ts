import type { PatternMetadata } from '@/engine/loadPattern'

type Controls = PatternMetadata['controls']

// Curated, end-user-facing descriptions for demo controls (issue #190).
//
// Keyed by demo name -> control exportName -> one short sentence. Authored once
// from each demo's own comments + code, reworded for a user twisting the knob
// (the in-code comments are a mix of user help and dev rationale, so they're a
// guide only). This table is the single source for the help hover (#189) and is
// kept in sync with the demos by controlDescriptions.test.ts, which fails the
// build if a demo gains/renames/removes a control without a matching entry.
//
// Not parsed from the demo source at runtime: the expensive judgement happens
// here, once. User/imported patterns have no entry and fall back to the
// humanized control label.
export const CONTROL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  AuroraSphere: {
    sliderRingCount: 'Number of glowing latitude rings wrapped around the sphere.',
    sliderSpin: 'How fast the bright great-ring orbits — centred is still, higher spins faster.',
    sliderSpeed: 'How often the rings ratchet up a level — the tick rate of the bloom.',
  },
  Caustics: {
    sliderSpeed: 'How fast the water moves.',
    sliderDensity: 'Size of the light pools — higher packs in more, smaller cells.',
    sliderSharpness: 'Focus of the light: soft glowing pools at low, crisp bright veins at high.',
    sliderTint: 'Base water colour, swept around the colour wheel.',
  },
  CometLoom: {
    sliderSpeed: 'How fast comet heads move around the strip.',
    sliderComets: 'Number of active comet trails.',
    sliderTail: 'Length of each comet tail.',
    sliderPalette: 'Base colour of the comet palette.',
  },
  CompassRose: {
    sliderSpeed: 'How fast the rose rotates.',
    sliderPoints: 'Number of angular points in the rose.',
    sliderSweep: 'Strength of the scanning beam.',
    sliderHue: 'Base colour of the instrument glow.',
  },
  CorePulse3D: {
    sliderSpeed: 'How fast the energy shells expand from the core.',
    sliderShellCount: 'How many concentric pulse shells fill the volume.',
    sliderCoreSize: 'Size of the central glowing core.',
    sliderHue: 'Base colour of the pulse.',
  },
  CrystalLattice3D: {
    sliderSpeed: 'How quickly the crystal nodes pulse.',
    sliderSpacing: 'Density of the repeated lattice cells.',
    sliderNodeSize: 'Size of the glowing lattice nodes and rods.',
    sliderHue: 'Base colour of the crystal.',
  },
  CrystalRain3D: {
    sliderSpeed: 'How fast crystal droplets fall through the volume.',
    sliderDensity: 'Density of repeated rain columns.',
    sliderLength: 'Length of each falling crystal streak.',
    sliderHue: 'Base colour of the crystal rain.',
  },
  ClockworkIris: {
    sliderSpeed: 'How fast the escapement beats.',
    sliderAperture: 'Opens and closes the bladed shutter across the ring stack.',
    sliderTeeth: 'Gearing density — more blades, finer dashes, busier works.',
    sliderColor: 'Sweeps the brass-and-steel palette around the colour wheel.',
  },
  EmberSpire: {
    sliderIntensity: 'How much fuel feeds the base — from a bed of embers to a roaring column.',
    sliderCooling: 'How quickly rising heat dies out — higher makes shorter, sharper flames.',
    sliderSurge: 'Depth of the slow bellows that swells and starves the fire.',
    sliderColor: 'Fire chemistry — shifts the flames from classic orange through emerald and ghost-blue.',
  },
  EventHorizon: {
    sliderSpeed: 'Orbital rate of the accretion disk.',
    sliderFeed: 'How hard the hole is feeding — arc density, turbulence, and jet response.',
    sliderJets: 'Strength of the twin polar jets.',
    sliderColor: 'Re-temperatures the disk from ember-orange through x-ray blue.',
  },
  FireflyChoir: {
    sliderCoupling:
      'How strongly the fireflies pull each other into sync — low stays in chaos, high snaps to a unified pulse.',
    sliderTempo: 'Base flashing rate of the fireflies.',
    sliderSpread: "Variety in each firefly's natural rhythm — keeps the sync alive instead of freezing.",
    sliderColor: 'Base colour of the fireflies.',
    sliderVariance: 'Per-firefly colour jitter — low makes them identical, high scatters their tints.',
  },
  GlyphRain: {
    sliderSpeed: 'How fast the code streams fall.',
    sliderDensity: 'Number of rain columns — a few fat streams up to a fine drizzle.',
    sliderTail: 'Length of the fading glyph trail behind each falling head.',
    sliderColor: 'Phosphor colour — classic green through amber and violet.',
  },
  Harmonograph: {
    sliderSpeed: 'How fast the pen travels along its curve.',
    sliderComplexity: 'Richness of the frequency ratios picked for each new figure.',
    sliderInk: 'Length and weight of the ink trail behind the pen.',
    sliderColor: 'Base ink colour; the trail shades slightly from fresh to settled.',
  },
  GyroidGlow3D: {
    sliderSpeed: 'How fast the gyroid field drifts through the volume.',
    sliderScale: 'Density of the repeating gyroid cells.',
    sliderThickness: 'Thickness of the glowing gyroid surface.',
    sliderColor: 'Base colour of the gyroid.',
  },
  HelixForge3D: {
    sliderSpeed: 'How fast the braided coils rotate.',
    sliderTwist: 'How many turns the coils make through the volume.',
    sliderRadius: 'Radius and thickness of the braid.',
    sliderHue: 'Base colour of the forged glow.',
  },
  HeatShimmerTiles: {
    sliderSpeed: 'How fast the heat shimmer moves.',
    sliderTileSize: 'Density of the repeated heat tiles.',
    sliderShimmer: 'How strongly the tile coordinates bend.',
    sliderPalette: 'Base heat colour.',
  },
  IQPalettes: {
    sliderSpeed: 'How fast the palette parameter scrolls across the bands.',
  },
  ImpactEngine: {
    sliderSpeed: 'How quickly each collision cycle plays out.',
    sliderEnergy: 'Force of the impact — widens the trails, the flash, and how far debris flies.',
    sliderColor: 'Colour of one body; the other always approaches in its complement.',
    sliderEchoes: 'Strength of the aftershock rings that chase the main shockwave.',
  },
  IridescentFibers: {
    sliderSpeed: 'How fast the layered fibers drift.',
    sliderZoom: 'Framing of the fiber field, remapped to the useful ShaderToy-like range.',
    sliderThickness: 'Thickness and softness of each luminous fiber.',
    sliderBrightness: 'Overall output brightness.',
  },
  KaleidoBloom: {
    sliderSpeed: 'How fast the lattice spins and breathes.',
    sliderZoom: 'Size of the lattice cells.',
    sliderBreathe: 'How much the zoom pulses in and out.',
    sliderColorSpread: 'Width of the radial rainbow spreading from the centre.',
  },
  LatticeWarp3D: {
    sliderSpeed: 'How fast the cubic lattice warps.',
    sliderSpacing: 'Density of lattice cells.',
    sliderWarp: 'Strength of the phase-wave bend.',
    sliderColor: 'Base colour of the lattice.',
  },
  KineticSculpture: {
    sliderSpeed: 'How fast the forms travel their orbits.',
    sliderBlend: 'How much the forms melt together as they pass — crisp clockwork to liquid mercury.',
    sliderColor: 'Re-tints the whole sculpture.',
    sliderShell: 'Thickness and glow of the lit surface shell.',
  },
  LavaLamp3D: {
    sliderSpeed: 'Pace of the thermal loop — how quickly blobs heat, rise, cool, and sink.',
    sliderGoo: 'Blob size and stickiness — high melts everything into one slumping mass.',
    sliderColor: 'Wax colour, swept around the colour wheel.',
    sliderGlow: 'Strength of the lamp light at the base and the rim light on the goo.',
  },
  Kishimisu: {
    rgbPickerPaletteA: 'Palette base colour — the midpoint the gradient cycles around.',
    rgbPickerPaletteB: 'Palette contrast — how far the colours swing from the base.',
    rgbPickerPaletteD: 'Palette phase — shifts where each colour lands in the cycle.',
    sliderZoom: 'Scale of the folded kaleidoscope pattern.',
    sliderRingDensity: 'How many sine rings pack into each fold.',
    sliderGlow: 'Brightness and bloom of the bright veins.',
    sliderSharpness: 'How tight and crisp the rings are.',
    sliderOctaves: 'How many layers of folded detail are stacked.',
  },
  MagneticFilaments: {
    sliderSpeed: 'How quickly the invisible magnets drift.',
    sliderSpacing: 'Density of the magnetic field-line contours.',
    sliderGlow: 'Brightness of the glowing filaments.',
    sliderContrast: 'Sharpness of the field lines.',
  },
  MandelbulbHeartbeat: {
    sliderSpeed: 'How fast the fractal rotates and its heartbeat pulses.',
    sliderPower: 'Fractal power — continuously reshapes the lobes into spikes and petals.',
    sliderColor: 'Base colour of the fractal palette.',
    sliderDetail: 'Extra fractal iterations — finer branching at the cost of frame rate.',
  },
  MetaballGarden: {
    sliderSpeed: 'How quickly the soft cells drift.',
    sliderBlobCount: 'How many cells are active in the garden.',
    sliderSoftness: 'How smoothly neighbouring cells merge together.',
    sliderPalette: 'Base colour of the luminous cells.',
  },
  MetroLines: {
    sliderSpeed: 'How fast route pulses move around the line.',
    sliderRoutes: 'Number of active virtual routes.',
    sliderStationGlow: 'Brightness of station markers.',
    sliderPalette: 'Base colour of the metro routes.',
  },
  MoireCathedral: {
    sliderSpeed: 'How fast the stained-glass stripe fields rotate.',
    sliderDensity: 'Density of the crossing moire stripes.',
    sliderBloom: 'Brightness of the glowing glass.',
    sliderArch: 'Strength and softness of the arched window frame.',
  },
  Murmuration: {
    sliderSpeed: 'How fast the flock moves through the frame.',
    sliderTightness: 'Flocking strength — a loose drifting haze up to one tight nervous knot.',
    sliderBirds: 'Number of birds in the flock.',
    sliderColor: 'Base colour of the birds and their wakes.',
  },
  NebulaShells3D: {
    sliderSpeed: 'How quickly the spherical shells drift.',
    sliderShellCount: 'Number of nested aurora shells.',
    sliderThickness: 'Thickness of each glowing shell.',
    sliderColor: 'Base colour of the nebula.',
  },
  NeonSquircles: {
    sliderSpeed: 'How fast the nested squircles spin and pulse.',
  },
  NeonCircuitBoard: {
    sliderSpeed: 'How fast packets move along the traces.',
    sliderDensity: 'Density of the repeated circuit cells.',
    sliderPulse: 'Brightness of packet glints travelling through the board.',
    sliderHue: 'Base colour of the neon traces.',
  },
  NebulaSphere: {
    sliderSpeed: 'How fast the gas drifts through the volume.',
    sliderZoom: 'Detail scale — higher is finer and busier.',
    sliderWarp: 'How violently the gas folds in on itself.',
    sliderTwinkle: 'Density of stars in the dark voids.',
  },
  RibbonLoom: {
    sliderSpeed: 'How fast the ribbons weave.',
    sliderWidth: 'Width of each glowing ribbon.',
    sliderCount: 'How many ribbon families are active.',
    sliderPalette: 'Base hue of the woven palette.',
  },
  Orrery3D: {
    sliderSpeed: 'How fast the clockwork turns — inner planets always orbit quickest.',
    sliderZoom: 'Scale of the whole system inside the volume.',
    sliderRings: 'Brightness of the brass orbit rings.',
    sliderColor: 'Re-tints the sun, planets, and rings together.',
  },
  PendulumWave: {
    sliderSpeed: 'Length of the grand cycle from unison to chaos and back.',
    sliderSpread: 'How many extra swings the far end makes — the shear rate of the wave.',
    sliderGlint: 'Strength of the white flare when the pendulums snap back into sync.',
    sliderColor: 'Base colour; swing direction tints slightly around it.',
  },
  PhantomStar: {
    sliderSpeed: 'Animation rate of the fractal.',
    sliderQuality: 'Detail of the raymarch — higher looks sharper but costs more.',
    sliderDepth: 'How many times the fractal folds in on itself.',
    sliderGain: 'Overall glow brightness.',
  },
  PlasmaNebula: {
    sliderSpeed: 'How fast the gas drifts.',
    sliderZoom: 'Detail scale — higher is finer and busier.',
    sliderWarp: 'How violently the gas folds in on itself.',
    sliderTwinkle: 'Density of stars in the dark voids.',
    sliderHue: 'Shifts the nebula palette around the colour wheel.',
  },
  PulseLoom: {
    sliderTempo: 'Speed of the groove, in bars per second.',
    sliderSwing: 'Swing feel — straight at low, a heavy lilt at high.',
    sliderWidth: "Width of each drum strike's glow.",
    sliderPalette: 'Spins the four-colour complementary palette around the wheel.',
    toggleAccent: 'Flash the whole strip on the downbeat when every voice lands together.',
  },
  RivalryRing: {
    sliderSpeed: 'How fast the battlefronts advance.',
    sliderSpecies: 'Number of rival factions — three up to five.',
    sliderAggression: 'From calm shifting borders up to constant upheaval.',
    sliderColor: 'Rotates the whole faction palette around the colour wheel.',
  },
  SceneSplice: {
    sliderSpeed: 'How quickly the showreel advances from cut to cut.',
    sliderScrub: 'Drags the whole reel by hand through every scene and transition.',
    sliderColor: 'Re-tints all five scenes and their transition accents together.',
    sliderFeather: 'Width of the soft band where one scene blends into the next.',
  },
  SceneSplice3D: {
    sliderSpeed: 'How quickly the volume cycles between its two cuts.',
    sliderScrub: 'Drags the slicing plane and gyroid growth back and forth by hand.',
    sliderColor: 'Re-tints both scenes and the cutting-edge glow together.',
    sliderFeather: 'Thickness of the glowing frontier where the scenes blend.',
  },
  ShaderShowcase: {
    sliderSpeed: 'Animation rate.',
    sliderZoom: 'Density of the kaleidoscope.',
  },
  ShapeShifter: {
    sliderSpeed: 'How quickly one form melts into the next.',
    sliderShape: 'Scrubs through the sequence of forms and every in-between state.',
    sliderColor: 'Base colour of the contour palette.',
    sliderFeather: 'Softness of each silhouette edge.',
    sliderContours: 'Strength and spacing of the distance bands ringing each form.',
  },
  ShoalScatter3D: {
    sliderSpeed: 'How fast the shoal cruises and the hunter patrols.',
    sliderFear: 'How far panic spreads and how hard the shoal shatters.',
    sliderSchooling: 'How strongly the fish hold together between scares.',
    sliderColor: 'Water and fish colour; the hunter glows in a contrasting tone.',
  },
  StandingWaveOrgan: {
    sliderSpeed: 'How fast the voices ring.',
    sliderChord: 'Retunes the voices from unison through fifths to a full harmonic stack.',
    sliderVoices: 'How many voices sound — pull out the stops one by one.',
    sliderColor: 'Sweeps the whole register around the colour wheel.',
  },
  StarNestReimagined: {
    sliderSpeed: 'Drift rate through the folded nest.',
    sliderFold: 'The fold constant — reshapes the nest from open wisps to dense filament webs.',
    sliderColor: 'Base nebula hue.',
    sliderDetail: 'Extra fold passes — finer filaments at the cost of frame rate.',
  },
  SignalMandala: {
    sliderSpeed: 'How fast the scan pulses move through the mandala.',
    sliderSpokes: 'Number of radial spokes.',
    sliderRings: 'Density of circular signal rings.',
    sliderColor: 'Base colour of the mandala.',
  },
  StainedGlassWeather: {
    sliderSpeed: 'How fast the rain and lightning move.',
    sliderPaneSize: 'Density of stained-glass panes.',
    sliderStorm: 'Strength of rain and lightning flashes.',
    sliderTint: 'Base colour of the glass.',
  },
  TempestVolume3D: {
    sliderWaterLevel: 'How full the virtual volume is — low drains it, high nearly floods it.',
    sliderAgitation: 'Storm strength: calmer swells at low, torn crests and spray at high.',
    sliderCurrentScale: 'Size of the submerged current cells moving through the water.',
    sliderFoam: 'Brightness and thickness of surface foam and spray.',
    sliderTint: 'Base water colour.',
  },
  TopographicBloom: {
    sliderSpeed: 'How quickly the flower shape breathes.',
    sliderLayers: 'Strength and density of the contour bands.',
    sliderSpacing: 'Distance between topographic contour lines.',
    sliderColor: 'Base colour of the bloom.',
  },
  VoxelFireflies3D: {
    sliderSpeed: 'How fast fireflies drift within their volume cells.',
    sliderDensity: 'Density of repeated firefly cells.',
    sliderGlow: 'Size of each firefly glow.',
    sliderColor: 'Base colour of the fireflies.',
  },
  ZippyZaps: {
    sliderIterations: 'How many fold passes build the arcs — more adds detail but costs more.',
  },
}

// Return a copy of `controls` with `description` filled in from the curated
// table for `demoName`. Pure and total: an unknown/null demo, or a control with
// no curated entry, is returned unchanged (UI falls back to the label).
export function withControlDescriptions(
  demoName: string | null | undefined,
  controls: Controls,
): Controls {
  const table = demoName ? CONTROL_DESCRIPTIONS[demoName] : undefined
  if (!table) return controls
  return controls.map((c) => {
    const description = table[c.exportName]
    return description ? { ...c, description } : c
  })
}
