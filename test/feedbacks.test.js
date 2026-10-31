import test from 'node:test'
import assert from 'node:assert/strict'
import { FEEDBACKS, checkFeedback, feedbacksFor, sameCue } from '../src/feedbacks.js'
import { EngineState } from '../src/status.js'
import { str, int } from '../src/osc.js'
import { variableDefinitions, initialValues } from '../src/variables.js'
import { getPresets } from '../src/presets.js'
import { ACTIONS } from '../src/actions.js'
import { hostsFromConfig } from '../src/config.js'

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
	assert.deepEqual(feedbacksFor(['transport']), ['transport_is'])
	assert.deepEqual(feedbacksFor(['timeline_2_transport']), ['transport_is'])
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
	const values = initialValues()
	assert.equal(values.position, 0)
	assert.equal(values.cue, '')
})

test('presets refer to actions and feedbacks that exist, with their options', () => {
	const { structure, presets } = getPresets('enzyme')
	const ids = new Set(Object.keys(presets))
	assert.ok(structure.length >= 6)
	for (const section of structure) {
		for (const ref of section.definitions) assert.ok(ids.has(ref), `${section.id} refers to ${ref}`)
	}
	for (const [id, preset] of Object.entries(presets)) {
		assert.equal(preset.type, 'simple', id)
		for (const step of preset.steps) {
			for (const action of [...step.down, ...step.up]) {
				const def = ACTIONS[action.actionId]
				assert.ok(def, `${id} uses action ${action.actionId}`)
				for (const field of def.options)
					assert.ok(field.id in action.options, `${id} sets ${action.actionId}.${field.id}`)
			}
		}
		for (const feedback of preset.feedbacks) {
			const def = FEEDBACKS[feedback.feedbackId]
			assert.ok(def, `${id} uses feedback ${feedback.feedbackId}`)
			for (const field of def.options)
				assert.ok(field.id in feedback.options, `${id} sets ${feedback.feedbackId}.${field.id}`)
		}
	}
	assert.match(presets.cue_current.style.text, /\$\(enzyme:cue\)/)
})

test('the config gives the hosts', () => {
	assert.deepEqual(hostsFromConfig({ host: '10.0.0.5', port: 9000 }), [
		{ host: '10.0.0.5', port: 9000, name: 'primary' },
	])
	assert.deepEqual(hostsFromConfig({ bonjour_host: '10.0.0.5:7788', host: 'ignored', port: 9001 }), [
		{ host: '10.0.0.5', port: 9001, name: 'primary' },
	])
	assert.deepEqual(hostsFromConfig({ host: '10.0.0.5', backup_host: ' 10.0.0.6 ', port: '' }), [
		{ host: '10.0.0.5', port: 9000, name: 'primary' },
		{ host: '10.0.0.6', port: 9000, name: 'backup' },
	])
	assert.deepEqual(hostsFromConfig({ host: '' }), [])
	assert.deepEqual(hostsFromConfig(undefined), [])
})
