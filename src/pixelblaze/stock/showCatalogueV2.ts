import type { ShowTransitionEasing } from '@/engine/personalContentRecords'

export type StockShowTrack = 'portable' | 'installation'
export type StockShowCollection = 'learn' | 'showcases' | 'portable-shows' | 'installations'

export interface StockShowNote {
  label: string
  number?: string
  title: string
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guide: {
    documentId: 'show-visual-toolkit' | 'keyboard-shortcuts'
    heading: string
    label: string
  }
  defaultOpen: boolean
}

export interface ShowPatternSlotGroupV2 { instanceIds: readonly string[] }

export type ShowReferenceExampleAnchorV2 =
  | { kind: 'chapter'; markerId: string }
  | { kind: 'boundary'; afterChapterMarkerId: string }

export interface ShowReferenceExampleV2 {
  id: string
  label: string
  detail: string
  anchor: ShowReferenceExampleAnchorV2
  easing?: ShowTransitionEasing
}

export interface ShowReferenceGuideV2 {
  summary: string
  patternSlots?: ShowPatternSlotGroupV2
  examples: readonly ShowReferenceExampleV2[]
}

export interface StockShowCatalogueEntry {
  id: string
  legacySourceIds?: readonly string[]
  name: string
  track: StockShowTrack
  collection: StockShowCollection
  level: 100 | 200 | 300 | null
  order: number
  lesson: string
  description: string
  note: StockShowNote
  zonesOpenByDefault?: boolean
  patternSlots?: readonly ShowPatternSlotGroupV2[]
  reference?: ShowReferenceGuideV2
}

