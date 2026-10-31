// The dropdown choices, shared by the actions, the feedbacks and the presets.
// Ids are what Enzyme takes on the wire, so a choice can go straight into
// an argument.

const TRANSPORT_COMMANDS = [
	{ id: 'go', label: 'Go' },
	{ id: 'pause', label: 'Pause' },
	{ id: 'stop', label: 'Stop' },
	{ id: 'reset', label: 'Reset' },
	{ id: 'hold', label: 'Hold' },
	{ id: 'skip_forward', label: 'Skip forward' },
	{ id: 'skip_back', label: 'Skip back' },
	{ id: 'go_next', label: 'Go next' },
	{ id: 'go_previous', label: 'Go previous' },
	{ id: 'section_next', label: 'Section next' },
	{ id: 'section_previous', label: 'Section previous' },
	{ id: 'tc_lock', label: 'TC lock' },
	{ id: 'tc_release', label: 'TC release' },
]

// What /status/transport says.
const TRANSPORT_STATES = [
	{ id: 'play', label: 'Playing' },
	{ id: 'hold', label: 'Holding' },
	{ id: 'chase', label: 'Chasing timecode' },
	{ id: 'stop', label: 'Stopped' },
]

const CHASE_MODES = [
	{ id: 'per_section', label: 'Per section' },
	{ id: 'force_chase', label: 'Force chase' },
	{ id: 'force_free_run', label: 'Force free run' },
]

const ON_OFF_TOGGLE = [
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
	{ id: 'toggle', label: 'Toggle' },
]

const ON_OFF = [
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
]

const MODES = [
	{ id: 'show', label: 'Show' },
	{ id: 'edit', label: 'Edit' },
]

const OVERRIDES = [
	{ id: 'off', label: 'Off' },
	{ id: 'timeline', label: 'Timeline' },
	{ id: 'dmx', label: 'DMX' },
	{ id: 'manual', label: 'Manual' },
]

const OWNERS = [
	{ id: 'timeline', label: 'Timeline' },
	{ id: 'dmx', label: 'DMX' },
	{ id: 'manual', label: 'Manual' },
]

// What /layer/N/play_mode takes.
const PLAY_MODES = [
	{ id: 'stop', label: 'Stop' },
	{ id: 'play', label: 'Play' },
	{ id: 'loop', label: 'Loop' },
	{ id: 'pause', label: 'Pause' },
	{ id: 'hold', label: 'Hold' },
	{ id: 'scrub', label: 'Scrub' },
	{ id: 'play_retrigger', label: 'Play (retrigger)' },
	{ id: 'loop_retrigger', label: 'Loop (retrigger)' },
	{ id: 'timecode', label: 'Timecode' },
]

// What /status/layer/N/play_mode says: the same, with Hold as hold_last.
const PLAY_MODE_STATES = PLAY_MODES.map((m) => (m.id === 'hold' ? { id: 'hold_last', label: 'Hold' } : m))

const KEY_MODES = [
	{ id: 'off', label: 'Off' },
	{ id: 'luma', label: 'Luma' },
	{ id: 'chroma', label: 'Chroma' },
]

const BLENDS = [
	{ id: 'normal', label: 'Normal' },
	{ id: 'add', label: 'Add' },
	{ id: 'screen', label: 'Screen' },
	{ id: 'multiply', label: 'Multiply' },
]

const TRANSITION_TYPES = [
	{ id: 'cut', label: 'Cut' },
	{ id: 'dissolve', label: 'Dissolve' },
	{ id: 'dip', label: 'Dip to black' },
	{ id: 'generator', label: 'Generator' },
]

// A layer's parameters, with their ranges, for the generic set action.
const LAYER_PARAMS = [
	{ id: 'opacity', label: 'Opacity (0 to 1)', min: 0, max: 1 },
	{ id: 'speed', label: 'Speed (-4 to 4, 1 normal)', min: -4, max: 4 },
	{ id: 'position_x', label: 'Position X (pixels)', min: -32768, max: 32767 },
	{ id: 'position_y', label: 'Position Y (pixels)', min: -32768, max: 32767 },
	{ id: 'scale', label: 'Scale (-10 to 10, 1 full size)', min: -10, max: 10 },
	{ id: 'aspect_x', label: 'Aspect X (-10 to 10)', min: -10, max: 10 },
	{ id: 'aspect_y', label: 'Aspect Y (-10 to 10)', min: -10, max: 10 },
	{ id: 'rotation', label: 'Rotation (degrees, -180 to 180)', min: -180, max: 180 },
	{ id: 'crop_left', label: 'Crop left (0 to 1)', min: 0, max: 1 },
	{ id: 'crop_right', label: 'Crop right (0 to 1)', min: 0, max: 1 },
	{ id: 'crop_top', label: 'Crop top (0 to 1)', min: 0, max: 1 },
	{ id: 'crop_bottom', label: 'Crop bottom (0 to 1)', min: 0, max: 1 },
	{ id: 'brightness', label: 'Brightness (-1 to 1)', min: -1, max: 1 },
	{ id: 'contrast', label: 'Contrast (0 to 2)', min: 0, max: 2 },
	{ id: 'gamma', label: 'Gamma (0.2 to 5)', min: 0.2, max: 5 },
	{ id: 'red_gain', label: 'Red gain (0 to 2)', min: 0, max: 2 },
	{ id: 'green_gain', label: 'Green gain (0 to 2)', min: 0, max: 2 },
	{ id: 'blue_gain', label: 'Blue gain (0 to 2)', min: 0, max: 2 },
	{ id: 'mask_left', label: 'Mask left (0 to 1)', min: 0, max: 1 },
	{ id: 'mask_right', label: 'Mask right (0 to 1)', min: 0, max: 1 },
	{ id: 'mask_top', label: 'Mask top (0 to 1)', min: 0, max: 1 },
	{ id: 'mask_bottom', label: 'Mask bottom (0 to 1)', min: 0, max: 1 },
	{ id: 'mask_feather', label: 'Mask feather (0 to 1)', min: 0, max: 1 },
	{ id: 'mask_feather_gamma', label: 'Mask feather gamma (0.2 to 5)', min: 0.2, max: 5 },
	{ id: 'key_hue', label: 'Key hue (0 to 360)', min: 0, max: 360 },
	{ id: 'key_threshold', label: 'Key threshold (0 to 1)', min: 0, max: 1 },
	{ id: 'key_softness', label: 'Key softness (0 to 1)', min: 0, max: 1 },
	{ id: 'blur', label: 'Blur (0 to 1)', min: 0, max: 1 },
	{ id: 'audio_level', label: 'Audio level (0 to 1)', min: 0, max: 1 },
]
for (let k = 1; k <= 16; k++) {
	LAYER_PARAMS.push({ id: `generator_${k}`, label: `Generator value ${k} (0 to 1)`, min: 0, max: 1 })
}
for (let k = 1; k <= 16; k++) {
	LAYER_PARAMS.push({ id: `effect_${k}`, label: `Effect value ${k} (0 to 1)`, min: 0, max: 1 })
}

