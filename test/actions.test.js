// Every action, built with its options and checked after a trip through the
// OSC encoder, against the addresses and arguments Enzyme takes.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, buildAction, nullContext, withChoices } from '../src/actions.js'
import { roundTrip } from './helpers.js'

/** Builds, encodes and decodes, and gives [address, [type:value, ...]] per message. */
function wire(id, options, ctx) {
	return buildAction(id, options, ctx).map((m) => {
		const back = roundTrip(m)
		return [
			back.address,
			back.args.map((a) => `${a.type}:${typeof a.value === 'number' ? Math.round(a.value * 1000) / 1000 : a.value}`),
		]
	})
}

test('every action has a name, options with defaults, and builds with its defaults', () => {
	for (const [id, action] of Object.entries(ACTIONS)) {
		assert.ok(action.name, `${id} has a name`)
		const options = {}
		for (const field of action.options) {
			assert.ok(field.id && field.type && field.label, `${id}.${field.id} is a field`)
			if (field.type !== 'static-text') assert.notEqual(field.default, undefined, `${id}.${field.id} has a default`)
			options[field.id] = field.default
		}
		const messages = buildAction(id, options, nullContext())
		assert.ok(Array.isArray(messages), `${id} builds a list`)
		for (const m of messages) {
			assert.match(m.address, /^\/[\w/]+$/, `${id} address ${m.address}`)
			roundTrip(m)
		}
	}
})

test('transport commands, bare for the master and prefixed for a timeline', () => {
	assert.deepEqual(wire('transport', { command: 'go', timeline: '' }), [['/transport/go', []]])
	assert.deepEqual(wire('transport', { command: 'skip_back', timeline: '2' }), [
		['/timeline/2/transport/skip_back', []],
	])
	assert.deepEqual(wire('transport', { command: 'tc_lock', timeline: 'Encore' }), [
		['/timeline/Encore/transport/tc_lock', []],
	])
	assert.deepEqual(wire('transport', { command: 'section_next', timeline: 'led screens' }), [
		['/timeline/led_screens/transport/section_next', []],
	])
})

test('cue, locate and chase', () => {
	assert.deepEqual(wire('cue_go', { cue: '3', timeline: '' }), [['/cue/go', ['i:3']]])
	assert.deepEqual(wire('cue_go', { cue: '1.5', timeline: '' }), [['/cue/go', ['f:1.5']]])
	assert.deepEqual(wire('cue_go', { cue: 'Walk in', timeline: 'encore' }), [['/timeline/encore/cue/go', ['s:Walk in']]])
	assert.deepEqual(wire('locate', { timecode: '01:00:10:00', timeline: '' }), [['/locate', ['s:01:00:10:00']]])
	assert.deepEqual(wire('chase_mode', { mode: 'force_free_run', timeline: '3' }), [
		['/timeline/3/chase/force_free_run', []],
	])
})

test('blackout on, off and toggled from what is known', () => {
	assert.deepEqual(wire('blackout', { state: 'on' }), [['/show/blackout', ['i:1']]])
	assert.deepEqual(wire('blackout', { state: 'off' }), [['/show/blackout', ['i:0']]])
	const ctx = nullContext()
	// Nothing known: toggle turns it on, and remembers.
	assert.deepEqual(wire('blackout', { state: 'toggle' }, ctx), [['/show/blackout', ['i:1']]])
	assert.deepEqual(wire('blackout', { state: 'toggle' }, ctx), [['/show/blackout', ['i:0']]])
	assert.deepEqual(wire('blackout', { state: 'toggle' }, ctx), [['/show/blackout', ['i:1']]])
	// Full status wins over memory.
	const known = { known: () => 1, remember: () => {} }
	assert.deepEqual(wire('blackout', { state: 'toggle' }, known), [['/show/blackout', ['i:0']]])
})

test('master, mode, override and audio', () => {
	assert.deepEqual(wire('master_level', { level: 0.75 }), [['/show/master', ['f:0.75']]])
	assert.deepEqual(wire('mode', { mode: 'edit' }), [['/show/mode', ['s:edit']]])
	assert.deepEqual(wire('override', { owner: 'manual' }), [['/show/override', ['s:manual']]])
	assert.deepEqual(wire('audio_master', { level: 0.5 }), [['/audio/master', ['f:0.5']]])
	assert.deepEqual(wire('audio_mute', { state: 'on' }), [['/audio/mute', ['i:1']]])
	const ctx = nullContext()
	assert.deepEqual(wire('audio_mute', { state: 'toggle' }, ctx), [['/audio/mute', ['i:1']]])
	assert.deepEqual(wire('audio_mute', { state: 'toggle' }, ctx), [['/audio/mute', ['i:0']]])
	assert.deepEqual(wire('audio_bus_level', { bus: 3, level: 0.2 }), [['/audio/bus/3/level', ['f:0.2']]])
	assert.deepEqual(wire('audio_bus_mute', { bus: 8, state: 'off' }), [['/audio/bus/8/mute', ['i:0']]])
})

