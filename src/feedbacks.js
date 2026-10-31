// The feedbacks: boolean, each a table entry with its options and a `check`
// over the engine state, so the tests can drive them without Companion.
// `keys` names the state that moves each one, so a batch of status only
// re-checks the feedbacks it touched.

const { combineRgb } = require('@companion-module/base')
const C = require('./choices')

const GREEN = { bgcolor: combineRgb(0, 140, 0), color: combineRgb(255, 255, 255) }
const RED = { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) }
const AMBER = { bgcolor: combineRgb(200, 120, 0), color: combineRgb(0, 0, 0) }
const BLUE = { bgcolor: combineRgb(0, 80, 200), color: combineRgb(255, 255, 255) }

const timelineField = {
	id: 'timeline',
	type: 'textinput',
	label: 'Timeline',
	tooltip: 'Empty for the master, else its number or (with more than one timeline) its name',
	default: '',
}
const layerField = {
	id: 'layer',
	type: 'number',
	label: 'Layer (from 1 at the back)',
	default: 1,
	min: 1,
	max: 999,
	step: 1,
}
const dropdown = (id, label, choices, def) => ({ id, type: 'dropdown', label, choices, default: def ?? choices[0].id })

/** Cues compare as numbers when both read as one, else as text. */
function sameCue(a, b) {
	const x = String(a ?? '').trim()
	const y = String(b ?? '').trim()
	if (x === '' || y === '') return x === y
	const nx = Number(x)
	const ny = Number(y)
	if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny
	return x.toLowerCase() === y.toLowerCase()
}

