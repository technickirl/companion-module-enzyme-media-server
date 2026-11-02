// The actions: each a table entry with its option fields and a `build` that
// turns the options into the OSC messages to send, so the tests can check
// the encoding without Companion. `getActionDefinitions` wraps them for the
// instance, and with the names the control socket gave, turns the fields
// that name a thing into dropdowns that still take typed text.

import * as C from './choices.js'
import { int, float, str, number, namePart, timelinePrefix, timeArgs, cueArg, parseArgs } from './osc.js'

const field = {
	timeline: {
		id: 'timeline',
		choices: 'timeline',
		type: 'textinput',
		label: 'Timeline',
		tooltip: 'Empty for the master timeline, else its number (from the left of the tab row) or its name',
		default: '',
	},
	layer: {
		id: 'layer',
		choices: 'layer',
		type: 'textinput',
		label: 'Layer',
		tooltip: 'Its place in the stack from 1 at the back, or its name',
		default: '1',
	},
	raster: {
		id: 'raster',
		choices: 'raster',
		type: 'textinput',
		label: 'Raster',
		tooltip: 'Its place in the Mappings list from 1, or its name',
		default: '1',
	},
	region: {
		id: 'region',
		choices: 'region',
		type: 'textinput',
		label: 'Region',
		tooltip:
			'Its place in the raster from 1 at the bottom, or its name. One picked from the list names its raster too, and the Raster field is then ignored',
		default: '1',
	},
	group: {
		id: 'group',
		type: 'textinput',
		label: 'Pixel group',
		tooltip: "Its place in the region's pixel map from 1, or its name",
		default: '1',
	},
	time: {
		id: 'time',
		type: 'textinput',
		label: 'Time',
		tooltip: "Seconds to fade over, 'snap' to set at once, or empty for the layer's Transition",
		default: '',
	},
	level: (id, label, def = 1) => ({ id, type: 'number', label, default: def, min: 0, max: 1, step: 0.01, range: true }),
	dropdown: (id, label, choices, def) => ({ id, type: 'dropdown', label, choices, default: def ?? choices[0].id }),
	number: (id, label, def, min, max, step) => ({ id, type: 'number', label, default: def, min, max, step }),
	text: (id, label, def, tooltip) => ({ id, type: 'textinput', label, default: def, tooltip }),
}

const layerAddress = (options, what) => `/layer/${namePart(options.layer) || '1'}/${what}`
/** A region picked from the dropdown comes as "raster/region" and names both. */
const regionAddress = (options, what) => {
	const m = /^\s*(\d+)\/(\d+)\s*$/.exec(String(options.region ?? ''))
	const raster = m ? m[1] : namePart(options.raster) || '1'
	const region = m ? m[2] : namePart(options.region) || '1'
	return `/raster/${raster}/region/${region}/${what}`
}
/** A "bank/tile" pick, else the two numbers given. */
const bankTile = (options) => {
	const m = /^\s*(\d+)\/(\d+)\s*$/.exec(String(options.pick ?? ''))
	return m ? [int(m[1]), int(m[2])] : [int(options.bank ?? options.folder), int(options.tile)]
}
const pickField = (id, label, tooltip) => ({
	id,
	type: 'dropdown',
	label,
	tooltip,
	baseChoices: [{ id: '', label: 'By the numbers below' }],
	default: '',
	disableAutoExpression: true,
})
const byNumbers = (id) => `$(options:${id}) == ""`
const groupAddress = (options, what) => `${regionAddress(options, 'group')}/${namePart(options.group) || '1'}/${what}`

const onOff = (choice) => (choice === 'off' ? 0 : 1)

/** `on`, `off`, or the opposite of what is known (else on). */
function resolveToggle(choice, known) {
	if (choice === 'toggle') return known === 1 || known === true ? 0 : known === 0 || known === false ? 1 : 1
	return onOff(choice)
}

