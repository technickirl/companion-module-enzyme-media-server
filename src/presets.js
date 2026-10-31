// Ready-made buttons, in sections: Transport, Cues, Show, Recalls, Set list
// and Timelines. `label` is the connection's label, for the variables.

const { combineRgb } = require('@companion-module/base')
const C = require('./choices')

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(30, 30, 30)
const GREEN = combineRgb(0, 140, 0)
const RED = combineRgb(180, 0, 0)
const AMBER = combineRgb(200, 120, 0)
const BLUE = combineRgb(0, 80, 200)

function button(name, text, actions, feedbacks = [], style = {}) {
	return {
		type: 'simple',
		name,
		style: { text, size: 'auto', color: WHITE, bgcolor: DARK, ...style },
		steps: [{ down: actions, up: [] }],
		feedbacks,
	}
}

const act = (actionId, options = {}) => ({ actionId, options })
const lit = (feedbackId, options, bgcolor, color = WHITE) => ({ feedbackId, options, style: { bgcolor, color } })

function getPresets(label) {
	const v = (name) => `$(${label}:${name})`
	const presets = {}
	const structure = []

	// Transport
	const transport = []
	for (const c of C.TRANSPORT_COMMANDS) {
		const id = `transport_${c.id}`
		const feedbacks = []
		if (c.id === 'go') feedbacks.push(lit('transport_is', { state: 'play', timeline: '' }, GREEN))
		if (c.id === 'hold') feedbacks.push(lit('transport_is', { state: 'hold', timeline: '' }, AMBER, BLACK))
		if (c.id === 'stop') feedbacks.push(lit('transport_is', { state: 'stop', timeline: '' }, RED))
		if (c.id === 'tc_lock') feedbacks.push(lit('transport_is', { state: 'chase', timeline: '' }, BLUE))
		presets[id] = button(
			c.label,
			c.label.toUpperCase(),
			[act('transport', { command: c.id, timeline: '' })],
			feedbacks,
			{
				size: c.id === 'go' ? '24' : 'auto',
			},
		)
		transport.push(id)
	}
	structure.push({ id: 'transport', name: 'Transport', description: 'The master timeline', definitions: transport })

	// Cues
	presets.cue_go = button(
		'Fire cue',
		'CUE\\n1',
		[act('cue_go', { cue: '1', timeline: '' })],
		[lit('cue_is', { cue: '1', timeline: '' }, GREEN)],
	)
	presets.cue_current = button('Current cue', `CUE\\n${v('cue')}`, [], [], {
		bgcolor: BLACK,
		color: combineRgb(0, 220, 0),
	})
	presets.cue_next = button('Next cue', `NEXT\\n${v('next_cue')}`, [], [], {
		bgcolor: BLACK,
		color: combineRgb(255, 180, 0),
	})
	presets.timecode = button('Timecode', v('timecode'), [], [], { bgcolor: BLACK, size: '14' })
	presets.section = button('Section', `${v('section_number')}\\n${v('section_name')}`, [], [], { bgcolor: BLACK })
	structure.push({
		id: 'cues',
		name: 'Cues',
		definitions: ['cue_go', 'cue_current', 'cue_next', 'timecode', 'section'],
	})

	// Show
	presets.blackout = button(
		'Blackout toggle',
		'BLACK\\nOUT',
		[act('blackout', { state: 'toggle' })],
		[lit('blackout_on', {}, RED)],
	)
	presets.mode_show = button(
		'Show mode',
		'SHOW\\nMODE',
		[act('mode', { mode: 'show' })],
		[lit('mode_is', { mode: 'show' }, GREEN)],
	)
	presets.mode_edit = button(
		'Edit mode',
		'EDIT\\nMODE',
		[act('mode', { mode: 'edit' })],
		[lit('mode_is', { mode: 'edit' }, AMBER, BLACK)],
	)
	presets.override_off = button(
		'Override off',
		'OVERRIDE\\nOFF',
		[act('override', { owner: 'off' })],
		[lit('override_is', { owner: 'off' }, GREEN)],
	)
	presets.master_full = button('Master level full', 'MASTER\\n100%', [act('master_level', { level: 1 })])
	presets.connected = button('Connected', 'ENZYME', [], [lit('connected', { which: 'any' }, GREEN)], { bgcolor: RED })
	structure.push({
		id: 'show',
		name: 'Show',
		definitions: ['blackout', 'mode_show', 'mode_edit', 'override_off', 'master_full', 'connected'],
	})

	// Recalls: bank 1's first row
	const recalls = []
	for (let tile = 1; tile <= 8; tile++) {
		const id = `recall_1_${tile}`
		presets[id] = button(
			`Recall 1/${tile}`,
			`RECALL\\n1/${tile}`,
			[act('recall', { bank: 1, tile })],
			[lit('recall_was', { bank: 1, tile }, GREEN)],
		)
		recalls.push(id)
	}
	structure.push({ id: 'recalls', name: 'Recalls', description: 'Bank 1, tiles 1 to 8', definitions: recalls })

	// Set list
	presets.setlist_next = button('Set list next', 'SET LIST\\nNEXT', [act('setlist_step', { step: 'next' })])
	presets.setlist_previous = button('Set list previous', 'SET LIST\\nPREV', [act('setlist_step', { step: 'previous' })])
	presets.setlist_current = button('Current row', `ROW ${v('setlist_row')}\\n${v('setlist_timeline')}`, [], [], {
		bgcolor: BLACK,
	})
	structure.push({
		id: 'setlist',
		name: 'Set list',
		definitions: ['setlist_previous', 'setlist_next', 'setlist_current'],
	})

	// Timelines 1 to 4
	const timelines = []
	for (let n = 1; n <= 4; n++) {
		const go = `timeline_${n}_go`
		const stop = `timeline_${n}_stop`
		presets[go] = button(
			`Timeline ${n} Go`,
			`${v(`timeline_${n}_name`)}\\nGO`,
			[act('transport', { command: 'go', timeline: String(n) })],
			[lit('transport_is', { state: 'play', timeline: String(n) }, GREEN)],
		)
		presets[stop] = button(
			`Timeline ${n} Stop`,
			`${v(`timeline_${n}_name`)}\\nSTOP`,
			[act('transport', { command: 'stop', timeline: String(n) })],
			[lit('transport_is', { state: 'stop', timeline: String(n) }, RED)],
		)
		timelines.push(go, stop)
	}
	structure.push({
		id: 'timelines',
		name: 'Timelines',
		description: 'Named by each timeline’s variable, sent when the show has more than one',
		definitions: timelines,
	})

	return { structure, presets }
}

module.exports = { getPresets }
