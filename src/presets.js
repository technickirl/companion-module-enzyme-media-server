// Ready-made buttons, in sections: Transport, Cues, Show, Recalls, Set list
// and Timelines; and with a show from the control socket, the stored
// recalls with their names and pictures, the next cues of the master from
// the current one, a monitor button per raster and the next cue's picture.
// `label` is the connection's label, for the variables.

import { combineRgb } from '@companion-module/base'
import * as C from './choices.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(30, 30, 30)
const GREEN = combineRgb(0, 140, 0)
const RED = combineRgb(180, 0, 0)
const AMBER = combineRgb(200, 120, 0)
const BLUE = combineRgb(0, 80, 200)
/** The shell's Go for a moment after any Go. */
const PALE = combineRgb(170, 255, 185)
const DIM_WHITE = combineRgb(200, 200, 200)

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

function getPresets(label, model = null, state = null) {
	const v = (name) => `$(${label}:${name})`
	const presets = {}
	const structure = []
	const named = model?.hasShow ? model : null

	if (named) {
		// A picture button: layered, an image element fed by a picture
		// feedback through a local variable and a label along the bottom,
		// with a simple text-only variant for a host that cannot draw layers.
		const expression = (value) => ({ isExpression: true, value })
		const pictureButton = ({ name, picture, label, text, actions, lit: litBy = [], notes }) => ({
			type: 'alternatives',
			variants: [
				{
					type: 'layered',
					name,
					notes,
					elements: [
						{
							type: 'image',
							id: 'picture',
							x: 0,
							y: 0,
							width: 100,
							height: 100,
							base64Image: expression('$(local:picture)'),
							fillMode: 'fit',
						},
						{
							type: 'text',
							id: 'label',
							x: 0,
							y: 70,
							width: 100,
							height: 30,
							text: label.feedbackId ? expression('$(local:label)') : label.text,
							fontsize: 60,
							fontsizeAllowShrink: true,
							color: WHITE,
							outlineColor: BLACK,
							halign: 'center',
							valign: 'bottom',
						},
					],
					canvas: { decoration: 'none' },
					steps: [{ down: actions, up: [] }],
					feedbacks: litBy.map((f) => ({
						feedbackId: f.feedbackId,
						options: f.options,
						styleOverrides: [
							{ elementId: 'label', elementProperty: 'color', override: { isExpression: false, value: f.color } },
						],
					})),
					localVariables: [
						{
							variableType: 'feedback',
							variableName: 'picture',
							feedbackId: picture.feedbackId,
							options: picture.options,
						},
						...(label.feedbackId
							? [
									{
										variableType: 'feedback',
										variableName: 'label',
										feedbackId: label.feedbackId,
										options: label.options,
									},
								]
							: []),
						...(picture.locals ?? []),
					],
				},
				{
					type: 'simple',
					name,
					notes,
					style: { text, size: 'auto', color: WHITE, bgcolor: DARK },
					steps: [{ down: actions, up: [] }],
					feedbacks: litBy.map((f) => ({
						feedbackId: f.feedbackId,
						options: f.options,
						style: { bgcolor: f.color, color: WHITE },
					})),
					localVariables: picture.locals ?? [],
				},
			],
		})
		const local = (name, startupValue) => ({ variableType: 'simple', variableName: name, startupValue })

		// The master's next cues from the current one, as a template over the cue number.
		presets.show_cue = pictureButton({
			name: 'Cue',
			notes: 'Fires the cue in the local variable cue; the label is its number and name',
			picture: {
				feedbackId: 'next_cue_picture',
				options: { raster: '1', timeline: '' },
				locals: [local('cue', '1')],
			},
			label: { feedbackId: 'cue_label', options: { cue: expression('$(local:cue)'), timeline: '' } },
			text: `CUE\\n$(local:cue)`,
			actions: [act('cue_go', { cue: expression('$(local:cue)'), timeline: '' })],
			lit: [
				{ feedbackId: 'cue_is', options: { cue: expression('$(local:cue)'), timeline: '' }, color: GREEN },
				{ feedbackId: 'next_cue_is', options: { cue: expression('$(local:cue)'), timeline: '' }, color: AMBER },
			],
		})
		// The cue list's picture is the next cue's, which is right for the one cue it is next for.
		const cues = named.cuesFrom(named.masterIndex, state?.get('cue'), 8)
		presets.show_next_cue = pictureButton({
			name: 'Next cue picture',
			notes: 'Go, with a picture of what the first raster will show at the next cue, and its number and name',
			picture: { feedbackId: 'next_cue_picture', options: { raster: '1', timeline: '' } },
			label: { text: `${v('master_name')}\\nGO\\n${v('next_cue')} ${v('next_cue_name')}` },
			text: `${v('master_name')}\\nGO\\n${v('next_cue')} ${v('next_cue_name')}`,
			actions: [act('transport', { command: 'go', timeline: '' })],
			lit: [
				{ feedbackId: 'go_lit', options: { timeline: '' }, color: GREEN },
				{ feedbackId: 'looping_until_go', options: { timeline: '' }, color: GREEN },
				{ feedbackId: 'go_fired', options: { timeline: '' }, color: PALE },
			],
		})
		structure.push({
			id: 'show_cues',
			name: `Cues: ${named.timelines[named.masterIndex]?.name ?? 'master'}`,
			description: 'The next cues from the current one, each firing that cue, and Go with the next cue pictured',
			definitions: [
				{
					id: 'show_cue_list',
					type: 'template',
					name: 'Next cues',
					presetId: 'show_cue',
					templateVariableName: 'cue',
					templateValues: cues.map((c) => ({ name: `Cue ${c.number} ${c.name}`.trim(), value: c.number })),
				},
				{ id: 'show_next_cue_group', type: 'simple', name: 'Next cue', presets: ['show_next_cue'] },
			],
		})

		// Every stored recall, a template group per bank over the tile.
		presets.show_recall = pictureButton({
			name: 'Recall',
			notes:
				'Fires the recall at the local variables bank and tile; the label is its name and the picture the one stored with it',
			picture: {
				feedbackId: 'recall_picture',
				options: { pick: '', bank: expression('$(local:bank)'), tile: expression('$(local:tile)') },
				locals: [local('bank', 1), local('tile', 1)],
			},
			label: {
				feedbackId: 'recall_label',
				options: { pick: '', bank: expression('$(local:bank)'), tile: expression('$(local:tile)') },
			},
			text: `RECALL\\n$(local:bank)/$(local:tile)`,
			actions: [act('recall', { pick: '', bank: expression('$(local:bank)'), tile: expression('$(local:tile)') })],
			lit: [
				{
					feedbackId: 'recall_was',
					options: { bank: expression('$(local:bank)'), tile: expression('$(local:tile)') },
					color: GREEN,
				},
			],
		})
		const banks = [...new Set(named.recalls.items.map((r) => r.folder))].sort((a, b) => a - b)
		if (banks.length) {
			structure.push({
				id: 'show_recalls',
				name: 'Recalls by name',
				description: 'Every stored recall, with its name and picture',
				definitions: banks.map((bank) => ({
					id: `show_recall_bank_${bank}`,
					type: 'template',
					name: named.recallBankName(bank) || `Bank ${bank}`,
					presetId: 'show_recall',
					templateVariableName: 'tile',
					commonVariableValues: { bank },
					templateValues: named.recalls.items
						.filter((r) => r.folder === bank)
						.map((r) => ({ name: `${r.name} (${r.folder}/${r.file})`, value: r.file })),
				})),
			})
		}

		// A monitor per raster, as a template over the raster number.
		presets.show_raster = pictureButton({
			name: 'Raster monitor',
			notes: 'A live picture of the raster in the local variable raster',
			picture: {
				feedbackId: 'raster_picture',
				options: { raster: expression('$(local:raster)') },
				locals: [local('raster', 1)],
			},
			label: { feedbackId: 'raster_label', options: { raster: expression('$(local:raster)') } },
			text: `RASTER\\n$(local:raster)`,
			actions: [],
		})
		if (named.rasters.length) {
			structure.push({
				id: 'show_rasters',
				name: 'Rasters',
				description: 'A live picture of each raster',
				definitions: [
					{
						id: 'show_raster_list',
						type: 'template',
						name: 'Monitors',
						presetId: 'show_raster',
						templateVariableName: 'raster',
						templateValues: named.rasters.map((r) => ({ name: r.name, value: r.number })),
					},
				],
			})
		}
	}

	// Transport. Go is the shell's: the timeline's name, a large GO and the
	// next cue, lit green while playing, chasing or waiting for timecode,
	// flashing while clips loop until Go, pale green for a moment after any
	// Go; Pause amber while paused (the word stop), Stop and Hold red while
	// held, the timecode lock blue while chasing.
	const goButton = ({ id, name, timeline, nameText, nextText }) => {
		const tl = timeline
		const over = (elementId, color) => ({
			elementId,
			elementProperty: 'color',
			override: { isExpression: false, value: color },
		})
		presets[id] = {
			type: 'alternatives',
			variants: [
				{
					type: 'layered',
					name,
					elements: [
						{
							type: 'box',
							id: 'background',
							x: 0,
							y: 0,
							width: 100,
							height: 100,
							color: DARK,
							cornerRadius: 0,
							borderWidth: 0,
						},
						{
							type: 'text',
							id: 'timeline',
							x: 0,
							y: 2,
							width: 100,
							height: 18,
							text: nameText,
							color: WHITE,
							fontsize: 70,
							fontsizeAllowShrink: true,
							halign: 'center',
							valign: 'center',
						},
						{
							type: 'text',
							id: 'go',
							x: 0,
							y: 20,
							width: 100,
							height: 58,
							text: 'GO',
							color: WHITE,
							fontsize: 100,
							fontsizeAllowShrink: true,
							weight: 'bold',
							halign: 'center',
							valign: 'center',
						},
						{
							type: 'text',
							id: 'next',
							x: 0,
							y: 80,
							width: 100,
							height: 18,
							text: nextText,
							color: DIM_WHITE,
							fontsize: 70,
							fontsizeAllowShrink: true,
							halign: 'center',
							valign: 'center',
						},
					],
					canvas: { decoration: 'none' },
					steps: [{ down: [act('transport', { command: 'go', timeline: tl })], up: [] }],
					feedbacks: [
						{ feedbackId: 'go_lit', options: { timeline: tl }, styleOverrides: [over('background', GREEN)] },
						{ feedbackId: 'looping_until_go', options: { timeline: tl }, styleOverrides: [over('background', GREEN)] },
						{
							feedbackId: 'go_fired',
							options: { timeline: tl },
							styleOverrides: [
								over('background', PALE),
								over('timeline', BLACK),
								over('go', BLACK),
								over('next', BLACK),
							],
						},
					],
				},
				{
					type: 'simple',
					name,
					style: { text: `${nameText}\\nGO\\n${nextText}`, size: 18, color: WHITE, bgcolor: DARK },
					steps: [{ down: [act('transport', { command: 'go', timeline: tl })], up: [] }],
					feedbacks: [
						lit('go_lit', { timeline: tl }, GREEN),
						lit('looping_until_go', { timeline: tl }, GREEN),
						lit('go_fired', { timeline: tl }, PALE, BLACK),
					],
				},
			],
		}
	}
	goButton({
		id: 'transport_go',
		name: 'Go',
		timeline: '',
		nameText: v('master_name'),
		nextText: `${v('next_cue')} ${v('next_cue_name')}`,
	})
	const transport = ['transport_go']
	for (const c of C.TRANSPORT_COMMANDS) {
		if (c.id === 'go' || c.id === 'play') continue
		const id = `transport_${c.id}`
		const feedbacks = []
		if (c.id === 'pause' || c.id === 'play_pause')
			feedbacks.push(lit('transport_is', { state: 'stop', timeline: '' }, AMBER, BLACK))
		if (c.id === 'stop' || c.id === 'hold') feedbacks.push(lit('transport_is', { state: 'hold', timeline: '' }, RED))
		if (c.id === 'tc_lock') feedbacks.push(lit('transport_is', { state: 'chase', timeline: '' }, BLUE))
		const words = c.id === 'play_pause' ? 'PAUSE' : c.label.toUpperCase()
		// One word on a key gets the largest size, shrinking when it must; two get a line each.
		const text = words.includes(' ') ? words.replace(' ', '\\n') : words
		presets[id] = button(
			c.id === 'play_pause' ? 'Pause / resume' : c.label,
			text,
			[act('transport', { command: c.id, timeline: '' })],
			feedbacks,
			{
				size: words.includes(' ') ? 30 : 44,
			},
		)
		// The Pause key sends Pause / resume; the plain Pause stays for a key that only pauses.
		if (c.id === 'pause') continue
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

	// Go and Stop for every timeline the status or the show knows.
	const known = new Set(state?.timelines ?? [])
	for (const t of named?.timelines ?? []) known.add(t.number)
	const timelines = []
	for (const n of [...known].sort((a, b) => a - b)) {
		const go = `timeline_${n}_go`
		const stop = `timeline_${n}_stop`
		goButton({
			id: go,
			name: `Timeline ${n} Go`,
			timeline: String(n),
			nameText: v(`timeline_${n}_name`),
			nextText: `${v(`timeline_${n}_next_cue`)} ${v(`timeline_${n}_next_cue_name`)}`,
		})
		presets[stop] = button(
			`Timeline ${n} Stop`,
			`${v(`timeline_${n}_name`)}\\nSTOP`,
			[act('transport', { command: 'stop', timeline: String(n) })],
			[lit('transport_is', { state: 'hold', timeline: String(n) }, RED)],
			{ size: 30 },
		)
		timelines.push(go, stop)
	}
	if (timelines.length) {
		structure.push({
			id: 'timelines',
			name: 'Timelines',
			description: 'Go and Stop for each timeline the engine has reported, named by its variable',
			definitions: timelines,
		})
	}

	return { structure, presets }
}

export { getPresets }