test('a layer by number or name, and its settings', () => {
	assert.deepEqual(wire('layer_owner', { layer: '2', owner: 'manual', timeline: '' }), [
		['/layer/2/owner', ['s:manual']],
	])
	assert.deepEqual(wire('layer_owner', { layer: '2', owner: 'timeline', timeline: '' }), [
		['/layer/2/owner', ['s:timeline']],
	])
	assert.deepEqual(wire('layer_owner', { layer: '2', owner: 'timeline', timeline: '3' }), [
		['/layer/2/owner', ['s:timeline', 'i:3']],
	])
	assert.deepEqual(wire('layer_owner', { layer: 'LED screens', owner: 'timeline', timeline: 'Encore' }), [
		['/layer/LED_screens/owner', ['s:timeline', 's:Encore']],
	])
	assert.deepEqual(wire('layer_play_mode', { layer: '1', mode: 'loop_retrigger' }), [
		['/layer/1/play_mode', ['s:loop_retrigger']],
	])
	assert.deepEqual(wire('layer_media', { layer: '1', folder: 2, tile: 7 }), [['/layer/1/media', ['i:2', 'i:7']]])
	assert.deepEqual(wire('layer_generator', { layer: '1', folder: 1, tile: 1 }), [
		['/layer/1/generator', ['i:1', 'i:1']],
	])
	assert.deepEqual(wire('layer_effect', { layer: '4', folder: 0, tile: 3 }), [['/layer/4/effect', ['i:0', 'i:3']]])
	assert.deepEqual(wire('layer_mapping', { layer: '1', mapping: 0 }), [['/layer/1/mapping', ['i:0']]])
	assert.deepEqual(wire('layer_blend', { layer: '1', blend: 'screen' }), [['/layer/1/blend', ['s:screen']]])
	assert.deepEqual(wire('layer_key_mode', { layer: '1', mode: 'chroma' }), [['/layer/1/key_mode', ['s:chroma']]])
	assert.deepEqual(wire('layer_transition_time', { layer: '1', time: '2' }), [['/layer/1/transition_time', ['f:2']]])
	assert.deepEqual(wire('layer_transition_time', { layer: '1', time: '2s 12f' }), [
		['/layer/1/transition_time', ['s:2s 12f']],
	])
	assert.deepEqual(wire('layer_transition_type', { layer: '1', kind: 'dip' }), [
		['/layer/1/transition_type', ['s:dip']],
	])
	assert.deepEqual(wire('layer_in_point', { layer: '1', timecode: '00:00:05:00' }), [
		['/layer/1/in_point', ['s:00:00:05:00']],
	])
	assert.deepEqual(wire('layer_out_point', { layer: '1', timecode: '00:01:00:00' }), [
		['/layer/1/out_point', ['s:00:01:00:00']],
	])
	assert.deepEqual(wire('layer_position', { layer: '1', timecode: '00:00:10:12' }), [
		['/layer/1/position', ['s:00:00:10:12']],
	])
})

test('a layer value with its fade time', () => {
	assert.deepEqual(wire('layer_param', { layer: '3', param: 'opacity', value: 0, time: '4' }), [
		['/layer/3/opacity', ['f:0', 'f:4']],
	])
	assert.deepEqual(wire('layer_param', { layer: '3', param: 'opacity', value: 1, time: 'snap' }), [
		['/layer/3/opacity', ['f:1', 's:snap']],
	])
	assert.deepEqual(wire('layer_param', { layer: '3', param: 'rotation', value: -90, time: '' }), [
		['/layer/3/rotation', ['f:-90']],
	])
	assert.deepEqual(wire('layer_param', { layer: '3', param: 'generator_16', value: 0.5, time: '0' }), [
		['/layer/3/generator_16', ['f:0.5', 'f:0']],
	])
})

test('colour in each form, the time after the three values', () => {
	assert.deepEqual(wire('layer_colour', { layer: '1', form: 'rgb', a: 1, b: 0.5, c: 0, time: '2' }), [
		['/layer/1/colour/rgb', ['f:1', 'f:0.5', 'f:0', 'f:2']],
	])
	assert.deepEqual(wire('layer_colour', { layer: '1', form: 'hsi', a: 200, b: 1, c: 1.5, time: '' }), [
		['/layer/1/colour/hsi', ['f:200', 'f:1', 'f:1.5']],
	])
	assert.deepEqual(wire('layer_colour', { layer: '1', form: 'xy', a: 0.3, b: 0.3, c: 1, time: 'snap' }), [
		['/layer/1/colour/xy', ['f:0.3', 'f:0.3', 'f:1', 's:snap']],
	])
})