export const STOCK_SHOW_CATALOGUE: readonly StockShowCatalogueEntry[] = [
  {
    id: "stock-show-100-getting-around",
    name: "100 Getting Around",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 0,
    lesson: "Getting Around",
    description: "This first Show exists to get you familiar with the basics, simplest first.\nSpace plays and pauses. Left and Right jump five seconds; A returns to the start.\nThe Navigator strip above the timeline shows the whole Show: drag its window to move your view, drag its edges to zoom.\nDouble-click an empty stretch of a Layer to place a Clip there. Drag a Clip between rows to move it.\nWhatever you break, Reset restores this lesson exactly.",
    note: {
      label: "Learn 100",
      number: "100",
      title: "Getting Around",
      purpose: "This first Show exists to get you familiar with the basics, simplest first.\nSpace plays and pauses. Left and Right jump five seconds; A returns to the start.\nThe Navigator strip above the timeline shows the whole Show: drag its window to move your view, drag its edges to zoom.\nDouble-click an empty stretch of a Layer to place a Clip there. Drag a Clip between rows to move it.\nWhatever you break, Reset restores this lesson exactly.",
      notice: "Command/Ctrl+wheel also zooms the timeline around the playhead, and Shift+wheel pans it. This tour is deliberately short; the guide covers everything else.",
      prompts: [
        "Hold Option/Alt and drag a Clip to pull off an independent copy: the original never moves. Try dropping it on the upper Layer row, then press Reset.",
        "Hold Option/Alt while resizing or scrubbing a Clip to temporarily reverse Snap."
      ],
      guide: {
        documentId: "keyboard-shortcuts",
        heading: "creating-and-arranging-clips",
        label: "Read the full shortcut reference"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "ribbons"
        ]
      },
      {
        instanceIds: [
          "glyphs"
        ]
      },
      {
        instanceIds: [
          "garden"
        ]
      }
    ]
  },
  {
    id: "stock-show-101-clips-cuts-blank-time",
    name: "101 Clips, Cuts, and Blank Time",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 1,
    lesson: "Clips, Cuts, and Blank Time",
    description: "A Clip occupies a span of Show time on a Layer. Where two Clips touch, the junction between them is a Cut; where none is scheduled, the Show renders black.",
    note: {
      label: "Learn 100",
      number: "101",
      title: "Clips, Cuts, and Blank Time",
      purpose: "A Clip occupies a span of Show time on a Layer. Where two Clips touch, the junction between them is a Cut; where none is scheduled, the Show renders black.",
      notice: "The two seconds before the final Clip are empty on purpose. Blank time is a valid part of the timeline, not a mistake. And edit freely: in any Show, Command/Ctrl+Z undoes and Command/Ctrl+Shift+Z redoes, and Reset restores any of the lessons to their original state.",
      prompts: [
        "Split the first Clip in half without changing the picture.",
        "Drag the last Clip left to close the gap, then back to reopen it."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "clips-cuts-and-blank-time",
        label: "Read clips, cuts, and blank time"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "ribbons"
        ]
      },
      {
        instanceIds: [
          "garden"
        ]
      }
    ]
  },
  {
    id: "stock-show-102-transitions-values",
    name: "102 Transitions and Values",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 2,
    lesson: "Transitions and Values",
    description: "A Transition is its own entity at the junction between two Clips. It owns how the picture changes; the destination Clip still owns the final value.",
    note: {
      label: "Learn 100",
      number: "102",
      title: "Transitions and Values",
      purpose: "A Transition is its own entity at the junction between two Clips. It owns how the picture changes; the destination Clip still owns the final value.",
      notice: "Crossfade and Wipe change the picture. The brightness ramp on the last Clip is a separate, Clip-owned curve.",
      prompts: [
        "Shorten the Crossfade from 2.0 s to 0.5 s.",
        "Change where the last Clip's brightness settles from 45% to 100%."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "transitions-and-clip-values",
        label: "Read transitions and values"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "iris"
        ]
      },
      {
        instanceIds: [
          "horizon"
        ]
      },
      {
        instanceIds: [
          "mandala"
        ]
      }
    ]
  },
  {
    id: "stock-show-103-clip-transform",
    name: "103 Clip Transform",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 3,
    lesson: "Clip Transform",
    description: "A Clip can be moved, turned, resized, or flipped on the Stage. The Pattern inside it keeps playing exactly as before; only where its picture lands changes, and no second copy of the Pattern is started.",
    note: {
      label: "Learn 100",
      number: "103",
      title: "Clip Transform",
      purpose: "A Clip can be moved, turned, resized, or flipped on the Stage. The Pattern inside it keeps playing exactly as before; only where its picture lands changes, and no second copy of the Pattern is started.",
      notice: "Every Clip here shares one Pattern instance, so the rose keeps turning at the same rate while only its placement changes. A Clip can instead run its own instance on its own clock - that choice gets its own lesson in 203.",
      prompts: [
        "Center the offset Clip (2) by setting Position back to 0, 0.",
        "Rotate the Scale Clip (4) by 72 degrees; because that differs from Clip 3, the timeline gives it its own marker."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "clip-transform",
        label: "Read clip transform"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "rose"
        ]
      }
    ]
  },
  {
    id: "stock-show-104-effects-and-ordering",
    name: "104 Effects and Ordering",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 4,
    lesson: "Effects and Ordering",
    description: "An Effect changes the picture a Clip has already drawn, without editing the Pattern. A Clip holds its Effects as a list, and each one works on the result of the one above it, so the same two Effects in a different order do not give the same picture.",
    note: {
      label: "Learn 100",
      number: "104",
      title: "Effects and Ordering",
      purpose: "An Effect changes the picture a Clip has already drawn, without editing the Pattern. A Clip holds its Effects as a list, and each one works on the result of the one above it, so the same two Effects in a different order do not give the same picture.",
      notice: "Clips 3 and 4 carry the same Brightness and the same Threshold, swapped. Clip 3 lowers Brightness first, so only the brightest pixels still clear the Threshold and a sparse scatter survives at full strength. Clip 4 applies Threshold first, so the whole shape survives and Brightness then lowers it. Almost the same amount of light, a completely different picture.",
      prompts: [
        "On Clip 3, open Brightness's action menu and choose Move later so Brightness runs after Threshold, then watch the whole shape come back.",
        "Leave the order alone on Clip 3 and lower that Clip's Threshold until more of the shape survives."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "clip-effects",
        label: "Read effects and ordering"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      }
    ]
  },
  {
    id: "stock-show-105-portable-zones",
    name: "105 Zones",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 5,
    lesson: "Zones",
    description: "The Stage can be split into Zones that each render their own Pattern, and a Zone Layout decides which pixels every Zone gets.\nThree Layouts render the same pair of Patterns here: a left/right split, then rings, then a pinwheel. Each switch re-routes pixels while both Patterns keep playing.\nThe Layouts lane above the Zone rows shows which Layout owns each stretch of the timeline. Click a chip to change that interval's Routing mode and parameters; the small route markers at its edges are the switches.\nThe Zone Map (map icon above the Zone rows) renames, recolors, adds, and deletes Zones. A new Zone joins every Layout: the rings and the pinwheel add a segment for it, and the fixed split becomes stripes to fit it.",
    note: {
      label: "Learn 100",
      number: "105",
      title: "Zones",
      purpose: "The Stage can be split into Zones that each render their own Pattern, and a Zone Layout decides which pixels every Zone gets.\nThree Layouts render the same pair of Patterns here: a left/right split, then rings, then a pinwheel. Each switch re-routes pixels while both Patterns keep playing.\nThe Layouts lane above the Zone rows shows which Layout owns each stretch of the timeline. Click a chip to change that interval's Routing mode and parameters; the small route markers at its edges are the switches.\nThe Zone Map (map icon above the Zone rows) renames, recolors, adds, and deletes Zones. A new Zone joins every Layout: the rings and the pinwheel add a segment for it, and the fixed split becomes stripes to fit it.",
      notice: "Nothing restarts at a switch: both Patterns move into the rings, then into the pinwheel, without a pause. A Layout switch changes where pixels go, never Pattern state. Both switches here sweep across the Stage, so you can watch the geometry change.",
      prompts: [
        "Select the Pinwheel chip in the Layouts lane and raise its Twist turns: the arms curl tighter while both Patterns keep playing, because the Layout owns the geometry.",
        "Add a third Zone in the Zone Map and give it a Clip. The split becomes stripes to make room; the rings and the pinwheel add a segment for it."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "portable-zones",
        label: "Read about Zones"
      },
      defaultOpen: true
    },
    zonesOpenByDefault: true,
    patternSlots: [
      {
        instanceIds: [
          "ribbons"
        ]
      },
      {
        instanceIds: [
          "water"
        ]
      }
    ]
  },
  {
    id: "stock-show-106-built-from-basics",
    name: "106 Built from Basics",
    track: "portable",
    collection: "learn",
    level: 100,
    order: 6,
    lesson: "Built from Basics",
    description: "Everything in this Show comes from the five lessons before it: Clips, Transitions, value curves, a Clip Transform, one Effect, and two Zones. What is new is timing: the Sky and the Ground arrive and leave together. Every junction is a Transition rather than a Cut, the one deliberate departure from 101.",
    note: {
      label: "Learn 100",
      number: "106",
      title: "Built from Basics",
      purpose: "Everything in this Show comes from the five lessons before it: Clips, Transitions, value curves, a Clip Transform, one Effect, and two Zones. What is new is timing: the Sky and the Ground arrive and leave together. Every junction is a Transition rather than a Cut, the one deliberate departure from 101.",
      notice: "Three junctions, three Transitions: a Crossfade, a circle opening from the center, and a Dissolve that reassembles the Ground. The garden then speeds up while both Zones fade to black together and hold.",
      prompts: [
        "Change the circle Transition in the Sky to a different shape and compare the same junction.",
        "Drag the two release curves apart so the Zones stop fading together, then put them back."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "building-a-complete-show",
        label: "Read built from basics"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "bloom"
        ]
      },
      {
        instanceIds: [
          "garden"
        ]
      },
      {
        instanceIds: [
          "mandala"
        ]
      }
    ]
  },
  {
    id: "stock-show-201-layers-property-animation",
    name: "201 Layers and Property Animation",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 1,
    lesson: "Layers and Property Animation",
    description: "Layers blend pixels from different Clips into one picture: whatever a higher Layer draws is mixed over the Layers below it. Here TimeFlies2D plays on a Layer above Caustics, and one animated Opacity curve controls the mix.",
    note: {
      label: "Learn 200",
      number: "201",
      title: "Layers and Property Animation",
      purpose: "Layers blend pixels from different Clips into one picture: whatever a higher Layer draws is mixed over the Layers below it. Here TimeFlies2D plays on a Layer above Caustics, and one animated Opacity curve controls the mix.",
      notice: "The TimeFlies2D Clip starts at 2 s, but its Opacity starts at zero - nothing shows until the curve ramps up to 65%. It holds there, then ramps back to zero by the Clip's end. The Caustics Clip below never changes; the water dims only because the swarm is mixed over it.",
      prompts: [
        "Open the TimeFlies2D Clip, click the diamond next to Opacity, and drag both 65% keyframes down to 30% - the bugs drop back to a faint flicker over the water.",
        "Click Add keyframe and pull the new middle point up to 100% - at 100% TimeFlies2D completely covers Caustics."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "layers-and-property-animation",
        label: "Read layers and property animation"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "water"
        ]
      },
      {
        instanceIds: [
          "flies"
        ]
      }
    ]
  },
  {
    id: "stock-show-202-content-clip-viewport",
    name: "202 Content and Clip Viewport",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 2,
    lesson: "Content and Clip Viewport",
    description: "Think of a Clip as a picture in a frame. The Clip Viewport is the frame: resize it or move it to choose where on the Stage the Clip shows. Content is the picture: slide it underneath and a different part of the Pattern shows through a frame that stays put. Wherever the frame does not cover, the Layer below shows through.",
    note: {
      label: "Learn 200",
      number: "202",
      title: "Content and Clip Viewport",
      purpose: "Think of a Clip as a picture in a frame. The Clip Viewport is the frame: resize it or move it to choose where on the Stage the Clip shows. Content is the picture: slide it underneath and a different part of the Pattern shows through a frame that stays put. Wherever the frame does not cover, the Layer below shows through.",
      notice: "Four Clips, one change at a time. Harmonograph starts by filling the Stage. The frame then shrinks to half size, cropping the picture to the corner. Next the frame glides to the center. Last, the frame holds still while the picture pans underneath it. Harmonograph never restarts - all four Clips show the same Pattern instance.",
      prompts: [
        "On the last Clip, drag Content up or down - the frame stays put while a different part of the picture slides into view.",
        "On the second Clip, widen the frame until the whole picture fits inside it again."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "content-and-clip-viewport",
        label: "Read content and clip viewport"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      },
      {
        instanceIds: [
          "curve"
        ]
      }
    ]
  },
  {
    id: "stock-show-203-pattern-instance-lifecycle",
    name: "203 Pattern Instance Lifecycle",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 3,
    lesson: "Pattern Instance Lifecycle",
    description: "A Pattern instance owns its own state and clock. Clips only present it. Two Clips can share one instance so the picture continues across their junction, while a duplicated Clip gets a fresh instance that starts over.",
    note: {
      label: "Learn 200",
      number: "203",
      title: "Pattern Instance Lifecycle",
      purpose: "A Pattern instance owns its own state and clock. Clips only present it. Two Clips can share one instance so the picture continues across their junction, while a duplicated Clip gets a fresh instance that starts over.",
      notice: "The junction at 4 s changes nothing: both Clips share one instance. At 8 s the same Pattern restarts from the beginning, because that Clip owns a fresh instance. At 12 s the shared instance returns and resumes exactly where it was interrupted - an instance clock only runs while a Clip presents it.",
      prompts: [
        "Select the third Clip and rejoin it to the shared Pattern instance, then watch the 8 s junction stop mattering.",
        "Make the last Clip independent instead, and compare where its colors land."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "pattern-instance-lifecycle",
        label: "Read pattern instance lifecycle"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "palette-shared",
          "palette-fresh"
        ]
      }
    ]
  },
  {
    id: "stock-show-204-presentation-modes",
    name: "204 Presentation Modes",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 4,
    lesson: "Presentation Modes",
    description: "Presentation changes how one Clip shows a running Pattern without touching the Pattern itself. Freeze holds the arrival frame, Strobe refreshes it on a fixed beat, and Blink gates visibility on and off while time keeps passing underneath.",
    note: {
      label: "Learn 200",
      number: "204",
      title: "Presentation Modes",
      purpose: "Presentation changes how one Clip shows a running Pattern without touching the Pattern itself. Freeze holds the arrival frame, Strobe refreshes it on a fixed beat, and Blink gates visibility on and off while time keeps passing underneath.",
      notice: "Live, Freeze, Strobe, and Blink all present the same Pattern instance, and its clock never stops. The last Clip is different in kind: Stutter quantizes the instance clock itself, so it owns a second instance.",
      prompts: [
        "Compare Freeze with Blink: Freeze holds a still picture and Blink hides a moving one. The clock never stops in either, so watch where the colors have gotten to when each Clip ends.",
        "Change the Stutter step and watch the whole Clip snap on a different beat."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "presentation-modes",
        label: "Read presentation modes"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "palette",
          "palette-stuttered"
        ]
      }
    ]
  },
  {
    id: "stock-show-205-groups-linked-reuse",
    name: "205 Groups and Linked Reuse",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 5,
    lesson: "Groups and Linked Reuse",
    description: "A Group definition is choreography you can reuse. Each occurrence places the whole thing - here a mandala pulse and its smaller echo, across two Layers - and every occurrence gets its own fresh Pattern instances, so linked copies repeat the choreography without sharing private state.",
    note: {
      label: "Learn 200",
      number: "205",
      title: "Groups and Linked Reuse",
      purpose: "A Group definition is choreography you can reuse. Each occurrence places the whole thing - here a mandala pulse and its smaller echo, across two Layers - and every occurrence gets its own fresh Pattern instances, so linked copies repeat the choreography without sharing private state.",
      notice: "Both pulses come from one definition. Edit it once and both occurrences change. The second occurrence is moved on the Stage, and its mandala runs on its own instance rather than continuing the first one.",
      prompts: [
        "Open the Group definition and move the echo one second later - both occurrences pick up the change.",
        "Make the second occurrence unique, then change only its echo and compare the two."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "groups-and-linked-reuse",
        label: "Read groups and linked reuse"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "loom"
        ]
      }
    ]
  },
  {
    id: "stock-show-206-changing-zone-layouts",
    name: "206 Changing Zone Layouts",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 6,
    lesson: "Changing Zone Layouts",
    description: "A Zone Layout can change partway through a Show: this timeline plays full surface, then a split, then rings, one after another. The Zones keep their names and their Patterns; only the geometry that routes pixels to them changes.",
    note: {
      label: "Learn 200",
      number: "206",
      title: "Changing Zone Layouts",
      purpose: "A Zone Layout can change partway through a Show: this timeline plays full surface, then a split, then rings, one after another. The Zones keep their names and their Patterns; only the geometry that routes pixels to them changes.",
      notice: "The weave never restarts at a Layout boundary. The first boundary sweeps the split across the Stage; the second switches to Rings in one atomic step. Neither is a visual Transition - pixels are re-routed, not blended.",
      prompts: [
        "Drag the split position in the middle interval - the Layout owns that geometry, and the Patterns on either side never notice.",
        "Insert time before the Rings boundary: the Layout change stays attached to the timeline around it and moves along with it."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "changing-zone-layouts",
        label: "Read changing zone layouts"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "loom"
        ]
      },
      {
        instanceIds: [
          "water"
        ]
      }
    ]
  },
  {
    id: "stock-show-207-aperture-shapes-edges",
    name: "207 Aperture Shapes and Edges",
    track: "portable",
    collection: "learn",
    level: 200,
    order: 7,
    lesson: "Aperture Shapes and Edges",
    description: "The aperture from 202 has a shape of its own: the Clip Viewport picks a silhouette from a catalogue of geometric shapes, icons, and the Signature cats. Every silhouette has an edge - Soft by default, Hard and Stable Dither as deliberate choices - and can rotate inside its axis-aligned frame or flip its Mode to cut the silhouette out.",
    note: {
      label: "Learn 200",
      number: "207",
      title: "Aperture Shapes and Edges",
      purpose: "The aperture from 202 has a shape of its own: the Clip Viewport picks a silhouette from a catalogue of geometric shapes, icons, and the Signature cats. Every silhouette has an edge - Soft by default, Hard and Stable Dither as deliberate choices - and can rotate inside its axis-aligned frame or flip its Mode to cut the silhouette out.",
      notice: "The frame never moves in this lesson; only the silhouette changes, Clip by Clip - Rectangle, Ellipse, Star, then Ring. Every edge is the Soft default until the last Clip, which cuts the same Ring with a Hard edge. The Ring makes the comparison easy: the lower Layer shows through its open center, and hardening the edge shows exactly what the feather was smoothing.",
      prompts: [
        "Rotate the Star, then flip its Mode to Cut out - the frame stays axis-aligned while the silhouette turns, and Cut out removes exactly the pixels Admit was showing.",
        "On the last Clip, switch the Hard edge back to Soft, then try Stable Dither: it trades the smooth ramp for a per-pixel speckle that never shimmers."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "aperture-shapes-and-edges",
        label: "Read aperture shapes and edges"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      },
      {
        instanceIds: [
          "rose"
        ]
      }
    ]
  },
  {
    id: "stock-show-301-installation-mapping",
    name: "301 Installation Mapping",
    track: "installation",
    collection: "learn",
    level: 300,
    order: 1,
    lesson: "Installation Mapping",
    description: "An Installation Show targets one exact output, here a proscenium stage of 1,000 measured LEDs, instead of staying portable. In exchange, each named Zone owns real pixels: a physical range over the map rather than a share of an abstract surface. Together the ranges must cover the output exactly once.",
    note: {
      label: "Learn 300",
      number: "301",
      title: "Installation Mapping",
      purpose: "An Installation Show targets one exact output, here a proscenium stage of 1,000 measured LEDs, instead of staying portable. In exchange, each named Zone owns real pixels: a physical range over the map rather than a share of an abstract surface. Together the ranges must cover the output exactly once.",
      notice: "The ranges follow the order the installer wired the stage: left column, stage field, arch band, right column. That is why the Columns Zone owns two ranges at opposite ends of the index space: one role, two stretches of wire. At the halfway junction the stage and the columns swap Patterns; the ranges never move.",
      prompts: [
        "Open the Columns Zone in the map selector: one Zone, two separate ranges. Selecting its pixels on the map edits the same fact as the numbers.",
        "Remove a few pixels from one column and watch the coverage diagnostic count the gap. Repair it, or press Reset to restore the lesson."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "installation-output-and-physical-ranges",
        label: "Read installation mapping"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      },
      {
        instanceIds: [
          "palettes"
        ]
      },
      {
        instanceIds: [
          "rose"
        ]
      }
    ]
  },
  {
    id: "stock-show-302-installation-composition",
    name: "302 Installation Composition",
    track: "installation",
    collection: "learn",
    level: 300,
    order: 2,
    lesson: "Installation Composition",
    description: "One Pattern instance drives all five surfaces of the Redline stage: a single Mandelbrot2D render lands as a panel in the middle and four radial windows around it. Every further difference costs only a per-Clip adaptation or Effect: a hue phase, a shifted window, a mirror, a posterize, a timed invert.",
    note: {
      label: "Learn 300",
      number: "302",
      title: "Installation Composition",
      purpose: "One Pattern instance drives all five surfaces of the Redline stage: a single Mandelbrot2D render lands as a panel in the middle and four radial windows around it. Every further difference costs only a per-Clip adaptation or Effect: a hue phase, a shifted window, a mirror, a posterize, a timed invert.",
      notice: "The four satellites get four hues from placement phase alone; the compiled artifact adds one number inside the shared hsv call. At each change beat the hues move to new values by a different rule, while shifted windows, a mirrored pair, a posterized pair, and two invert pulses stack onto the same single render.",
      prompts: [
        "Drag one satellite window's Translate X: its quarter-frame slides while the other three hold. Four windows, one render.",
        "Open the artifact inventory: five surfaces, a dozen Effects, one Mandelbrot2D instance. That single-instance line is the point of the lesson."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "composing-a-fixed-installation",
        label: "Read installation composition"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "pendulum"
        ]
      }
    ]
  },
  {
    id: "stock-show-303-compile-simplify-deliver",
    name: "303 Compile, Simplify, and Deliver",
    track: "portable",
    collection: "learn",
    level: 300,
    order: 3,
    lesson: "Compile, Simplify, and Deliver",
    description: "A Show stays editable choreography, but it ships as one ordinary Pixelblaze Pattern. The artifact inventory separates compiled Pattern code from the source generated for Show settings, placements, Effects, and score structure.",
    note: {
      label: "Learn 300",
      number: "303",
      title: "Compile, Simplify, and Deliver",
      purpose: "A Show stays editable choreography, but it ships as one ordinary Pixelblaze Pattern. The artifact inventory separates compiled Pattern code from the source generated for Show settings, placements, Effects, and score structure.",
      notice: "The bloom echo near the end is a separately configured TopographicBloom use over ShapeShifter, and the inventory shows the compiler keeping one copy of the code for both uses. The echo's real cost is its overlay structure: render plans and score data. Its separate clock is why it restarts the bloom from its first frame.",
      prompts: [
        "Open the artifact inventory: TopographicBloom lists two configured uses but one copy in the delivered code, while the render-plan row shows what the echo's Layer costs. Delete the echo Clip and watch the total fall.",
        "Undo the deletion, then export the EPE or open the generated code: everything on the timeline ships inside that one ordinary Pattern."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "compile-simplify-and-deliver",
        label: "Read compile, simplify, and deliver"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "loom",
          "loom-echo"
        ]
      },
      {
        instanceIds: [
          "garden"
        ]
      }
    ]
  },
  {
    id: "stock-show-showcase-transform-effects",
    name: "Transform and Address Effects",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 1,
    lesson: "Transform and Address Effects",
    description: "The same tunnel slides, shrinks, turns, and leans as each Transform Effect eases in, so the square edges show exactly what moved. Wrap then decides what fills the space left behind.",
    note: {
      label: "Showcases",
      title: "Transform and Address Effects",
      purpose: "The same tunnel slides, shrinks, turns, and leans as each Transform Effect eases in, so the square edges show exactly what moved. Wrap then decides what fills the space left behind.",
      notice: "Translate, Scale, Rotate, and Shear glide between values. Wrap switches on or off: it picks where missing pixels come from rather than where pixels go.",
      prompts: [
        "Change Rotate from 0.125 to 0.25 turns.",
        "Move Wrap before Translate and compare the result."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "transform-and-address-effects",
        label: "Read transform and address effects"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-transform-effects",
          "instance-wrap-effect"
        ]
      }
    ],
    reference: {
      summary: "One Pattern stays constant while each Effect in this family changes the rendered result.",
      patternSlots: {
        instanceIds: [
          "instance-transform-effects",
          "instance-wrap-effect"
        ]
      },
      examples: [
        {
          id: "transform-1",
          label: "Reference",
          detail: "Unmodified Pattern reference.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-1"
          }
        },
        {
          id: "transform-2",
          label: "Translate",
          detail: "Translate applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-2"
          }
        },
        {
          id: "transform-3",
          label: "Scale",
          detail: "Scale applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-3"
          }
        },
        {
          id: "transform-4",
          label: "Rotate",
          detail: "Rotate applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-4"
          }
        },
        {
          id: "transform-5",
          label: "Shear",
          detail: "Shear applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-5"
          }
        },
        {
          id: "transform-6",
          label: "Wrap",
          detail: "Wrap applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-6"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-distortion-effects",
    name: "Distortion Effects",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 2,
    lesson: "Distortion Effects",
    description: "Distortion Effects bend the picture without touching the Pattern. The fractal's coastline warps, ripples, and shatters, so the shape and strength of each bend is easy to see.",
    note: {
      label: "Showcases",
      title: "Distortion Effects",
      purpose: "Distortion Effects bend the picture without touching the Pattern. The fractal's coastline warps, ripples, and shatters, so the shape and strength of each bend is easy to see.",
      notice: "Ripple gets the long look; the others pass quickly because they differ at a glance. Every one of them bends the same slow fractal.",
      prompts: [
        "Move the Swirl center to 0.25, 0.50.",
        "Reduce Kaleidoscope segments from 6 to 3."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "distortion-effects",
        label: "Read distortion effects"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-distortion-effects"
        ]
      }
    ],
    reference: {
      summary: "One Pattern stays constant while each Effect in this family changes the rendered result.",
      patternSlots: {
        instanceIds: [
          "instance-distortion-effects"
        ]
      },
      examples: [
        {
          id: "distortion-1",
          label: "Reference",
          detail: "Unmodified Pattern reference.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-1"
          }
        },
        {
          id: "distortion-2",
          label: "Ripple",
          detail: "Ripple applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-2"
          }
        },
        {
          id: "distortion-3",
          label: "Swirl",
          detail: "Swirl applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-3"
          }
        },
        {
          id: "distortion-4",
          label: "Bulge",
          detail: "Bulge applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-4"
          }
        },
        {
          id: "distortion-5",
          label: "Pixelate",
          detail: "Pixelate applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-5"
          }
        },
        {
          id: "distortion-6",
          label: "Kaleidoscope",
          detail: "Kaleidoscope applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-6"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-color-adjustment-effects",
    name: "Color Adjustment Effects",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 3,
    lesson: "Color Adjustment Effects",
    description: "Color Effects change the colors of a Clip and nothing else. The candle holds a few clear hues, so each Effect is easy to name on sight.",
    note: {
      label: "Showcases",
      title: "Color Adjustment Effects",
      purpose: "Color Effects change the colors of a Clip and nothing else. The candle holds a few clear hues, so each Effect is easy to name on sight.",
      notice: "A long opening shows the true colors, then each adjustment passes quickly. Opacity sits beside Brightness so you can compare them; the key Effects live in the Compositing and Key showcase, where there is a layer underneath to reveal.",
      prompts: [
        "Compare Contrast against Brightness on the same flame.",
        "Change Posterize from 4 levels to 2."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "color-adjustment-effects",
        label: "Read color adjustment effects"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-color-adjustment-effects"
        ]
      }
    ],
    reference: {
      summary: "One Pattern stays constant while each Effect in this family changes the rendered result.",
      patternSlots: {
        instanceIds: [
          "instance-color-adjustment-effects"
        ]
      },
      examples: [
        {
          id: "color-adjustment-1",
          label: "Reference",
          detail: "Unmodified Pattern reference.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-1"
          }
        },
        {
          id: "color-adjustment-2",
          label: "Brightness",
          detail: "Brightness applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-2"
          }
        },
        {
          id: "color-adjustment-3",
          label: "Opacity",
          detail: "Opacity applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-3"
          }
        },
        {
          id: "color-adjustment-4",
          label: "Hue",
          detail: "Hue applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-4"
          }
        },
        {
          id: "color-adjustment-5",
          label: "Saturation",
          detail: "Saturation applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-5"
          }
        },
        {
          id: "color-adjustment-6",
          label: "Contrast",
          detail: "Contrast applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-6"
          }
        },
        {
          id: "color-adjustment-7",
          label: "Invert",
          detail: "Invert applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-7"
          }
        },
        {
          id: "color-adjustment-8",
          label: "Threshold",
          detail: "Threshold applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-8"
          }
        },
        {
          id: "color-adjustment-9",
          label: "Posterize",
          detail: "Posterize applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-9"
          }
        },
        {
          id: "color-adjustment-10",
          label: "Color map",
          detail: "Color map applied in isolation.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-10"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-compositing-key-effects",
    name: "Compositing and Key Effects",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 4,
    lesson: "Compositing and Key Effects",
    description: "Opacity, Luma Key, Chroma Key, and Vignette decide which of a Clip's pixels show through, so they only make sense with something underneath. A dim warm Pattern runs under the whole Show; wherever an Effect removes a pixel, you see that Pattern instead.",
    note: {
      label: "Showcases",
      title: "Compositing and Key Effects",
      purpose: "Opacity, Luma Key, Chroma Key, and Vignette decide which of a Clip's pixels show through, so they only make sense with something underneath. A dim warm Pattern runs under the whole Show; wherever an Effect removes a pixel, you see that Pattern instead.",
      notice: "Each Effect gets the picture that shows it best: grayscale rings for Opacity and Luma Key, fire for Chroma Key, and a Vignette over keyed waves at the end. Every key removes black, so gray edges fade rather than cut.",
      prompts: [
        "Raise the Luma Key tolerance until only the brightest ring cores survive.",
        "Point the Chroma Key at the fire's yellow instead and watch the cores vanish."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "compositing-and-key-effects",
        label: "Read compositing and key effects"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "composite-rings",
          "composite-rings-crisp"
        ]
      },
      {
        instanceIds: [
          "composite-fire"
        ]
      },
      {
        instanceIds: [
          "composite-waves"
        ]
      }
    ],
    reference: {
      summary: "A constant warm bed under keyed subjects; each Effect decides which subject pixels reach the mix, ending with thin keyed rings over keyed waves over the bed - every key on black.",
      patternSlots: {
        instanceIds: [
          "composite-rings",
          "composite-rings-crisp",
          "composite-fire",
          "composite-waves"
        ]
      },
      examples: [
        {
          id: "composite-1",
          label: "Reference",
          detail: "Grayscale rings fully opaque; the bed is invisible beneath them.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-1"
          }
        },
        {
          id: "composite-2",
          label: "Layer Opacity",
          detail: "The Layer thins over what is beneath: the warm bed glows through everywhere.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-2"
          }
        },
        {
          id: "composite-3",
          label: "Animated Opacity",
          detail: "The Layer opacity rides a Property track from full to nothing: the rings dissolve into the bed.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-3"
          }
        },
        {
          id: "composite-4",
          label: "Luma Key",
          detail: "The key targets black: the ring gaps vanish and every gray edge becomes gradient opacity over the bed.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-4"
          }
        },
        {
          id: "composite-5",
          label: "Chroma Key",
          detail: "Orange vanishes: the flame bodies carve out and the bed burns through them.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-5"
          }
        },
        {
          id: "composite-6",
          label: "Vignette",
          detail: "The frame closes to black at the edges while keyed waves march over the bed.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-6"
          }
        },
        {
          id: "composite-7",
          label: "Animated Angle",
          detail: "The waves' own Angle, Width, and Spacing animate under a held key - Luma controls are ordinary properties.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-7"
          }
        },
        {
          id: "composite-8",
          label: "Layered",
          detail: "Luma on Luma: thin keyed rings over keyed sine waves over the bed - every key on black.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:composite-8"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-luma-sources",
    name: "Luma Sources",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 5,
    lesson: "Luma Sources",
    description: "The Luma Patterns are grayscale shapes made to be used as keys, and they share one set of controls. Each one plays plain first, then with a single control animated.",
    note: {
      label: "Showcases",
      title: "Luma Sources",
      purpose: "The Luma Patterns are grayscale shapes made to be used as keys, and they share one set of controls. Each one plays plain first, then with a single control animated.",
      notice: "Stripes widen, Sine Waves lean, Chevron folds, Rings spread, Pinwheel drifts off-center, Dots turn, Weave speeds up, and Spiral tightens. They stay grayscale here; the Compositing and Key showcase turns them into keys.",
      prompts: [
        "Drag any animated control yourself and see the same range.",
        "Add a Luma Key to any Clip and watch the shape become a key."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "luma-sources",
        label: "Read luma sources"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "luma-Pinwheel"
        ]
      }
    ],
    reference: {
      summary: "Seven grayscale key sources, one beat each: bare, then brought alive by one animated property.",
      patternSlots: {
        instanceIds: [
          "luma-Pinwheel"
        ]
      },
      examples: [
        {
          id: "luma-1",
          label: "Stripes",
          detail: "Width fattens the bands from thin lines into broad bars.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-1"
          }
        },
        {
          id: "luma-2",
          label: "Sine Waves",
          detail: "Lean tips the smooth swells into breaking sawtooth waves.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-2"
          }
        },
        {
          id: "luma-3",
          label: "Chevron",
          detail: "Fold breathes from fine herringbone to broad chevrons.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-3"
          }
        },
        {
          id: "luma-4",
          label: "Rings",
          detail: "Spacing pours the rings tighter, then relaxes them wide.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-4"
          }
        },
        {
          id: "luma-5",
          label: "Pinwheel",
          detail: "The hub glides off-center while the spokes keep turning.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-5"
          }
        },
        {
          id: "luma-6",
          label: "Dots",
          detail: "The marching lattice slowly wheels a quarter turn.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-6"
          }
        },
        {
          id: "luma-7",
          label: "Weave",
          detail: "Pace ramps the interference shimmer from languid to boiling.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-7"
          }
        },
        {
          id: "luma-8",
          label: "Spiral",
          detail: "A slow zoom into the winding closes the set.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:luma-8"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-blend-fade-transitions",
    name: "Blend and Fade Transitions",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 6,
    lesson: "Blend and Fade Transitions",
    description: "The basic ways to get from one Clip to the next: a plain Cut, one slow Crossfade, and two Fades through a color.",
    note: {
      label: "Showcases",
      title: "Blend and Fade Transitions",
      purpose: "The basic ways to get from one Clip to the next: a plain Cut, one slow Crossfade, and two Fades through a color.",
      notice: "The Crossfade takes its time so you can watch it; the Fades go faster because the color they pass through is the whole point.",
      prompts: [
        "Stretch the Crossfade and watch both pictures show at once.",
        "Change the Fade color from black to a deep blue in the inspector."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "blend-and-fade-transition-reference",
        label: "Read blend and fade transitions"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "cut",
          label: "Cut",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "crossfade",
          label: "Crossfade",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "fade-black",
          label: "Fade through black",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "fade-white",
          label: "Fade through white",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-wipe-transitions",
    name: "Wipes",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 7,
    lesson: "Wipes",
    description: "One slow Wipe to the right, then a quick tour of the other directions and every patterned Wipe.",
    note: {
      label: "Showcases",
      title: "Wipes",
      purpose: "One slow Wipe to the right, then a quick tour of the other directions and every patterned Wipe.",
      notice: "After the slow one, each Wipe changes one thing - direction, split, doors, blinds, clock, checker, grid - and moves on. Diagonal and center-in versions are a setting away in the inspector.",
      prompts: [
        "Compare hard, dithered, and blended edges on the slow Wipe.",
        "Slow any of the quick Wipes down."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "wipe-transition-reference",
        label: "Read wipes"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "wipe-east",
          label: "Linear wipe east",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "wipe-south",
          label: "Linear wipe south",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "wipe-west",
          label: "Linear wipe west",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "wipe-north",
          label: "Linear wipe north",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "split-out",
          label: "Split center out",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "barn-out",
          label: "Barn doors out",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        },
        {
          id: "blinds-vertical",
          label: "Vertical blinds",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-7"
          }
        },
        {
          id: "clock-cw",
          label: "Clock clockwise",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-8"
          }
        },
        {
          id: "checker",
          label: "Checker",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-9"
          }
        },
        {
          id: "grid",
          label: "Grid",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-10"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-dissolve-transitions",
    name: "Dissolves",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 8,
    lesson: "Dissolves",
    description: "Four ways to break one picture up into the next: pixel by pixel, in blocks, in cloudy patches, and through a soft edge.",
    note: {
      label: "Showcases",
      title: "Dissolves",
      purpose: "Four ways to break one picture up into the next: pixel by pixel, in blocks, in cloudy patches, and through a soft edge.",
      notice: "The pixel Dissolve plays slowly; the other three differ only in the shape of what breaks up.",
      prompts: [
        "Change the block dissolve grid in the inspector.",
        "Compare coherent-noise with soft-threshold at the same duration."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "dissolve-transition-reference",
        label: "Read dissolves"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "dissolve-pixel",
          label: "Pixel dissolve",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "dissolve-block",
          label: "Block dissolve",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "dissolve-noise",
          label: "Coherent-noise dissolve",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "dissolve-soft",
          label: "Soft-threshold dissolve",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-shape-reveal-transitions",
    name: "Shape Reveals: Geometric",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 9,
    lesson: "Shape Reveals: Geometric",
    description: "One slow Circle reveal, then a quick tour of the geometric shapes. The Patterns, center, size, and edge stay put, so the shape is all that changes.",
    note: {
      label: "Showcases",
      title: "Shape Reveals: Geometric",
      purpose: "One slow Circle reveal, then a quick tour of the geometric shapes. The Patterns, center, size, and edge stay put, so the shape is all that changes.",
      notice: "Circle plays slowly both ways - growing in and shrinking out; the other shapes alternate at speed. Hearts, stars, and cats have their own showcase.",
      prompts: [
        "Slow any shape down to watch its edge.",
        "Move the center away from 0.5, 0.5 and compare asymmetric shapes."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "shape-reveal-transition-reference",
        label: "Read shape reveals: geometric"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "circle-grow",
          label: "Circle: grow incoming",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "circle-shrink",
          label: "Circle: shrink outgoing",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "shape-ellipse",
          label: "Ellipse: grow incoming",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "shape-box",
          label: "Box: shrink outgoing",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "shape-rounded-box",
          label: "Rounded box: grow incoming",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "shape-diamond",
          label: "Diamond: shrink outgoing",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        },
        {
          id: "shape-cross",
          label: "Cross: grow incoming",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-7"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-shape-reveal-figures",
    name: "Shape Reveals: Figures",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 10,
    lesson: "Shape Reveals: Figures",
    description: "Heart, ring, star, crescent, polygon, and cat head, each shrinking out and then growing in.",
    note: {
      label: "Showcases",
      title: "Shape Reveals: Figures",
      purpose: "Heart, ring, star, crescent, polygon, and cat head, each shrinking out and then growing in.",
      notice: "Only the shape changes. The reveals are slow and the holds short, because the motion is the lesson.",
      prompts: [
        "Give the Star 6 points.",
        "Widen the Ring."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "shape-reveal-figures-reference",
        label: "Read shape reveals: figures"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "shape-heart-out",
          label: "Heart: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "shape-heart-in",
          label: "Heart: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "shape-ring-out",
          label: "Ring: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "shape-ring-in",
          label: "Ring: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "shape-star-out",
          label: "Star: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "shape-star-in",
          label: "Star: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        },
        {
          id: "shape-crescent-out",
          label: "Crescent: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-7"
          }
        },
        {
          id: "shape-crescent-in",
          label: "Crescent: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-8"
          }
        },
        {
          id: "shape-polygon-out",
          label: "Regular polygon: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-9"
          }
        },
        {
          id: "shape-polygon-in",
          label: "Regular polygon: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-10"
          }
        },
        {
          id: "shape-cat-head-out",
          label: "Cat head: shrink outgoing",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-11"
          }
        },
        {
          id: "shape-cat-head-in",
          label: "Cat head: grow incoming",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-12"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-slide-transitions",
    name: "Slide Transitions",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 11,
    lesson: "Slide Transitions",
    description: "Cover, Reveal, and Push are the three ways one picture slides in: over, out from under, or alongside the other. One slow Cover, then the rest at speed.",
    note: {
      label: "Showcases",
      title: "Slide Transitions",
      purpose: "Cover, Reveal, and Push are the three ways one picture slides in: over, out from under, or alongside the other. One slow Cover, then the rest at speed.",
      notice: "Cover moves the new picture, Reveal moves the old one, Push moves both. Diagonal directions are a setting away in the inspector.",
      prompts: [
        "Change a quick Cover to a diagonal direction.",
        "Switch Addressing from Clip to Wrap and compare moving edges."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "slide-transition-reference",
        label: "Read slide transitions"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "cover-east",
          label: "Cover east",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "reveal-east",
          label: "Reveal east",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "push-east",
          label: "Push east",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "cover-south",
          label: "Cover south",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "cover-west",
          label: "Cover west",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "cover-north",
          label: "Cover north",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-zoom-spin-transitions",
    name: "Zoom and Spin Transitions",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 12,
    lesson: "Zoom and Spin Transitions",
    description: "Arrivals that grow, shrink, or spin: one slow Content grow, then the rest at speed.",
    note: {
      label: "Showcases",
      title: "Zoom and Spin Transitions",
      purpose: "Arrivals that grow, shrink, or spin: one slow Content grow, then the rest at speed.",
      notice: "Content transitions scale the picture inside its frame; Zoom transitions scale the frame itself. The spin presets only add rotation.",
      prompts: [
        "Compare Content grow with Zoom in at the same duration.",
        "Compare zoom-and-spin with plain spin at the same duration."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "zoom-and-spin-transition-reference",
        label: "Read zoom and spin transitions"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "content-grow",
          label: "Content grow",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "content-shrink",
          label: "Content shrink",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "zoom-in",
          label: "Zoom in",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "zoom-out",
          label: "Zoom out",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "spin-cw",
          label: "Spin in clockwise",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "spin-ccw",
          label: "Spin in counterclockwise",
          detail: "Selected -> Reference",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        },
        {
          id: "zoom-spin-cw",
          label: "Zoom and spin clockwise",
          detail: "Reference -> Selected",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-7"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-property-animation",
    name: "Property Animation",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 13,
    lesson: "Property Animation",
    description: "Nine examples of a value changing over time - a Pattern control, brightness, a Clip Transform, a Viewport, a layer, an Effect setting, a Layout, and a Repeat. The right column plays the same Pattern with nothing animated, so the difference between the columns is the animation.",
    note: {
      label: "Showcases",
      title: "Property Animation",
      purpose: "Nine examples of a value changing over time - a Pattern control, brightness, a Clip Transform, a Viewport, a layer, an Effect setting, a Layout, and a Repeat. The right column plays the same Pattern with nothing animated, so the difference between the columns is the animation.",
      notice: "The first seven are animated on the Clip; the last two, Split position and Repeat scale, are animated across a boundary. Compare against the still column: whatever differs is the property at work.",
      prompts: [
        "Open each Clip and see which one owns the animation.",
        "Change one midpoint value while leaving its endpoints fixed."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "property-animation-reference",
        label: "Read property animation"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-property-subject",
          "instance-property-subject-speed",
          "instance-property-comparison-speed",
          "instance-property-subject-control",
          "instance-property-comparison-control"
        ]
      }
    ],
    reference: {
      summary: "The Stage and timeline highlight one animatable property at a time. Each chooser recasts one Pattern source everywhere it appears; placement and Effect tracks stay attached, while animation tied to a control from the original Pattern yields to the replacement.",
      patternSlots: {
        instanceIds: [
          "instance-property-subject",
          "instance-property-comparison-speed",
          "instance-property-comparison-control"
        ]
      },
      examples: [
        {
          id: "animation-speed",
          label: "Animation speed",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:animation-speed"
          }
        },
        {
          id: "pattern-control",
          label: "Public Pattern control",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:pattern-control"
          }
        },
        {
          id: "brightness",
          label: "Brightness",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:brightness"
          }
        },
        {
          id: "clip-transform",
          label: "Clip Transform",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:clip-transform"
          }
        },
        {
          id: "clip-viewport",
          label: "Clip Viewport",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:clip-viewport"
          }
        },
        {
          id: "overlay-opacity",
          label: "Overlay opacity",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:overlay-opacity"
          }
        },
        {
          id: "effect-parameter",
          label: "Effect parameter",
          detail: "Clip-owned Property sparkline.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:effect-parameter"
          }
        },
        {
          id: "split-position",
          label: "Split position",
          detail: "Boundary-owned routing Property transition.",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:effect-parameter"
          }
        },
        {
          id: "repeat-scale",
          label: "Repeat scale",
          detail: "Boundary-owned sample-remap Property transition.",
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:split-position"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-easing",
    name: "Easing",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 14,
    lesson: "Easing",
    description: "The same Wipe, over and over, with only its easing changed. Easing decides how a move speeds up and slows down on its way from start to finish.",
    note: {
      label: "Showcases",
      title: "Easing",
      purpose: "The same Wipe, over and over, with only its easing changed. Easing decides how a move speeds up and slows down on its way from start to finish.",
      notice: "Every Wipe takes the same time on purpose - easing changes when the progress happens, not how long it takes. The header names the current curve and draws it.",
      prompts: [
        "Compare quadratic in with quadratic out.",
        "Watch where Steps and Hold curves spend their time."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "easing-reference",
        label: "Read easing"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "instance-reference-content-reference"
        ]
      },
      {
        instanceIds: [
          "instance-reference-content-selected"
        ]
      }
    ],
    reference: {
      summary: "Each boundary compares two content Patterns; the arrow names which side is incoming, and both content sides are swappable.",
      patternSlots: {
        instanceIds: [
          "instance-reference-content-selected",
          "instance-reference-content-reference"
        ]
      },
      examples: [
        {
          id: "easing-linear",
          label: "linear",
          detail: "Reference -> Selected",
          easing: {
            curve: "linear"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-1"
          }
        },
        {
          id: "easing-ease-in",
          label: "quadratic in",
          detail: "Selected -> Reference",
          easing: {
            curve: "quadratic",
            direction: "in"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-2"
          }
        },
        {
          id: "easing-ease-out",
          label: "quadratic out",
          detail: "Reference -> Selected",
          easing: {
            curve: "quadratic",
            direction: "out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-3"
          }
        },
        {
          id: "easing-ease-in-out",
          label: "quadratic in/out",
          detail: "Selected -> Reference",
          easing: {
            curve: "quadratic",
            direction: "in-out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-4"
          }
        },
        {
          id: "easing-cubic-in",
          label: "cubic in",
          detail: "Reference -> Selected",
          easing: {
            curve: "cubic",
            direction: "in"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-5"
          }
        },
        {
          id: "easing-cubic-out",
          label: "cubic out",
          detail: "Selected -> Reference",
          easing: {
            curve: "cubic",
            direction: "out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-6"
          }
        },
        {
          id: "easing-cubic-in-out",
          label: "cubic in/out",
          detail: "Reference -> Selected",
          easing: {
            curve: "cubic",
            direction: "in-out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-7"
          }
        },
        {
          id: "easing-sine-in",
          label: "sine in",
          detail: "Selected -> Reference",
          easing: {
            curve: "sine",
            direction: "in"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-8"
          }
        },
        {
          id: "easing-sine-out",
          label: "sine out",
          detail: "Reference -> Selected",
          easing: {
            curve: "sine",
            direction: "out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-9"
          }
        },
        {
          id: "easing-sine-in-out",
          label: "sine in/out",
          detail: "Selected -> Reference",
          easing: {
            curve: "sine",
            direction: "in-out"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-10"
          }
        },
        {
          id: "easing-css-ease",
          label: "CSS ease",
          detail: "Reference -> Selected",
          easing: {
            curve: "cubic-bezier",
            x1: 0.25,
            y1: 0.1,
            x2: 0.25,
            y2: 1
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-11"
          }
        },
        {
          id: "easing-css-ease-in",
          label: "CSS ease in",
          detail: "Selected -> Reference",
          easing: {
            curve: "cubic-bezier",
            x1: 0.42,
            y1: 0,
            x2: 1,
            y2: 1
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-12"
          }
        },
        {
          id: "easing-css-ease-out",
          label: "CSS ease out",
          detail: "Reference -> Selected",
          easing: {
            curve: "cubic-bezier",
            x1: 0,
            y1: 0,
            x2: 0.58,
            y2: 1
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-13"
          }
        },
        {
          id: "easing-css-ease-in-out",
          label: "CSS ease in/out",
          detail: "Selected -> Reference",
          easing: {
            curve: "cubic-bezier",
            x1: 0.42,
            y1: 0,
            x2: 0.58,
            y2: 1
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-14"
          }
        },
        {
          id: "easing-steps-4-end",
          label: "4 steps",
          detail: "Reference -> Selected",
          easing: {
            curve: "steps",
            steps: 4,
            position: "end"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-15"
          }
        },
        {
          id: "easing-steps-4-start",
          label: "4 steps from start",
          detail: "Selected -> Reference",
          easing: {
            curve: "steps",
            steps: 4,
            position: "start"
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-16"
          }
        },
        {
          id: "easing-hold-half",
          label: "Hold until halfway",
          detail: "Reference -> Selected",
          easing: {
            curve: "hold",
            at: 0.5
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-17"
          }
        },
        {
          id: "easing-back-in",
          label: "back in",
          detail: "Selected -> Reference",
          easing: {
            curve: "back",
            direction: "in",
            overshoot: 1.70158
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-18"
          }
        },
        {
          id: "easing-back-out",
          label: "back out",
          detail: "Reference -> Selected",
          easing: {
            curve: "back",
            direction: "out",
            overshoot: 1.70158
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-19"
          }
        },
        {
          id: "easing-back-in-out",
          label: "back in/out",
          detail: "Selected -> Reference",
          easing: {
            curve: "back",
            direction: "in-out",
            overshoot: 1.70158
          },
          anchor: {
            kind: "boundary",
            afterChapterMarkerId: "scene-marker:reference-20"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-aperture-shapes",
    name: "Aperture Shapes: Geometric",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 15,
    lesson: "Aperture Shapes: Geometric",
    description: "Every geometric Viewport shape over the same picture, then one shape with each of its three edge styles. Only one thing changes at a time. Icons, the cats, rotation, and Cut out have their own showcase.",
    note: {
      label: "Showcases",
      title: "Aperture Shapes: Geometric",
      purpose: "Every geometric Viewport shape over the same picture, then one shape with each of its three edge styles. Only one thing changes at a time. Icons, the cats, rotation, and Cut out have their own showcase.",
      notice: "The first seven change only the shape, with a soft edge. The wide-radius one shows corner radius is part of the shape, not the edge. The last three hold the Ring and change only the edge: Soft, Hard, then Stable Dither.",
      prompts: [
        "Swap the Pattern and watch every shape stay the same.",
        "Open any passage and drag the corner radius, arm width, sides, or edge softness - the reference values are starting points, not limits."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "aperture-shapes-reference",
        label: "Read aperture shapes: geometric"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      },
      {
        instanceIds: [
          "rose"
        ]
      }
    ],
    reference: {
      summary: "Geometric silhouettes at one frame, then the Ring across Hard, Soft, and Stable Dither.",
      patternSlots: {
        instanceIds: [
          "garden",
          "rose"
        ]
      },
      examples: [
        {
          id: "example-rectangle",
          label: "Rectangle",
          detail: "The plain frame, feathered Soft; the Hard cut appears later as the deliberate exception.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:rectangle"
          }
        },
        {
          id: "example-ellipse",
          label: "Ellipse",
          detail: "The inscribed oval at its Soft default; corners of the frame fall away.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:ellipse"
          }
        },
        {
          id: "example-diamond",
          label: "Diamond",
          detail: "The inscribed diamond at its Soft default; edges run corner to corner.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:diamond"
          }
        },
        {
          id: "example-rounded-box",
          label: "Rounded box",
          detail: "The frame with its corners rounded at the default radius.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:rounded-box"
          }
        },
        {
          id: "example-rounded-box-wide",
          label: "Rounded box, wide radius",
          detail: "The same box at a wide corner radius: radius is a shape parameter, not an edge treatment.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:rounded-box-wide"
          }
        },
        {
          id: "example-cross",
          label: "Cross",
          detail: "The inscribed cross at its Soft default; arm width is its shape parameter.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:cross"
          }
        },
        {
          id: "example-polygon",
          label: "Regular polygon",
          detail: "The inscribed hexagon at its Soft default; Sides is its shape parameter.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:polygon"
          }
        },
        {
          id: "example-ring-soft",
          label: "Ring, Soft edge",
          detail: "An annulus at its Soft default: the bed shows through the center, which no box can do.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:ring-soft"
          }
        },
        {
          id: "example-ring-hard",
          label: "Ring, Hard edge",
          detail: "The same Ring cut Hard - the deliberate exception that shows what the feather was doing.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:ring-hard"
          }
        },
        {
          id: "example-ring-dither",
          label: "Ring, Stable Dither",
          detail: "The same Ring with a stable dithered edge that survives LED quantization.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:ring-dither"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-reference-aperture-icons",
    name: "Aperture Icons & Signature",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 16,
    lesson: "Aperture Icons & Signature",
    description: "The icon shapes - Heart, Star, Crescent, Cloud, and the three cats - over Kishimisu and a dim MetaballGarden bed, then rotation and Cut out. Only one thing changes at a time.",
    note: {
      label: "Showcases",
      title: "Aperture Icons & Signature",
      purpose: "The icon shapes - Heart, Star, Crescent, Cloud, and the three cats - over Kishimisu and a dim MetaballGarden bed, then rotation and Cut out. Only one thing changes at a time.",
      notice: "The first seven change only the shape. The last two hold a shape and change one control: rotation turns the star while the frame stays still, and Cut out flips the cloud so the shape becomes the hole.",
      prompts: [
        "Drag the rotation on the turned star - the frame never moves, only the shape.",
        "Flip any passage's Mode between Admit inside and Cut out - both sides share one boundary and one feather."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "aperture-icons-and-signature-reference",
        label: "Read aperture icons & signature"
      },
      defaultOpen: true
    },
    patternSlots: [
      {
        instanceIds: [
          "rose"
        ]
      }
    ],
    reference: {
      summary: "Icon and signature silhouettes at one frame, then rotation and the Cut-out mode.",
      patternSlots: {
        instanceIds: [
          "rose"
        ]
      },
      examples: [
        {
          id: "example-heart",
          label: "Heart",
          detail: "The inscribed heart at its Soft default: the first icon, held long enough to study its lobes and point.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:heart"
          }
        },
        {
          id: "example-star",
          label: "Star",
          detail: "A five-point star at its Soft default; Points and Inner radius are its shape parameters.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:star"
          }
        },
        {
          id: "example-crescent",
          label: "Crescent",
          detail: "The crescent at its Soft default; the cutout offset is its shape parameter.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:crescent"
          }
        },
        {
          id: "example-cloud",
          label: "Cloud",
          detail: "The cumulus silhouette: a scalloped crown over a flat base, feathered Soft.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:cloud"
          }
        },
        {
          id: "example-cat-head",
          label: "Cat head",
          detail: "The signature cat head at its Soft default.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:cat-head"
          }
        },
        {
          id: "example-cat-side-profile",
          label: "Side-profile cat",
          detail: "The seated side profile at its Soft default.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:cat-side-profile"
          }
        },
        {
          id: "example-bastet",
          label: "Bastet",
          detail: "The upright Bastet silhouette at its Soft default.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:bastet"
          }
        },
        {
          id: "example-star-rotated",
          label: "Star, rotated",
          detail: "The same star turned inside its frame: rotation is silhouette styling, and the frame stays axis-aligned.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:star-rotated"
          }
        },
        {
          id: "example-cloud-cut-out",
          label: "Cloud, Cut out",
          detail: "The same cloud in Cut-out mode: the silhouette becomes the hole, and the bed shows through it.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:cloud-cut-out"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-zone-layouts-splits",
    name: "Zone Layouts: Splits & Checker",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 17,
    lesson: "Zone Layouts: Splits & Checker",
    description: "Four ways to share one Stage between two Patterns: the whole surface, a hard split that moves, the same split with a soft edge, and a 4 x 4 checker. The Patterns never change; only the Layout does.",
    note: {
      label: "Showcases",
      title: "Zone Layouts: Splits & Checker",
      purpose: "Four ways to share one Stage between two Patterns: the whole surface, a hard split that moves, the same split with a soft edge, and a 4 x 4 checker. The Patterns never change; only the Layout does.",
      notice: "Each Layout change is a clean switch, not a Transition: pixels change hands in one step and both Patterns keep playing. The soft split is the exception - inside its feathered edge, both Patterns blend.",
      prompts: [
        "Drag the split position on the Moving split interval in the Layouts lane - the boundary is an interval value, and neither Pattern notices it move.",
        "Select the Soft split chip and widen its feather - the blend band grows while both voices keep playing."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "zone-layouts-reference",
        label: "Read about Zone Layouts"
      },
      defaultOpen: true
    },
    zonesOpenByDefault: true,
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      }
    ],
    reference: {
      summary: "Full surface, moving split, soft split, and checker over two constant voices.",
      patternSlots: {
        instanceIds: [
          "garden"
        ]
      },
      examples: [
        {
          id: "example-full",
          label: "Full surface",
          detail: "One Zone owns the complete normalized Stage: the hero voice alone, before any partition exists.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:full"
          }
        },
        {
          id: "example-moving-split",
          label: "Moving split",
          detail: "The first partition: a hard X boundary whose position is an interval value that can also glide at a junction.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:moving-split"
          }
        },
        {
          id: "example-soft-split",
          label: "Soft split",
          detail: "The same boundary feathered: inside the band both Zones render and blend - the one Layout without hard ownership.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:soft-split"
          }
        },
        {
          id: "example-checker",
          label: "Checker",
          detail: "The two voices alternate across a 4 x 4 board; columns and rows are the Layout parameters.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:checker"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-zone-layouts-stripes-grid",
    name: "Zone Layouts: Stripes & Grid",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 18,
    lesson: "Zone Layouts: Stripes & Grid",
    description: "One surface shared by four Patterns: equal stripes, then a 2 x 2 grid. The four Patterns never change; only the Layout that places them does.",
    note: {
      label: "Showcases",
      title: "Zone Layouts: Stripes & Grid",
      purpose: "One surface shared by four Patterns: equal stripes, then a 2 x 2 grid. The four Patterns never change; only the Layout that places them does.",
      notice: "Each Layout change is a clean switch: stripes become cells in one step while all four Patterns keep playing. The dark rain Pattern is deliberate: its quiet band and cell keep the other three readable.",
      prompts: [
        "Add a fifth Zone in the Zone Map and give it a Clip: the stripes add a band for it, and the grid becomes stripes to make room.",
        "Solo one Zone across the whole timeline: the same Pattern owns a band, then a cell."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "zone-layouts-reference",
        label: "Read about Zone Layouts"
      },
      defaultOpen: true
    },
    zonesOpenByDefault: true,
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      }
    ],
    reference: {
      summary: "Stripes and a 2 x 2 grid deal four constant voices around the Stage.",
      patternSlots: {
        instanceIds: [
          "garden"
        ]
      },
      examples: [
        {
          id: "example-full",
          label: "Full surface",
          detail: "One Zone owns the complete normalized Stage: the hero voice alone, before any partition exists.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:full"
          }
        },
        {
          id: "example-stripes",
          label: "Stripes",
          detail: "All four voices in equal position-based bands - the Layout the fixed-arity kinds fall back to when a Zone joins.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:stripes"
          }
        },
        {
          id: "example-grid",
          label: "Grid",
          detail: "One Zone per cell of a 2 x 2 grid; each cell receives its own complete normalized space.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:grid"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-zone-layouts-radial",
    name: "Zone Layouts: Radial",
    track: "portable",
    collection: "showcases",
    level: null,
    order: 19,
    lesson: "Zone Layouts: Radial",
    description: "Rings, a wave, and a pinwheel place the same two Patterns from the center outward. The bullseye alternates the two Patterns because rings take turns through the Zones.",
    note: {
      label: "Showcases",
      title: "Zone Layouts: Radial",
      purpose: "Rings, a wave, and a pinwheel place the same two Patterns from the center outward. The bullseye alternates the two Patterns because rings take turns through the Zones.",
      notice: "The move into the rings sweeps across the Stage so you can watch it happen; the wave and pinwheel switch in one step. Neither Pattern ever restarts: a Layout change moves pixels, not Patterns.",
      prompts: [
        "Select the Pinwheel chip and raise its Twist turns: the arms curl tighter while both Patterns keep playing.",
        "Give the Rings chip five rings: the bullseye gains bands without touching either Pattern."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "zone-layouts-reference",
        label: "Read about Zone Layouts"
      },
      defaultOpen: true
    },
    zonesOpenByDefault: true,
    patternSlots: [
      {
        instanceIds: [
          "garden"
        ]
      }
    ],
    reference: {
      summary: "Rings, a wave, and a pinwheel route two constant voices radially.",
      patternSlots: {
        instanceIds: [
          "garden"
        ]
      },
      examples: [
        {
          id: "example-full",
          label: "Full surface",
          detail: "One Zone owns the complete normalized Stage: the hero voice alone, before any partition exists.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:full"
          }
        },
        {
          id: "example-rings",
          label: "Rings",
          detail: "Three concentric rings cycle the two voices into a bullseye - and the one switch that sweeps in rather than restating the topology in a single step.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:rings"
          }
        },
        {
          id: "example-wave",
          label: "Wave",
          detail: "Bands displaced by a triangle wave, with amplitude, frequency, and phase as Layout parameters.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:wave"
          }
        },
        {
          id: "example-pinwheel",
          label: "Pinwheel",
          detail: "The peak: six twisted arms alternate the two voices, with arms, twist, and rotation as Layout parameters.",
          anchor: {
            kind: "chapter",
            markerId: "scene-marker:pinwheel"
          }
        }
      ]
    }
  },
  {
    id: "stock-show-showcase-redline-installation",
    name: "Redline Installation",
    track: "installation",
    collection: "installations",
    level: null,
    order: 1,
    lesson: "Redline Installation",
    description: "A sixty-second club installation: one hero panel and four target arrays driven as one rhythmic system.",
    note: {
      label: "Installations",
      title: "Redline Installation",
      purpose: "A sixty-second club installation: one hero panel and four target arrays driven as one rhythmic system.",
      notice: "One renderer owns each pixel. Shared target instances and cheap transforms create the differences between surfaces; the arc runs from black, through red pressure and white impacts with sparse cyan accents, to one cyan takeover.",
      prompts: [
        "Solo the four target Zones and compare their shared clock.",
        "Jump between the First drop, Vacuum, and Peak markers to compare how the five surfaces are used."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "ruthlessly-engineered-spectacle",
        label: "Read redline installation"
      },
      defaultOpen: true
    }
  },
  {
    id: "stock-show-remix-coronal-mass-ejection",
    legacySourceIds: [
      "teaser-cme-01"
    ],
    name: "Coronal Mass Ejection Remix",
    track: "portable",
    collection: "portable-shows",
    level: null,
    order: 1,
    lesson: "Coronal Mass Ejection",
    description: "One Pattern, 40 seconds. ZRanger1's Coronal Mass Ejection opens at half speed; rotation and spin accelerate together into brightness pulses on the beat, then everything slows to a stop and fades to black.",
    note: {
      label: "Portable Shows",
      title: "Coronal Mass Ejection",
      purpose: "One Pattern, 40 seconds. ZRanger1's Coronal Mass Ejection opens at half speed; rotation and spin accelerate together into brightness pulses on the beat, then everything slows to a stop and fades to black.",
      notice: "The Pattern is ZRanger1's Coronal Mass Ejection 2D, shipped as-is. Every motion beyond its own animation is choreography: speed, rotation, scale, and brightness Property tracks over one held Clip. Portable Shows are finished pieces rather than lessons; the tracks are the thing to read.",
      prompts: [
        "Scrub between the 24 s and 28 s markers: each brightness pulse lands on a beat, and the dips deepen as the spin accelerates.",
        "Drag the speed track's final keyframe up from zero and the full stop becomes a slow-motion ending."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "property-animation",
        label: "Read property animation"
      },
      defaultOpen: true
    }
  },
  {
    id: "stock-show-remix-quadrille",
    name: "Quadrille",
    track: "portable",
    collection: "portable-shows",
    level: null,
    order: 2,
    lesson: "Quadrille",
    description: "Two Patterns, four quarters, eight phrases at 75 BPM. ZRanger1's Wavy Bands is the base layer; Line Dancer 2D fades in and out over it on one repeating swell. The Stage folds into mirrored quarters and rejoins at the end; every quarter shows the same two live instances.",
    note: {
      label: "Portable Shows",
      title: "Quadrille",
      purpose: "Two Patterns, four quarters, eight phrases at 75 BPM. ZRanger1's Wavy Bands is the base layer; Line Dancer 2D fades in and out over it on one repeating swell. The Stage folds into mirrored quarters and rejoins at the end; every quarter shows the same two live instances.",
      notice: "Line Dancer's look follows one repeating swell between two states, a bloom and a lace, and every phrase advances it by exactly half a cycle, so phrases alternate between bloom-led and lace-led. Never more than two Pattern instances play: each quarter is a Viewport-framed placement, and the dancer is a chroma key on black over the bands.",
      prompts: [
        "Scrub toward any phrase boundary: the shimmer is Line Dancer's own detail, and each fade crosses it at the shared edge rate.",
        "Open the artifact inventory: two Patterns, one instance each, serve every quarter of the Stage."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "property-animation",
        label: "Read property animation"
      },
      defaultOpen: true
    }
  },
  {
    id: "stock-show-remix-overture",
    name: "Overture Installation",
    track: "installation",
    collection: "installations",
    level: null,
    order: 2,
    lesson: "Overture Installation",
    description: "Three grayscale Luma instances play a 1,000-LED proscenium at 128 BPM. Every light event follows the wiring: the marquee chases along the arch, the columns climb in canon, blooms spread down from the apex, and one cyan surge runs the installer's wiring order before the ghost light closes the Show.",
    note: {
      label: "Installations",
      title: "Overture Installation",
      purpose: "Three grayscale Luma instances play a 1,000-LED proscenium at 128 BPM. Every light event follows the wiring: the marquee chases along the arch, the columns climb in canon, blooms spread down from the apex, and one cyan surge runs the installer's wiring order before the ghost light closes the Show.",
      notice: "Every color is a placement tint over grayscale sources, and every reversal is a placement mirror along the Zone's wiring order, landing on bar lines. One rings surface provides the body, the apex bloom, and the closing ghost lamp through placement, scale, and Effects alone. There are no property tracks: the score only schedules ownership, and the Patterns carry the motion on bar-locked loops.",
      prompts: [
        "Watch the surge phrase: the bolt crosses column A, the stage, the arch, and column B in the exact order the installer wired them.",
        "Open any marquee placement: one instance serves the arch and both columns, in both colors and both directions of travel."
      ],
      guide: {
        documentId: "show-visual-toolkit",
        heading: "installation-output-and-physical-ranges",
        label: "Read installation mapping"
      },
      defaultOpen: true
    }
  }
]

export function stockShowCatalogueById(id: string): StockShowCatalogueEntry | undefined {
  return STOCK_SHOW_CATALOGUE.find((entry) => entry.id === id)
}
