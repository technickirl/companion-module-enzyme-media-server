// The feedbacks: boolean ones, each a table entry with its options and a
// `check` over the engine state, so the tests can drive them without
// Companion (`keys` names the state that moves each one, so a batch of
// status only re-checks the feedbacks it touched); and value ones that
// give a picture as a data URI, or a label, for layered buttons.

import { combineRgb } from '@companion-module/base'
import * as C from './choices.js'
import { withChoices } from './actions.js'

const GREEN = { bgcolor: combineRgb(0, 140, 0), color: combineRgb(255, 255, 255) }
const RED = { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) }
const AMBER = { bgcolor: combineRgb(200, 120, 0), color: combineRgb(0, 0, 0) }
const BLUE = { bgcolor: combineRgb(0, 80, 200), color: combineRgb(255, 255, 255) }

const timelineField = {
	id: 'timeline',
	choices: 'timeline',
	type: 'textinput',
	label: 'Timeline',
	tooltip: 'Empty for the master, else its number or (with more than one timeline) its name',
	default: '',
}
const layerField = {
	id: 'layer',
	choices: 'layer',
	type: 'number',
	label: 'Layer (from 1 at the back)',
	default: 1,
	min: 1,
	max: 999,
	step: 1,
}
const dropdown = (id, label, choices, def) => ({ id, type: 'dropdown', label, choices, default: def ?? choices[0].id })
const rasterField = {
	id: 'raster',
	choices: 'raster',
	type: 'textinput',
	label: 'Raster',
	tooltip: 'Its place in the Mappings list from 1, or its name',
	default: '1',
}
const pickField = (label, tooltip) => ({
	id: 'pick',
	type: 'dropdown',
	label,
	tooltip,
	baseChoices: [{ id: '', label: 'By the numbers below' }],
	default: '',
	disableAutoExpression: true,
})
const byNumbers = '$(options:pick) == ""'
const bankField = (label) => ({
	id: 'bank',
	type: 'number',
	label,
	default: 1,
	min: 0,
	max: 65535,
	step: 1,
	isVisibleExpression: byNumbers,
})
const tileField = {
	id: 'tile',
	type: 'number',
	label: 'Tile',
	default: 1,
	min: 1,
	max: 65535,
	step: 1,
	isVisibleExpression: byNumbers,
}

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
 * The value feedbacks: pictures as data URIs for an image element, and
 * labels for a layered button's text, each answered by the instance
 * (`self.value(id, options)`), which also learns from the picture ones
 * that run which pictures to ask the engine for.
 */
const VALUES = {
	raster_picture: {
		name: 'Raster picture',
		description: 'The latest picture of a raster from the control socket, as a data URI for an image element',
		picture: true,
		options: [rasterField],
	},
	next_cue_picture: {
		name: 'Next cue picture',
		description: "What a raster will show at a timeline's next cue, as a data URI for an image element",
		picture: true,
		options: [rasterField, timelineField],
	},
	media_picture: {
		name: 'Media tile picture',
		description: 'A media tile’s picture, as a data URI for an image element',
		picture: true,
		options: [
			{ ...pickField('Tile', 'A media tile by name, once the engine has sent them'), choices: 'media' },
			bankField('Folder'),
			tileField,
		],
	},
	recall_picture: {
		name: 'Recall picture',
		description: 'The picture stored with a recall, as a data URI for an image element',
		picture: true,
		options: [
			{ ...pickField('Recall', 'A stored recall by name, once the engine has sent them'), choices: 'recall' },
			bankField('Bank'),
			tileField,
		],
	},
	cue_label: {
		name: 'Cue label',
		description: 'A cue’s number and name, for a button’s text',
		options: [{ id: 'cue', choices: 'cue', type: 'textinput', label: 'Cue number', default: '1' }, timelineField],
	},
	recall_label: {
		name: 'Recall label',
		description: 'A recall’s name, for a button’s text',
		options: [
			{ ...pickField('Recall', 'A stored recall by name, once the engine has sent them'), choices: 'recall' },
			bankField('Bank'),
			tileField,
		],
	},
	raster_label: {
		name: 'Raster label',
		description: 'A raster’s name, for a button’s text',
		options: [rasterField],
	},
}

/** A bank and tile from a "bank/tile" pick or the two numbers. */
function bankTileOf(options) {
	const m = /^\s*(\d+)\/(\d+)\s*$/.exec(String(options.pick ?? ''))
	return m ? [Number(m[1]), Number(m[2])] : [Number(options.bank), Number(options.tile)]
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

function getFeedbackDefinitions(self, choices = null) {
	const definitions = {}
	for (const [id, f] of Object.entries(FEEDBACKS)) {
		definitions[id] = {
			type: 'boolean',
			name: f.name,
			description: f.description,
			defaultStyle: f.style,
			options: f.options.map((o) => withChoices(o, choices)),
			callback: (feedback) => f.check(feedback.options, self.state, self.connection),
		}
	}
	for (const [id, f] of Object.entries(VALUES)) {
		definitions[id] = {
			type: 'value',
			name: f.name,
			description: f.description,
			options: f.options.map((o) => withChoices(o, choices)),
			callback: (feedback) => self.value(id, feedback),
			unsubscribe: f.picture ? (feedback) => self.valueGone(feedback.id) : undefined,
		}
	}
	return definitions
}

export { FEEDBACKS, VALUES, feedbacksFor, checkFeedback, getFeedbackDefinitions, bankTileOf, sameCue }
