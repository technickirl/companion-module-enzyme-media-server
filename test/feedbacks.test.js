import test from 'node:test'
import assert from 'node:assert/strict'
import { FEEDBACKS, VALUES, checkFeedback, feedbacksFor, sameCue } from '../src/feedbacks.js'
import { EngineState } from '../src/status.js'
import { str, int } from '../src/osc.js'
import { variableDefinitions, nameValues, initialValues } from '../src/variables.js'
import { getPresets } from '../src/presets.js'
import { ACTIONS } from '../src/actions.js'
import { hostsFromConfig } from '../src/config.js'
import { ShowModel } from '../src/show.js'
import { fixtureShow, fixtureSetList } from './fixture-show.js'

const msg = (address, ...args) => ({ address, args })

test('every feedback has a style, options with defaults and keys', () => {
	for (const [id, f] of Object.entries(FEEDBACKS)) {
		assert.ok(f.name, id)
		assert.ok(f.style.bgcolor !== undefined, id)
		assert.ok(f.keys.length > 0, id)
		for (const field of f.options) assert.notEqual(field.default, undefined, `${id}.${field.id}`)
	}
})

test('cues compare as numbers or text', () => {
	assert.ok(sameCue('3', '3.0'))
	assert.ok(sameCue('1.5', '1.5'))
	assert.ok(sameCue('Walk in', 'walk in'))
	assert.ok(!sameCue('3', '4'))
	assert.ok(sameCue('', ''))
	assert.ok(!sameCue('', '1'))
})

test('feedbacks follow the state', () => {
	const state = new EngineState()
	state.apply(msg('/status/transport', str('play')))
	state.apply(msg('/status/cue', str('3')))
	state.apply(msg('/status/next_cue', str('4')))
	state.apply(msg('/status/section', int(2), str('Verse')))
	state.apply(msg('/status/blackout', int(1)))
	state.apply(msg('/status/mode', str('show')))
	state.apply(msg('/status/override', str('manual')))
	state.apply(msg('/status/timeline/1/master', int(1)))
	state.apply(msg('/status/timeline/2/master', int(0)))
	state.apply(msg('/status/timeline/2/name', str('Encore')))
	state.apply(msg('/status/timeline/2/transport', str('hold')))
	state.apply(msg('/status/setlist/current', int(2), str('Main')))
	state.apply(msg('/status/recall', int(1), int(4), str('Warm')))
	state.apply(msg('/status/layer/3/owner', str('dmx')))
	state.apply(msg('/status/layer/3/showing', int(1)))
	state.apply(msg('/status/layer/3/play_mode', str('hold_last')))

	assert.ok(checkFeedback('transport_is', { state: 'play', timeline: '' }, state))
	assert.ok(!checkFeedback('transport_is', { state: 'stop', timeline: '' }, state))
	assert.ok(checkFeedback('transport_is', { state: 'hold', timeline: '2' }, state))
	assert.ok(checkFeedback('transport_is', { state: 'hold', timeline: 'encore' }, state))
	assert.ok(!checkFeedback('transport_is', { state: 'hold', timeline: 'nowhere' }, state))
	assert.ok(checkFeedback('cue_is', { cue: '3', timeline: '' }, state))
	assert.ok(checkFeedback('next_cue_is', { cue: '4.0', timeline: '' }, state))
	assert.ok(checkFeedback('section_is', { section: 2 }, state))
	assert.ok(checkFeedback('blackout_on', {}, state))
	assert.ok(checkFeedback('mode_is', { mode: 'show' }, state))
	assert.ok(!checkFeedback('mode_is', { mode: 'edit' }, state))
	assert.ok(checkFeedback('override_is', { owner: 'manual' }, state))
	assert.ok(checkFeedback('timeline_is_master', { timeline: 1 }, state))
	assert.ok(!checkFeedback('timeline_is_master', { timeline: 2 }, state))
	assert.ok(checkFeedback('setlist_row_is', { row: 2 }, state))
	assert.ok(checkFeedback('recall_was', { bank: 1, tile: 4 }, state))
	assert.ok(!checkFeedback('recall_was', { bank: 1, tile: 5 }, state))
	assert.ok(checkFeedback('layer_owner_is', { layer: 3, owner: 'dmx' }, state))
	assert.ok(checkFeedback('layer_showing', { layer: 3 }, state))
	assert.ok(!checkFeedback('layer_showing', { layer: 4 }, state))
	assert.ok(checkFeedback('layer_play_mode_is', { layer: 3, mode: 'hold_last' }, state))

	const connection = { live: 1, hosts: [{ up: false }, { up: true }] }
	assert.ok(checkFeedback('connected', { which: 'any' }, state, connection))
	assert.ok(!checkFeedback('connected', { which: 'primary' }, state, connection))
	assert.ok(checkFeedback('connected', { which: 'backup' }, state, connection))
	assert.ok(!checkFeedback('connected', { which: 'any' }, state, null))
})