test('sweeps on a generator or effect value', () => {
	assert.deepEqual(
		wire('layer_sweep', { layer: '2', kind: 'generator', slot: 3, from: 0, to: 1, seconds: 2.5, shape: 'bounce' }),
		[['/layer/2/generator_3/sweep', ['f:0', 'f:1', 'f:2.5', 's:bounce']]],
	)
	assert.deepEqual(
		wire('layer_sweep', { layer: '2', kind: 'effect', slot: 1, from: 0, to: 1, seconds: 2, shape: 'off' }),
		[['/layer/2/effect_1/sweep', ['s:off']]],
	)
})

test('a region and a pixel group look', () => {
	assert.deepEqual(wire('region_look', { raster: '1', region: '2', param: 'intensity', value: 0.5 }), [
		['/raster/1/region/2/intensity', ['f:0.5']],
	])
	assert.deepEqual(wire('region_look', { raster: 'Stage', region: 'Left wall', param: 'kelvin', value: 3200 }), [
		['/raster/Stage/region/Left_wall/kelvin', ['f:3200']],
	])
	assert.deepEqual(wire('region_colour', { raster: '1', region: '1', form: 'rgb', a: 1, b: 0, c: 0 }), [
		['/raster/1/region/1/colour/rgb', ['f:1', 'f:0', 'f:0']],
	])
	assert.deepEqual(wire('region_release', { raster: '1', region: '1', what: 'all' }), [
		['/raster/1/region/1/release', []],
	])
	assert.deepEqual(wire('region_release', { raster: '1', region: '1', what: 'tint' }), [
		['/raster/1/region/1/release', ['s:tint']],
	])
	assert.deepEqual(wire('group_look', { raster: '1', region: '2', group: '3', param: 'tint', value: -0.5 }), [
		['/raster/1/region/2/group/3/tint', ['f:-0.5']],
	])
	assert.deepEqual(wire('group_release', { raster: '1', region: '2', group: '3', what: 'all' }), [
		['/raster/1/region/2/group/3/release', []],
	])
})

test('recalls and the set list', () => {
	assert.deepEqual(wire('recall', { bank: 2, tile: 5 }), [['/recall', ['i:2', 'i:5']]])
	assert.deepEqual(wire('setlist_row_go', { row: 3, view: 'default' }), [['/setlist/row/3/go', []]])
	assert.deepEqual(wire('setlist_row_go', { row: 3, view: 'yes' }), [['/setlist/row/3/go', ['i:1']]])
	assert.deepEqual(wire('setlist_row_go', { row: 3, view: 'no' }), [['/setlist/row/3/go', ['i:0']]])
	assert.deepEqual(wire('setlist_row_skip', { row: 4, skip: 'on' }), [['/setlist/row/4/skip', ['i:1']]])
	assert.deepEqual(wire('setlist_row_skip', { row: 4, skip: 'off' }), [['/setlist/row/4/skip', ['i:0']]])
	assert.deepEqual(wire('setlist_step', { step: 'next' }), [['/setlist/next', []]])
	assert.deepEqual(wire('setlist_step', { step: 'previous' }), [['/setlist/previous', []]])
})

test('custom OSC', () => {
	assert.deepEqual(wire('custom_osc', { address: '/layer/1/opacity', args: '0.5 snap' }), [
		['/layer/1/opacity', ['f:0.5', 's:snap']],
	])
	assert.deepEqual(wire('custom_osc', { address: 'ping', args: '' }), [['/ping', []]])
	assert.deepEqual(wire('custom_osc', { address: '', args: '1' }), [])
})

test('a number field turned into a dropdown keeps its default as a choice id, a string', () => {
	const field = { id: 'layer', choices: 'layer', type: 'number', label: 'Layer', default: 1, min: 1, max: 999, step: 1 }
	const choices = {
		layer: [
			{ id: '1', label: '1: Backdrop' },
			{ id: '2', label: '2: IMAG' },
		],
	}
	const made = withChoices(field, choices)
	assert.equal(made.type, 'dropdown')
	assert.equal(made.default, '1')
	assert.equal(made.allowCustom, true)
	assert.equal('min' in made, false)
	assert.equal(withChoices(field, null).type, 'number', 'without a show the field stays as it was')
})