const COLOUR_FORMS = [
	{ id: 'rgb', label: 'RGB (each 0 to 2)' },
	{ id: 'hsi', label: 'HSI (hue 0 to 360, saturation 0 to 1, intensity 0 to 2)' },
	{ id: 'xy', label: 'xy (x, y, intensity)' },
]

const SWEEP_KINDS = [
	{ id: 'generator', label: 'Generator value' },
	{ id: 'effect', label: 'Effect value' },
]

const SWEEP_SHAPES = [
	{ id: 'loop', label: 'Loop' },
	{ id: 'bounce', label: 'Bounce' },
	{ id: 'once', label: 'Once' },
	{ id: 'off', label: 'Off (stop the sweep)' },
]

const REGION_PARAMS = [
	{ id: 'intensity', label: 'Intensity (0 to 1)', min: 0, max: 1 },
	{ id: 'opacity', label: 'Opacity (0 to 1)', min: 0, max: 1 },
	{ id: 'red', label: 'Red (0 to 1)', min: 0, max: 1 },
	{ id: 'green', label: 'Green (0 to 1)', min: 0, max: 1 },
	{ id: 'blue', label: 'Blue (0 to 1)', min: 0, max: 1 },
	{ id: 'brightness', label: 'Brightness (-1 to 1)', min: -1, max: 1 },
	{ id: 'contrast', label: 'Contrast (0 to 2)', min: 0, max: 2 },
	{ id: 'gamma', label: 'Gamma (0.2 to 5)', min: 0.2, max: 5 },
	{ id: 'kelvin', label: 'Kelvin (2000 to 12000)', min: 2000, max: 12000 },
	{ id: 'tint', label: 'Tint (-1 to 1)', min: -1, max: 1 },
]

const GROUP_PARAMS = [
	{ id: 'intensity', label: 'Intensity (0 to 1)', min: 0, max: 1 },
	{ id: 'kelvin', label: 'Kelvin (2000 to 12000)', min: 2000, max: 12000 },
	{ id: 'tint', label: 'Tint (-1 to 1)', min: -1, max: 1 },
]

const RELEASE_CHOICES = (params) => [
	{ id: 'all', label: 'The whole look' },
	...params.map((p) => ({ id: p.id, label: p.label })),
]

const STATUS_LEVELS = [
	{ id: 'light', label: 'Light (transport, cues, timecode, recalls, set list)' },
	{ id: 'full', label: 'Full (adds show state and every layer; hundreds of messages a second)' },
]

const SETLIST_VIEW = [
	{ id: 'default', label: "The row's own setting" },
	{ id: 'yes', label: 'Bring its timeline to view' },
	{ id: 'no', label: 'Leave the view as it is' },
]

const SETLIST_STEPS = [
	{ id: 'next', label: 'Next row' },
	{ id: 'previous', label: 'Previous row' },
]

const CONNECTED_WHICH = [
	{ id: 'any', label: 'Either engine (the one status comes from)' },
	{ id: 'primary', label: 'The primary engine' },
	{ id: 'backup', label: 'The backup engine' },
]

export {
	TRANSPORT_COMMANDS,
	TRANSPORT_STATES,
	CHASE_MODES,
	ON_OFF_TOGGLE,
	ON_OFF,
	MODES,
	OVERRIDES,
	OWNERS,
	PLAY_MODES,
	PLAY_MODE_STATES,
	KEY_MODES,
	BLENDS,
	TRANSITION_TYPES,
	LAYER_PARAMS,
	COLOUR_FORMS,
	SWEEP_KINDS,
	SWEEP_SHAPES,
	REGION_PARAMS,
	GROUP_PARAMS,
	RELEASE_CHOICES,
	STATUS_LEVELS,
	SETLIST_VIEW,
	SETLIST_STEPS,
	CONNECTED_WHICH,
}