const FEEDBACKS = {
	transport_is: {
		name: 'Transport state',
		description: 'The timeline is playing, holding, chasing or stopped',
		style: GREEN,
		options: [dropdown('state', 'State', C.TRANSPORT_STATES, 'play'), timelineField],
		keys: ['transport'],
		check: (o, state) => {
			const n = state.timelineNumber(o.timeline)
			return n !== null && state.timelineValue(n, 'transport') === o.state
		},
	},
	cue_is: {
		name: 'Current cue',
		style: GREEN,
		options: [{ id: 'cue', type: 'textinput', label: 'Cue number', default: '1' }, timelineField],
		keys: ['cue'],
		check: (o, state) => {
			const n = state.timelineNumber(o.timeline)
			return n !== null && sameCue(state.timelineValue(n, 'cue'), o.cue)
		},
	},
	next_cue_is: {
		name: 'Next cue',
		style: AMBER,
		options: [{ id: 'cue', type: 'textinput', label: 'Cue number', default: '2' }, timelineField],
		keys: ['next_cue'],
		check: (o, state) => {
			const n = state.timelineNumber(o.timeline)
			return n !== null && sameCue(state.timelineValue(n, 'next_cue'), o.cue)
		},
	},
	section_is: {
		name: 'Section number',
		description: "The master timeline's section",
		style: BLUE,
		options: [{ id: 'section', type: 'number', label: 'Section', default: 1, min: 0, max: 9999, step: 1 }],
		keys: ['section_number'],
		check: (o, state) => state.get('section_number') === Number(o.section),
	},
	blackout_on: {
		name: 'Blackout on',
		description: 'Needs the Full status level',
		style: RED,
		options: [],
		keys: ['blackout'],
		check: (o, state) => state.get('blackout') === 1,
	},
	mode_is: {
		name: 'Mode',
		description: 'Show or Edit mode; needs the Full status level',
		style: GREEN,
		options: [dropdown('mode', 'Mode', C.MODES, 'show')],
		keys: ['mode'],
		check: (o, state) => state.get('mode') === o.mode,
	},
	override_is: {
		name: 'Override',
		description: 'Needs the Full status level',
		style: AMBER,
		options: [dropdown('owner', 'Override', C.OVERRIDES, 'off')],
		keys: ['override'],
		check: (o, state) => state.get('override') === o.owner,
	},
	timeline_is_master: {
		name: 'Timeline is the master',
		description: 'Reported only when the show has more than one timeline',
		style: BLUE,
		options: [{ id: 'timeline', type: 'number', label: 'Timeline number', default: 1, min: 1, max: 999, step: 1 }],
		keys: ['timeline_master'],
		check: (o, state) => state.get(`timeline_${Number(o.timeline)}_master`) === 1,
	},
	connected: {
		name: 'Connected to the engine',
		style: GREEN,
		options: [dropdown('which', 'Engine', C.CONNECTED_WHICH, 'any')],
		keys: ['connection'],
		check: (o, state, connection) => {
			if (!connection) return false
			if (o.which === 'primary') return connection.hosts[0]?.up === true
			if (o.which === 'backup') return connection.hosts[1]?.up === true
			return connection.live >= 0
		},
	},
	setlist_row_is: {
		name: 'Current set list row',
		style: GREEN,
		options: [{ id: 'row', type: 'number', label: 'Row', default: 1, min: 0, max: 9999, step: 1 }],
		keys: ['setlist_row'],
		check: (o, state) => state.get('setlist_row') === Number(o.row),
	},
	recall_was: {
		name: 'Last recall fired',
		style: GREEN,
		options: [
			{ id: 'bank', type: 'number', label: 'Bank', default: 1, min: 0, max: 65535, step: 1 },
			{ id: 'tile', type: 'number', label: 'Tile', default: 1, min: 1, max: 65535, step: 1 },
		],
		keys: ['recall_bank', 'recall_tile'],
		check: (o, state) => state.get('recall_bank') === Number(o.bank) && state.get('recall_tile') === Number(o.tile),
	},
	layer_owner_is: {
		name: 'Layer owner',
		description: 'Needs the Full status level',
		style: BLUE,
		options: [layerField, dropdown('owner', 'Owner', C.OWNERS, 'timeline')],
		keys: ['layer_owner'],
		check: (o, state) => state.get(`layer_${Number(o.layer)}_owner`) === o.owner,
	},
	layer_showing: {
		name: 'Layer showing a picture',
		description: 'Needs the Full status level',
		style: GREEN,
		options: [layerField],
		keys: ['layer_showing'],
		check: (o, state) => state.get(`layer_${Number(o.layer)}_showing`) === 1,
	},
	layer_play_mode_is: {
		name: 'Layer play mode',
		description: 'Needs the Full status level',
		style: GREEN,
		options: [layerField, dropdown('mode', 'Play mode', C.PLAY_MODE_STATES, 'play')],
		keys: ['layer_play_mode'],
		check: (o, state) => state.get(`layer_${Number(o.layer)}_play_mode`) === o.mode,
	},
}

/**
 * The feedbacks a set of changed variable names touches. A timeline's or a
 * layer's variable counts under its bare name (`timeline_2_cue` as `cue`,
 * `layer_3_owner` as `layer_owner`).
 */
function feedbacksFor(changedNames) {
	const keys = new Set()
	for (const name of changedNames) {
		keys.add(name)
		let m = /^timeline_\d+_(\w+)$/.exec(name)
		if (m) {
			keys.add(m[1])
			keys.add(`timeline_${m[1]}`)
		}
		m = /^layer_\d+_(\w+)$/.exec(name)
		if (m) keys.add(`layer_${m[1]}`)
	}
	return Object.entries(FEEDBACKS)
		.filter(([, f]) => f.keys.some((k) => keys.has(k)))
		.map(([id]) => id)
}

function checkFeedback(id, options, state, connection) {
	const f = FEEDBACKS[id]
	if (!f) throw new Error(`no feedback ${id}`)
	return f.check(options, state, connection)
}

function getFeedbackDefinitions(self) {
	const definitions = {}
	for (const [id, f] of Object.entries(FEEDBACKS)) {
		definitions[id] = {
			type: 'boolean',
			name: f.name,
			description: f.description,
			defaultStyle: f.style,
			options: f.options,
			callback: (feedback) => f.check(feedback.options, self.state, self.connection),
		}
	}
	return definitions
}

module.exports = { FEEDBACKS, feedbacksFor, checkFeedback, getFeedbackDefinitions, sameCue }