test('a change re-checks only the feedbacks it touches', () => {
	assert.deepEqual(feedbacksFor(['transport']), ['transport_is', 'go_lit'])
	assert.deepEqual(feedbacksFor(['timeline_2_transport']), ['transport_is', 'go_lit'])
	assert.deepEqual(feedbacksFor(['waiting']), ['go_lit'])
	assert.deepEqual(feedbacksFor(['timeline_2_looping']), ['looping_until_go'])
	assert.deepEqual(feedbacksFor(['go_count']), ['go_fired'])
	assert.deepEqual(feedbacksFor(['timeline_2_master']), ['timeline_is_master'])
	assert.deepEqual(feedbacksFor(['layer_3_owner']), ['layer_owner_is'])
	assert.deepEqual(feedbacksFor(['layer_3_opacity', 'position', 'heartbeat']), [])
	assert.deepEqual(feedbacksFor(['recall_tile']), ['recall_was'])
	assert.deepEqual(feedbacksFor(['cue', 'next_cue']), ['cue_is', 'next_cue_is'])
})

test('variables grow with the timelines and layers seen', () => {
	const base = variableDefinitions(new Set(), new Set())
	assert.ok(base.timecode && base.override && !base.timeline_1_name)
	const grown = variableDefinitions(new Set([2, 1]), new Set([3]))
	assert.ok(grown.timeline_1_name && grown.timeline_2_cue && grown.layer_3_owner && grown.layer_3_colour_xy)
	const shown = new ShowModel()
	shown.applyShow(fixtureShow())
	const named = variableDefinitions(new Set(), new Set(), shown)
	assert.ok(named.timeline_2_cue_name && named.layer_4_name && named.raster_2_picture && named.recall_2_1_name)
	const cues = new EngineState()
	cues.apply(msg('/status/cue', str('3')))
	cues.apply(msg('/status/next_cue', str('3.5')))
	cues.apply(msg('/status/timeline/2/next_cue', str('2')))
	const names = nameValues(shown, cues, { name: 'Engine', version: '1.0' })
	assert.equal(names.cue_name, 'Title')
	assert.equal(names.next_cue_name, 'Title hold')
	assert.equal(names.timeline_2_next_cue_name, 'Bows')
	assert.equal(names.timeline_1_name, 'Main')
	assert.equal(names.layer_2_name, 'LED screens')
	assert.equal(names.raster_1_name, 'Stage')
	assert.equal(names.recall_1_4_name, 'Blackout look')
	assert.equal(names.engine_version, '1.0')
	assert.equal(names.show_name, 'Fixture show')
	assert.equal(names.setlist_row_name, '', 'no row yet')
	shown.applySetList(fixtureSetList())
	cues.apply(msg('/status/setlist/current', int(2), str('Encore')))
	assert.equal(nameValues(shown, cues, null).setlist_row_name, 'Encore', 'the row name follows the OSC row number')
	assert.equal(nameValues(null, cues, null).cue_name, '')
	const values = initialValues()
	assert.equal(values.position, 0)
	assert.equal(values.cue, '')
})