const ACTIONS = {
	transport: {
		name: 'Transport',
		description: 'Go, Pause, Stop, Reset, Hold, Skip, Go next, Go previous, sections and the timecode lock',
		options: [field.dropdown('command', 'Command', C.TRANSPORT_COMMANDS), field.timeline],
		build: (o, ctx) => {
			let command = o.command
			// Pause while playing, Go while paused: one key pauses and resumes,
			// as the shell's Pause does. Held or unknown, nothing is sent, as
			// the shell greys its Pause then.
			if (command === 'play_pause') {
				const word = ctx.word(o.timeline)
				if (word === 'play' || word === 'chase') command = 'pause'
				else if (word === 'stop') command = 'go'
				else {
					ctx.log?.('debug', `pause / resume: the timeline is ${word ?? 'unknown'}, nothing sent`)
					return []
				}
			}
			return [{ address: `${timelinePrefix(o.timeline)}/transport/${command}`, args: [] }]
		},
	},
	cue_go: {
		name: 'Fire cue',
		options: [
			{ ...field.text('cue', 'Cue', '1', 'The cue by its number (3, or 1.5) or its name'), choices: 'cue' },
			field.timeline,
		],
		build: (o) => [{ address: `${timelinePrefix(o.timeline)}/cue/go`, args: [cueArg(o.cue)] }],
	},
	locate: {
		name: 'Locate',
		options: [field.text('timecode', 'Timecode', '00:00:00:00', "In the timeline's own timecode"), field.timeline],
		build: (o) => [{ address: `${timelinePrefix(o.timeline)}/locate`, args: [str(String(o.timecode ?? '').trim())] }],
	},
	chase_mode: {
		name: 'Chase mode',
		description: 'How the timeline follows timecode',
		options: [field.dropdown('mode', 'Mode', C.CHASE_MODES), field.timeline],
		build: (o) => [{ address: `${timelinePrefix(o.timeline)}/chase/${o.mode}`, args: [] }],
	},
	blackout: {
		name: 'Blackout',
		description: 'Toggle uses the state reported at the Full status level when known, else the last one sent',
		options: [field.dropdown('state', 'Blackout', C.ON_OFF_TOGGLE)],
		build: (o, ctx) => {
			const value = resolveToggle(o.state, ctx.known('blackout'))
			ctx.remember('blackout', value)
			return [{ address: '/show/blackout', args: [int(value)] }]
		},
	},
	master_level: {
		name: 'Master level',
		options: [field.level('level', 'Level', 1)],
		build: (o) => [{ address: '/show/master', args: [float(o.level)] }],
	},
	mode: {
		name: 'Mode',
		options: [field.dropdown('mode', 'Mode', C.MODES)],
		build: (o) => [{ address: '/show/mode', args: [str(o.mode)] }],
	},
	override: {
		name: 'Override',
		description: 'Hands every layer to one owner, or gives each back its own',
		options: [field.dropdown('owner', 'Override', C.OVERRIDES)],
		build: (o) => [{ address: '/show/override', args: [str(o.owner)] }],
	},
	audio_master: {
		name: 'Audio master level',
		options: [field.level('level', 'Level', 1)],
		build: (o) => [{ address: '/audio/master', args: [float(o.level)] }],
	},
	audio_mute: {
		name: 'Audio mute',
		description: 'Toggle uses the last state this module sent, as Enzyme does not report it',
		options: [field.dropdown('state', 'Mute', C.ON_OFF_TOGGLE)],
		build: (o, ctx) => {
			const value = resolveToggle(o.state, ctx.known('audio_mute'))
			ctx.remember('audio_mute', value)
			return [{ address: '/audio/mute', args: [int(value)] }]
		},
	},
	audio_bus_level: {
		name: 'Audio bus level',
		options: [field.number('bus', 'Bus (1 to 8)', 1, 1, 8, 1), field.level('level', 'Level', 1)],
		build: (o) => [{ address: `/audio/bus/${int(o.bus).value}/level`, args: [float(o.level)] }],
	},
	audio_bus_mute: {
		name: 'Audio bus mute',
		options: [field.number('bus', 'Bus (1 to 8)', 1, 1, 8, 1), field.dropdown('state', 'Mute', C.ON_OFF)],
		build: (o) => [{ address: `/audio/bus/${int(o.bus).value}/mute`, args: [int(onOff(o.state))] }],
	},
	layer_owner: {
		name: 'Layer: owner',
		options: [
			field.layer,
			{ ...field.dropdown('owner', 'Owner', C.OWNERS), disableAutoExpression: true },
			{
				...field.timeline,
				tooltip: 'For a timeline owner: empty for the master, else the timeline by number or name',
				isVisibleExpression: '$(options:owner) == "timeline"',
			},
		],
		build: (o) => {
			const args = [str(o.owner)]
			const tl = String(o.timeline ?? '').trim()
			if (o.owner === 'timeline' && tl !== '') args.push(/^\d+$/.test(tl) ? int(tl) : str(tl))
			return [{ address: layerAddress(o, 'owner'), args }]
		},
	},
	layer_play_mode: {
		name: 'Layer: play mode',
		options: [field.layer, field.dropdown('mode', 'Play mode', C.PLAY_MODES, 'play')],
		build: (o) => [{ address: layerAddress(o, 'play_mode'), args: [str(o.mode)] }],
	},
	layer_media: {
		name: 'Layer: media',
		description: 'The clip by the folder and tile numbers shown in Media',
		options: [
			field.layer,
			{ ...pickField('pick', 'Tile', 'A media tile by name, once the engine has sent them'), choices: 'media' },
			{ ...field.number('folder', 'Folder', 1, 0, 65535, 1), isVisibleExpression: byNumbers('pick') },
			{ ...field.number('tile', 'Tile', 1, 1, 65535, 1), isVisibleExpression: byNumbers('pick') },
		],
		build: (o) => [{ address: layerAddress(o, 'media'), args: bankTile(o) }],
	},
	layer_generator: {
		name: 'Layer: generator',
		options: [
			field.layer,
			{ ...pickField('pick', 'Tile', 'A generator tile by name, once the engine has sent them'), choices: 'generator' },
			{ ...field.number('folder', 'Folder', 1, 0, 65535, 1), isVisibleExpression: byNumbers('pick') },
			{ ...field.number('tile', 'Tile', 1, 1, 65535, 1), isVisibleExpression: byNumbers('pick') },
		],
		build: (o) => [{ address: layerAddress(o, 'generator'), args: bankTile(o) }],
	},
	layer_effect: {
		name: 'Layer: effect',
		options: [
			field.layer,
			field.number('folder', 'Folder', 1, 0, 65535, 1),
			field.number('tile', 'Tile', 1, 1, 65535, 1),
		],
		build: (o) => [{ address: layerAddress(o, 'effect'), args: [int(o.folder), int(o.tile)] }],
	},
	layer_mapping: {
		name: 'Layer: mapping',
		options: [field.layer, field.number('mapping', "Mapping number (0 for the layer's own)", 0, 0, 65535, 1)],
		build: (o) => [{ address: layerAddress(o, 'mapping'), args: [int(o.mapping)] }],
	},
	layer_blend: {
		name: 'Layer: blend mode',
		options: [field.layer, field.dropdown('blend', 'Blend', C.BLENDS)],
		build: (o) => [{ address: layerAddress(o, 'blend'), args: [str(o.blend)] }],
	},
	layer_key_mode: {
		name: 'Layer: key mode',
		options: [field.layer, field.dropdown('mode', 'Key', C.KEY_MODES)],
		build: (o) => [{ address: layerAddress(o, 'key_mode'), args: [str(o.mode)] }],
	},
	layer_transition_time: {
		name: 'Layer: transition time',
		options: [field.layer, field.text('time', 'Time', '1', "Seconds, or text as the strip takes it: '2s 12f'")],
		build: (o) => {
			const t = String(o.time ?? '').trim()
			const n = Number(t)
			return [
				{ address: layerAddress(o, 'transition_time'), args: [t !== '' && Number.isFinite(n) ? float(n) : str(t)] },
			]
		},
	},
	layer_transition_type: {
		name: 'Layer: transition type',
		options: [field.layer, field.dropdown('kind', 'Transition', C.TRANSITION_TYPES, 'dissolve')],
		build: (o) => [{ address: layerAddress(o, 'transition_type'), args: [str(o.kind)] }],
	},
	layer_in_point: {
		name: 'Layer: in point',
		options: [field.layer, field.text('timecode', 'Timecode', '00:00:00:00')],
		build: (o) => [{ address: layerAddress(o, 'in_point'), args: [str(String(o.timecode ?? '').trim())] }],
	},
	layer_out_point: {
		name: 'Layer: out point',
		options: [field.layer, field.text('timecode', 'Timecode', '00:00:00:00')],
		build: (o) => [{ address: layerAddress(o, 'out_point'), args: [str(String(o.timecode ?? '').trim())] }],
	},
	layer_position: {
		name: 'Layer: position',
		description: 'Locates in the clip',
		options: [field.layer, field.text('timecode', 'Timecode', '00:00:00:00')],
		build: (o) => [{ address: layerAddress(o, 'position'), args: [str(String(o.timecode ?? '').trim())] }],
	},
	layer_param: {
		name: 'Layer: set a value',
		description: 'One parameter, over the time given or the layer’s Transition',
		options: [
			field.layer,
			field.dropdown('param', 'Parameter', C.LAYER_PARAMS, 'opacity'),
			field.number('value', 'Value', 1, -32768, 32767, 0.01),
			field.time,
		],
		build: (o) => [{ address: layerAddress(o, o.param), args: [float(o.value), ...timeArgs(o.time)] }],
	},
	layer_colour: {
		name: 'Layer: colour',
		options: [
			field.layer,
			field.dropdown('form', 'Form', C.COLOUR_FORMS),
			field.number('a', 'Red, hue or x', 1, 0, 360, 0.01),
			field.number('b', 'Green, saturation or y', 1, 0, 2, 0.01),
			field.number('c', 'Blue or intensity', 1, 0, 2, 0.01),
			field.time,
		],
		build: (o) => [
			{ address: layerAddress(o, `colour/${o.form}`), args: [float(o.a), float(o.b), float(o.c), ...timeArgs(o.time)] },
		],
	},
	layer_sweep: {
		name: 'Layer: sweep a value',
		description: 'Sweeps a generator or effect value between two levels',
		options: [
			field.layer,
			field.dropdown('kind', 'Value', C.SWEEP_KINDS),
			field.number('slot', 'Value number (1 to 16)', 1, 1, 16, 1),
			{ ...field.dropdown('shape', 'Shape', C.SWEEP_SHAPES), disableAutoExpression: true },
			{ ...field.number('from', 'From', 0, 0, 1, 0.01), isVisibleExpression: '$(options:shape) != "off"' },
			{ ...field.number('to', 'To', 1, 0, 1, 0.01), isVisibleExpression: '$(options:shape) != "off"' },
			{
				...field.number('seconds', 'Seconds per sweep', 2, 0, 86400, 0.1),
				isVisibleExpression: '$(options:shape) != "off"',
			},
		],
		build: (o) => {
			const address = layerAddress(o, `${o.kind}_${int(o.slot).value}/sweep`)
			if (o.shape === 'off') return [{ address, args: [str('off')] }]
			return [{ address, args: [float(o.from), float(o.to), float(o.seconds), str(o.shape)] }]
		},
	},
	region_look: {
		name: 'Region: set a value',
		description: 'Intensity, opacity, a colour gain, kelvin, tint and the rest of a region’s look',
		options: [
			field.raster,
			field.region,
			field.dropdown('param', 'Value', C.REGION_PARAMS, 'intensity'),
			field.number('value', 'Value', 1, -1, 12000, 0.01),
		],
		build: (o) => [{ address: regionAddress(o, o.param), args: [float(o.value)] }],
	},
	region_colour: {
		name: 'Region: colour',
		options: [
			field.raster,
			field.region,
			field.dropdown('form', 'Form', C.COLOUR_FORMS),
			field.number('a', 'Red, hue or x', 1, 0, 360, 0.01),
			field.number('b', 'Green, saturation or y', 1, 0, 2, 0.01),
			field.number('c', 'Blue or intensity', 1, 0, 2, 0.01),
		],
		build: (o) => [{ address: regionAddress(o, `colour/${o.form}`), args: [float(o.a), float(o.b), float(o.c)] }],
	},
	region_release: {
		name: 'Region: release',
		description: 'The saved look back, all of it or one value',
		options: [field.raster, field.region, field.dropdown('what', 'Release', C.RELEASE_CHOICES(C.REGION_PARAMS), 'all')],
		build: (o) => [{ address: regionAddress(o, 'release'), args: o.what === 'all' ? [] : [str(o.what)] }],
	},
	group_look: {
		name: 'Pixel group: set a value',
		options: [
			field.raster,
			field.region,
			field.group,
			field.dropdown('param', 'Value', C.GROUP_PARAMS, 'intensity'),
			field.number('value', 'Value', 1, -1, 12000, 0.01),
		],
		build: (o) => [{ address: groupAddress(o, o.param), args: [float(o.value)] }],
	},
	group_release: {
		name: 'Pixel group: release',
		options: [
			field.raster,
			field.region,
			field.group,
			field.dropdown('what', 'Release', C.RELEASE_CHOICES(C.GROUP_PARAMS), 'all'),
		],
		build: (o) => [{ address: groupAddress(o, 'release'), args: o.what === 'all' ? [] : [str(o.what)] }],
	},
	recall: {
		name: 'Recall',
		description: 'Fires a manual recall by its bank and tile',
		options: [
			{ ...pickField('pick', 'Recall', 'A stored recall by name, once the engine has sent them'), choices: 'recall' },
			{ ...field.number('bank', 'Bank', 1, 0, 65535, 1), isVisibleExpression: byNumbers('pick') },
			{ ...field.number('tile', 'Tile', 1, 1, 65535, 1), isVisibleExpression: byNumbers('pick') },
		],
		build: (o) => [{ address: '/recall', args: bankTile(o) }],
	},
	// Takes, for film work (experimental; engines from 2 November 2026).
	take: {
		name: 'Take (experimental)',
		description:
			'Records a take: every timeline in takes, whole, the region looks and a manual recall in the day’s Slates bank. Show, Takes must be on in the engine. Works in Live mode',
		options: [
			{
				...field.text(
					'slate',
					'Slate',
					'',
					'The slate, as text (42A-3) or a number; empty, the engine names it Take N for the day',
				),
				useVariables: true,
			},
		],
		build: (o) => {
			const slate = String(o.slate ?? '').trim()
			return [{ address: '/take', args: slate === '' ? [] : [str(slate)] }]
		},
	},
	take_restore: {
		name: 'Take: restore (experimental)',
		description:
			'Puts a take back: every timeline it holds, one timeline whole, or one layer’s track on it. An edit, refused by the engine in Live mode',
		options: [
			{ ...field.text('slate', 'Slate', '', 'The slate of the take to put back'), useVariables: true },
			{
				...field.timeline,
				tooltip: 'Empty for every timeline the take holds, else one by its number or its name',
			},
			{
				...field.layer,
				default: '',
				tooltip:
					'Empty for the whole timeline, else one layer’s track on it, by its place from 1 at the back or its name',
			},
		],
		build: (o, ctx) => {
			const slate = String(o.slate ?? '').trim()
			if (slate === '') {
				ctx.log?.('warn', 'take restore: no slate given, nothing sent')
				return []
			}
			const nameOrNumber = (text) => (/^\d+$/.test(text) ? int(text) : str(text))
			const args = [str(slate)]
			const timeline = String(o.timeline ?? '').trim()
			const layer = String(o.layer ?? '').trim()
			// The engine takes the layer after the timeline, so a layer's
			// track needs its timeline named.
			if (layer !== '' && timeline === '') {
				ctx.log?.('warn', 'take restore: a layer needs its timeline named, nothing sent')
				return []
			}
			if (timeline !== '') args.push(nameOrNumber(timeline))
			if (layer !== '') args.push(nameOrNumber(layer))
			return [{ address: '/take/restore', args }]
		},
	},
	take_regions: {
		name: 'Take: region looks live (experimental)',
		description: 'Sets the region looks a take holds, live, as a desk would. Any mode',
		options: [{ ...field.text('slate', 'Slate', '', 'The slate of the take whose looks to set'), useVariables: true }],
		build: (o, ctx) => {
			const slate = String(o.slate ?? '').trim()
			if (slate === '') {
				ctx.log?.('warn', 'take region looks: no slate given, nothing sent')
				return []
			}
			return [{ address: '/take/regions', args: [str(slate)] }]
		},
	},
	setlist_row_go: {
		name: 'Set list: go on a row',
		options: [
			{ ...field.number('row', 'Row', 1, 1, 65535, 1), choices: 'row' },
			field.dropdown('view', 'View', C.SETLIST_VIEW),
		],
		build: (o) => [
			{
				address: `/setlist/row/${int(o.row).value}/go`,
				args: o.view === 'default' ? [] : [int(o.view === 'yes' ? 1 : 0)],
			},
		],
	},
	setlist_row_skip: {
		name: 'Set list: skip a row',
		options: [
			{ ...field.number('row', 'Row', 1, 1, 65535, 1), choices: 'row' },
			field.dropdown('skip', 'Skip', C.ON_OFF),
		],
		build: (o) => [{ address: `/setlist/row/${int(o.row).value}/skip`, args: [int(onOff(o.skip))] }],
	},
	setlist_step: {
		name: 'Set list: next or previous',
		options: [field.dropdown('step', 'Step', C.SETLIST_STEPS)],
		build: (o) => [{ address: `/setlist/${o.step}`, args: [] }],
	},
	custom_osc: {
		name: 'Send custom OSC',
		description:
			'Any address Enzyme knows; whole numbers go as ints, decimals as floats, the rest as text (quote to force text)',
		options: [
			field.text('address', 'Address', '/ping', 'Starts with a slash'),
			field.text('args', 'Arguments', '', 'Separated by spaces, for example: 0.5 snap'),
		],
		build: (o) => {
			let address = String(o.address ?? '').trim()
			if (address === '') return []
			if (!address.startsWith('/')) address = `/${address}`
			return [{ address, args: parseArgs(o.args) }]
		},
	},
}

