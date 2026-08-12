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
  AnalogWiggleFinder: {
    toggleReset: 'Clears accumulated motion confidence when changed in either direction.',
  },
  AllLasersFire: {
    sliderSpeed: 'How quickly the converging laser blasts cycle.',
    sliderBlastScale: 'Length and spread of each laser blast.',
  },
  AuroraSphere: {
    sliderRingCount: 'Number of glowing latitude rings wrapped around the sphere.',
    sliderSpin: 'How fast the bright great-ring orbits — centered is still, higher spins faster.',
    sliderSpeed: 'How often the rings ratchet up a level — the tick rate of the bloom.',
  },
  Bouncer3D: {
    sliderBalls: 'Number of independently moving balls in the map.',
    sliderSize: 'Radius of each ball.',
    sliderSpeed: 'How fast the balls move and bounce.',
  },
  BlueHolidayStar2D: {
    sliderSpeed: 'How quickly the blue holiday star rotates and pulses.',
  },
  BubbleColumn: {
    hsvPickerFluidHue: 'Base colour of the fluid surrounding the bubbles.',
    sliderBubbleValve: 'How frequently new bubbles enter the column.',
  },
  CarriesHolidayStar2D: {
    sliderSpeed: 'How quickly the multicolour holiday star rotates and pulses.',
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
  CellularAutomata1D: {
    sliderStartingCells: 'Number of live cells used to seed each new automaton.',
    sliderRule: 'Wolfram rule number that determines how each generation evolves.',
    sliderLifetime: 'Time before the strip is reseeded; zero lets a generation run indefinitely.',
    sliderColorMode: 'Colours cells by age or by the rule neighbourhood that produced them.',
    sliderPaletteWidth: 'Width of the hue range used to colour active cells.',
    sliderPaletteOffset: 'Rotates the cellular palette around the colour wheel.',
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
  CyclicCellularAutomata2D: {
    sliderSpeed: 'Delay between simulation generations — higher advances more slowly.',
    sliderLifetime: 'Time before the field is randomized again; zero runs indefinitely.',
    sliderMode: 'Switches between Greenberg–Hastings and ordinary cyclic cellular automata.',
  },
  DoomFire: {
    hsvPickerHue: 'Base colour and brightness of the flame.',
    sliderFlameHeight: 'How far the flame rises from its source row.',
    sliderDragonMode: 'Switches between classic fire and enhanced dragon-breath mode.',
    sliderSpeed: 'Delay between fire simulation steps — higher advances more slowly.',
  },
  DoomFireV20_2D: {
    hsvPickerHue: 'Base colour of the flame.',
    sliderFlameHeight: 'How far the flame rises from its source row.',
    sliderWind: 'Strength and direction of the horizontal flame drift.',
    sliderDragonMode: 'Blends from classic fire into the enhanced dragon-breath mode.',
    sliderSpeed: 'How quickly the fire simulation advances.',
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
  GeometryMorphingDemo2D: {
    sliderSize: 'Size of the rotating shape.',
    sliderFilled: 'Switches between a filled shape and an outlined contour.',
    sliderLineWidth: 'Thickness of the shape edge or outline.',
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
  IceFloes2D: {
    sliderSpeed: 'How quickly the drifting ice cells move across the field.',
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
  LineDancer2D: {
    sliderSpeed: 'How fast the twisting line moves.',
    sliderTwist: 'Strength of the line distortion.',
    sliderReflections: 'Number of kaleidoscopic reflection segments.',
  },
  LumaStripes: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one band.',
    sliderDirection: 'Left third reverses, middle holds still, right third travels forward.',
    sliderSpacing: 'Distance from one band to the next.',
    sliderWidth: 'Lit fraction of each band cycle — thin lines to fat bars.',
    sliderFeather: 'Edge softness — hard bars at zero, sine-smooth swells wide open.',
    sliderLean: 'Band asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    sliderAngle: 'Compass origin of travel — 0 comes from the top, 0.25 from the right.',
    toggleInvert: 'Swaps figure and ground — bright bands on black, or dark bands on white.',
  },
  LumaChevron: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one band.',
    sliderDirection: 'Left third reverses, middle holds still, right third travels forward.',
    sliderSpacing: 'Distance from one chevron band to the next.',
    sliderWidth: 'Lit fraction of each band cycle — thin zigzag lines to fat chevrons.',
    sliderFeather: 'Edge softness — hard chevrons at zero, sine-smooth swells wide open.',
    sliderLean: 'Band asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    sliderAngle: 'Compass origin of travel — 0 comes from the top, 0.25 from the right.',
    sliderFold: 'Width of each 45-degree zigzag leg — fine herringbone to broad chevrons.',
    toggleInvert: 'Swaps figure and ground — bright chevrons on black, or dark chevrons on white.',
  },
  LumaRings: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one ring.',
    sliderDirection: 'Left third travels inward, middle holds still, right third travels outward.',
    sliderSpacing: 'Distance from one ring to the next.',
    sliderWidth: 'Lit fraction of each ring cycle — thin circles to fat hoops.',
    sliderFeather: 'Edge softness — hard rings at zero, sine-smooth swells wide open.',
    sliderLean: 'Ring asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    toggleInvert: 'Swaps figure and ground — bright rings on black, or dark rings on white.',
  },
  LumaPinwheel: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one spoke.',
    sliderDirection: 'Left third turns clockwise, middle holds still, right third counterclockwise.',
    sliderSpacing: 'Spoke density — steps through whole spoke counts from 1 to 12.',
    sliderWidth: 'Lit fraction of each spoke cycle — thin rays to fat wedges.',
    sliderFeather: 'Edge softness — hard spokes at zero, sine-smooth swells wide open.',
    sliderLean: 'Spoke asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    toggleInvert: 'Swaps figure and ground — bright spokes on black, or dark spokes on white.',
  },
  LumaDots: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one cell.',
    sliderDirection: 'Left third reverses, middle holds still, right third travels forward.',
    sliderSpacing: 'Distance from one dot to the next.',
    sliderWidth: 'Dot size — the lit fraction of each lattice cell.',
    sliderFeather: 'Edge softness — hard dots at zero, sine-smooth blooms wide open.',
    sliderLean: 'Dot asymmetry — centered is symmetric, either end smears into a sawtooth tail.',
    sliderAngle: 'Compass origin of travel — 0 comes from the top, 0.25 from the right.',
    toggleInvert: 'Swaps figure and ground — bright dots on black, or dark holes in white.',
  },
  LumaWeave: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; each wave set advances one period per loop.',
    sliderDirection: 'Left third reverses, middle holds still, right third travels forward.',
    sliderSpacing: 'Distance between waves — the cross set runs slightly detuned to keep the moire alive.',
    sliderWidth: 'Lit fraction of each wave cycle.',
    sliderFeather: 'Edge softness — a hard lattice at zero, sine-smooth moire wide open.',
    sliderLean: 'Wave asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    sliderAngle: 'Compass origin of the primary wave set — 0 travels from the top, 0.25 from the right.',
    toggleInvert: 'Swaps figure and ground across the whole interference field.',
  },
  LumaSpiral: {
    sliderLoopInterval: 'Exact cycle length in seconds, up to 10 — type a precise value like 2.37; one loop advances exactly one winding.',
    sliderDirection: 'Left third spirals inward-clockwise, middle holds still, right third outward-counterclockwise.',
    sliderSpacing: 'Distance from one winding to the next.',
    sliderWidth: 'Lit fraction of each winding cycle — a thin thread to a fat ribbon.',
    sliderFeather: 'Edge softness — a hard spiral at zero, sine-smooth swells wide open.',
    sliderLean: 'Winding asymmetry — centered is symmetric, either end is a full sawtooth ramp.',
    toggleInvert: 'Swaps figure and ground — a bright spiral on black, or a dark groove in white.',
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
  MapAlignmentDiagnostic: {
    sliderMode: 'Selects moving scans, centred axes, or a repeating coordinate grid.',
    sliderSpeed: 'How quickly the moving scan crosses the mapped domain.',
    sliderWidth: 'Thickness of each red, green, or blue diagnostic band.',
    toggleMotion: 'Pauses or resumes the moving scan.',
  },
  MagneticFilaments: {
    sliderSpeed: 'How quickly the invisible magnets drift.',
    sliderSpacing: 'Density of the magnetic field-line contours.',
    sliderGlow: 'Brightness of the glowing filaments.',
    sliderContrast: 'Sharpness of the field lines.',
  },
  Mandelbrot2D: {
    sliderIterations: 'Maximum fractal iterations — higher reveals finer boundary detail at greater cost.',
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
  MetaballsOfFire2D: {
    sliderNumberOfPoints: 'Number of moving heat points that merge into fiery blobs.',
    sliderSpeed: 'How quickly the heat points move.',
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
  MultisegmentDemo: {
    sliderActiveSegment: 'Selects the strip segment edited by the remaining controls.',
    sliderState: 'Turns the selected segment off or on.',
    sliderEffect: 'Chooses the animation effect for the selected segment.',
    sliderSpeed: 'Animation speed of the selected segment.',
    sliderSize: 'Length of the selected segment in pixels.',
    hsvPickerColor: 'Colour and brightness of the selected segment.',
    sliderSegments: 'Number of independently controlled segments in the strip.',
    sliderEnableWebUI: 'Enables these web controls instead of external home-automation control.',
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
  Newfire: {
    hsvPickerColor: 'Base colour, saturation, and brightness of the flame.',
    sliderFlameHeight: 'How far the flame rises from the heat source.',
    sliderHeat: 'Amount of heat injected at the base of the flame.',
    sliderSparks: 'Random variation that breaks the flame into sparks and tongues.',
    sliderMode: 'Selects one of the fire simulation and rendering modes.',
  },
  Oasis: {
    sliderHue: 'Shifts the water palette around the colour wheel.',
    sliderSpeed: 'How fast the layered waves move.',
    sliderWhitecaps: 'Brightness and frequency of the wave crests.',
    sliderDepth: 'Contrast between deep water and bright highlights.',
    sliderWavelength: 'Spatial scale of the layered waves.',
  },
  PerlinFireWindTunnel: {
    sliderHue: 'Base colour of the flame.',
    sliderMode: 'Selects the Perlin noise algorithm that shapes the fire.',
    sliderdensity: 'Density of the flame field.',
    sliderWind: 'Strength of the spiral wind distortion.',
    sliderSpeed: 'How fast the flame field moves.',
  },
  PerlinKaleidoscope2D: {
    sliderSpeed: 'How fast the noise field moves.',
    sliderLineWidth: 'Width of the RGB lines in the base texture.',
    sliderReflections: 'Number of kaleidoscopic reflection segments.',
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
  RedlineMachine: {
    sliderIntensity: 'Overall pressure of the score, from restrained negative space to full-impact output.',
    sliderSpeed: 'Pace of the complete 32-bar score, from half speed to one-and-a-half speed.',
    sliderCyan: 'Strength of the sparse cyan ornaments and the full cyan takeover during Vacuum and Rebuild.',
  },
  RedlineMachinePortable: {
    sliderIntensity: 'Overall pressure of the score, from restrained negative space to full-impact output.',
    sliderSpeed: 'Pace of the complete 32-bar score, from half speed to one-and-a-half speed.',
    sliderCyan: 'Strength of the sparse cyan ornaments and the full cyan takeover during Vacuum and Rebuild.',
  },
  RealWorldLights: {
    sliderLightType: 'Selects the real-world light source to emulate.',
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
  Raindrops2D: {
    sliderRaindrops: 'How frequently new raindrops disturb the simulated pool.',
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
  SignalMandala: {
    sliderSpeed: 'How fast the scan pulses move through the mandala.',
    sliderSpokes: 'Number of radial spokes.',
    sliderRings: 'Density of circular signal rings.',
    sliderColor: 'Base colour of the mandala.',
  },
  Stacker: {
    hsvPickerColor1: 'Colour of blocks already stacked in each segment.',
    hsvPickerColor2: 'Colour of blocks travelling toward each stack.',
    sliderSpeed: 'How quickly blocks move toward the centre of each segment.',
    sliderSize: 'Size of each travelling block in pixels.',
    sliderSegments: 'Number of equal strip segments that stack independently.',
    sliderColorMode: 'Selects solid, animated-rainbow, or colour-band rendering.',
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
  TunnelOfSquares2D: {
    sliderSpeed: 'How quickly the square tunnel spirals inward.',
    sliderSquarocity: 'Number of nested square bands shaping the tunnel.',
  },
  VoronoiMix2D: {
    sliderNumberOfPoints: 'Number of moving sites in the Voronoi field.',
    sliderDistanceMethod: 'Selects the distance function used to find each pixel’s nearest site.',
    sliderDrawingMode: 'Selects how site distance becomes colour and brightness.',
    sliderSpeed: 'How fast the Voronoi sites move.',
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

// Sliders whose raw 0..1 value encodes seconds linearly (value * scale). The
// Luma family's Loop Interval (#819) keeps the raw slider legible on hardware
// (seconds / 10, so 20% = 2 s) while the IDE offers exact typed entry.
export interface ControlSecondsPresentation {
  scale: number
  minSeconds: number
}

const LUMA_LOOP_SECONDS: ControlSecondsPresentation = { scale: 10, minSeconds: 0.1 }

export const CONTROL_SECONDS_PRESENTATIONS: Record<string, Record<string, ControlSecondsPresentation>> =
  Object.fromEntries(
    ['LumaStripes', 'LumaChevron', 'LumaRings', 'LumaPinwheel', 'LumaDots', 'LumaWeave', 'LumaSpiral']
      .map((name) => [name, { sliderLoopInterval: LUMA_LOOP_SECONDS }]),
  )

// Return a copy of `controls` with `description` (and any curated seconds
// presentation) filled in from the curated tables for `demoName`. Pure and
// total: an unknown/null demo, or a control with no curated entry, is
// returned unchanged (UI falls back to the label).
export function withControlDescriptions(
  demoName: string | null | undefined,
  controls: Controls,
): Controls {
  const table = demoName ? CONTROL_DESCRIPTIONS[demoName] : undefined
  const seconds = demoName ? CONTROL_SECONDS_PRESENTATIONS[demoName] : undefined
  if (!table && !seconds) return controls
  return controls.map((c) => {
    const description = table?.[c.exportName]
    const secondsPresentation = seconds?.[c.exportName]
    if (!description && !secondsPresentation) return c
    return {
      ...c,
      ...(description ? { description } : {}),
      ...(secondsPresentation ? { secondsPresentation } : {}),
    }
  })
}