test('presets refer to actions and feedbacks that exist, with their options', () => {
	const checkPreset = (id, preset, allowLocals = false) => {
		const has = (field, options) =>
			field.id in options ||
			(allowLocals && Object.values(options).some((v) => v && v.isExpression)) ||
			field.id === 'pick'
		for (const step of preset.steps) {
			for (const action of [...step.down, ...step.up]) {
				const def = ACTIONS[action.actionId]
				assert.ok(def, `${id} uses action ${action.actionId}`)
				for (const field of def.options)
					assert.ok(has(field, action.options), `${id} sets ${action.actionId}.${field.id}`)
			}
		}
		for (const feedback of preset.feedbacks) {
			const def = FEEDBACKS[feedback.feedbackId] ?? VALUES[feedback.feedbackId]
			assert.ok(def, `${id} uses feedback ${feedback.feedbackId}`)
			for (const field of def.options)
				assert.ok(has(field, feedback.options), `${id} sets ${feedback.feedbackId}.${field.id}`)
			if (preset.type === 'layered') assert.ok(Array.isArray(feedback.styleOverrides), `${id} overrides elements`)
			else assert.ok(feedback.style, `${id} has a style`)
		}
		for (const local of preset.localVariables ?? []) {
			if (local.variableType === 'feedback') {
				const def = VALUES[local.feedbackId]
				assert.ok(def, `${id} binds feedback ${local.feedbackId}`)
			}
		}
		if (preset.type === 'layered') {
			const ids = preset.elements.map((e) => e.id)
			for (const f of preset.feedbacks)
				for (const o of f.styleOverrides) assert.ok(ids.includes(o.elementId), `${id} overrides ${o.elementId}`)
		}
	}
	const check = (label, model, state) => {
		const { structure, presets } = getPresets(label, model, state)
		const ids = new Set(Object.keys(presets))
		for (const section of structure) {
			for (const d of section.definitions) {
				if (typeof d === 'string') assert.ok(ids.has(d), `${section.id} refers to ${d}`)
				else if (d.type === 'simple') for (const p of d.presets) assert.ok(ids.has(p), `${d.id} refers to ${p}`)
				else {
					assert.equal(d.type, 'template')
					assert.ok(ids.has(d.presetId), `${d.id} templates ${d.presetId}`)
					const p = presets[d.presetId]
					const variants = p.type === 'alternatives' ? p.variants : [p]
					for (const v of variants) {
						const names = (v.localVariables ?? []).map((l) => l.variableName)
						assert.ok(names.includes(d.templateVariableName), `${d.id} overrides local ${d.templateVariableName}`)
						for (const name of Object.keys(d.commonVariableValues ?? {}))
							assert.ok(names.includes(name), `${d.id} sets local ${name}`)
					}
				}
			}
		}
		for (const [id, preset] of Object.entries(presets)) {
			if (preset.type === 'alternatives') {
				assert.equal(preset.variants[0].type, 'layered')
				assert.equal(preset.variants[1].type, 'simple')
				for (const v of preset.variants) checkPreset(id, v, true)
			} else {
				assert.equal(preset.type, 'simple', id)
				checkPreset(id, preset)
			}
		}
		return { structure, presets }
	}
	const bare = check('enzyme', null, null)
	assert.match(bare.presets.cue_current.style.text, /\$\(enzyme:cue\)/)
	assert.ok(!bare.presets.show_recall, 'no show presets without a show')
	const model = new ShowModel()
	model.applyShow(fixtureShow())
	const state = new EngineState()
	state.apply(msg('/status/cue', str('7')))
	const named = check('enzyme', model, state)
	const cueList = named.structure.find((s) => s.id === 'show_cues').definitions[0]
	assert.deepEqual(
		cueList.templateValues.map((t) => t.value),
		['7', '8', '9', '10'],
	)
	const recalls = named.structure.find((s) => s.id === 'show_recalls')
	assert.deepEqual(
		recalls.definitions.map((d) => [d.name, d.commonVariableValues.bank, d.templateValues.length]),
		[
			['Looks', 1, 3],
			['Sources', 2, 1],
		],
	)
	const rasters = named.structure.find((s) => s.id === 'show_rasters').definitions[0]
	assert.deepEqual(
		rasters.templateValues.map((t) => t.name),
		['Stage', 'Foyer'],
	)
	const image = named.presets.show_raster.variants[0].elements.find((e) => e.type === 'image')
	assert.deepEqual(image.base64Image, { isExpression: true, value: '$(local:picture)' })
	assert.equal(image.fillMode, 'fit')
})

test('the config gives the hosts', () => {
	assert.deepEqual(hostsFromConfig({ host: '10.0.0.5', port: 9000 }), [
		{ host: '10.0.0.5', port: 9000, socketPort: 9200, name: 'primary' },
	])
	// The Bonjour service names the control socket's port; OSC keeps its own.
	assert.deepEqual(hostsFromConfig({ bonjour_host: '10.0.0.5:7788', host: 'ignored', port: 9001 }), [
		{ host: '10.0.0.5', port: 9001, socketPort: 7788, name: 'primary' },
	])
	assert.deepEqual(hostsFromConfig({ host: '10.0.0.5', backup_host: ' 10.0.0.6 ', port: '', socket_port: 9201 }), [
		{ host: '10.0.0.5', port: 9000, socketPort: 9201, name: 'primary' },
		{ host: '10.0.0.6', port: 9000, socketPort: 9201, name: 'backup' },
	])
	assert.deepEqual(hostsFromConfig({ host: '' }), [])
	assert.deepEqual(hostsFromConfig(undefined), [])
})