/** Builds an action's messages from its options, as the instance does. */
function buildAction(id, options, ctx = nullContext()) {
	const action = ACTIONS[id]
	if (!action) throw new Error(`no action ${id}`)
	return action.build(options, ctx)
}

/** A context that knows nothing, for tests and defaults. */
function nullContext(state = null) {
	const remembered = {}
	return {
		known: (key) => remembered[key],
		remember: (key, value) => {
			remembered[key] = value
		},
		// The timeline's transport word from the status, for pause / resume.
		word: (timeline) => {
			const n = state?.timelineNumber(timeline)
			return n === null || n === undefined ? undefined : state.timelineValue(n, 'transport')
		},
		log: null,
	}
}

/**
 * A field as Companion gets it: one marked `choices` becomes a dropdown
 * that still takes typed text when the show has given names for it; a
 * pick dropdown gets the names after "by the numbers". Without names the
 * field is as defined. `choices` maps a kind (timeline, cue, layer, raster,
 * region, media, generator, recall, row) to its dropdown choices.
 */
function withChoices(field, choices) {
	if (typeof field.choices !== 'string') return field
	const { choices: kind, baseChoices, ...rest } = field
	const list = choices?.[kind] ?? []
	if (rest.type === 'dropdown') return { ...rest, choices: [...(baseChoices ?? []), ...list] }
	if (list.length === 0) return rest
	const { regex, min, max, step, range, ...plain } = rest
	void regex
	void min
	void max
	void step
	void range
	// Choice ids are strings, so a number field's default becomes one too, or it would show as a custom value.
	const def = plain.default === undefined || plain.default === null ? '' : String(plain.default)
	return { ...plain, type: 'dropdown', choices: list, default: def, allowCustom: true }
}

function getActionDefinitions(self, choices = null) {
	const definitions = {}
	for (const [id, action] of Object.entries(ACTIONS)) {
		definitions[id] = {
			name: action.name,
			description: action.description,
			options: action.options.map((f) => withChoices(f, choices)),
			callback: async (event) => {
				const messages = action.build(event.options, self.actionContext())
				self.sendMessages(messages)
			},
		}
	}
	return definitions
}

export { ACTIONS, buildAction, nullContext, getActionDefinitions, withChoices, number }
