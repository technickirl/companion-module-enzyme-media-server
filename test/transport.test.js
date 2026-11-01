// The Go button as the shell lights it: the three new status values, the
// go_lit, looping_until_go and go_fired feedbacks with their timers, the
// pause / resume command, an engine without the values, and the presets.

import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatus, EngineState } from '../src/status.js'
import { checkFeedback, FEEDBACKS } from '../src/feedbacks.js'
import { GoLight } from '../src/golight.js'
import { buildAction, nullContext } from '../src/actions.js'
import { getPresets } from '../src/presets.js'
import { TRANSPORT_STATES, TRANSPORT_COMMANDS } from '../src/choices.js'
import { FakeEngine } from './fake-engine.js'
import { str, int, float } from '../src/osc.js'
import { combineRgb } from '@companion-module/base'

const msg = (address, ...args) => ({ address, args })

/** A state fed the master's word and flags, and timeline 2's. */
function stateWith({ word = 'play', waiting, looping, goCount, timeline2 = {} } = {}) {
	const state = new EngineState()
	state.apply(msg('/status/transport', str(word)))
	if (waiting !== undefined) state.apply(msg('/status/waiting', int(waiting)))
	if (looping !== undefined) state.apply(msg('/status/looping', int(looping)))
	if (goCount !== undefined) state.apply(msg('/status/go_count', int(goCount)))
	if (timeline2.word) state.apply(msg('/status/timeline/2/transport', str(timeline2.word)))
	if (timeline2.waiting !== undefined) state.apply(msg('/status/timeline/2/waiting', int(timeline2.waiting)))
	if (timeline2.looping !== undefined) state.apply(msg('/status/timeline/2/looping', int(timeline2.looping)))
	if (timeline2.goCount !== undefined) state.apply(msg('/status/timeline/2/go_count', int(timeline2.goCount)))
	return state
}

test('the three addresses parse for the master and for timeline N, from ints or floats', () => {
	assert.deepEqual(parseStatus(msg('/status/waiting', int(1))), [['waiting', 1]])
	assert.deepEqual(parseStatus(msg('/status/looping', float(0))), [['looping', 0]])
	assert.deepEqual(parseStatus(msg('/status/go_count', int(7))), [['go_count', 7]])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/waiting', int(0))), [['timeline_2_waiting', 0]])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/looping', int(1))), [['timeline_2_looping', 1]])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/go_count', float(3))), [['timeline_2_go_count', 3]])
	const state = new EngineState()
	assert.equal(state.get('waiting'), undefined, 'unknown until received')
	assert.equal(state.get('go_count'), undefined)
})

test('the transport state labels say what the words mean', () => {
	const labels = Object.fromEntries(TRANSPORT_STATES.map((s) => [s.id, s.label]))
	assert.match(labels.hold, /^Held/)
	assert.match(labels.stop, /^Paused/)
	assert.match(labels.play, /Playing/)
	assert.match(labels.chase, /timecode/)
	assert.ok(TRANSPORT_COMMANDS.some((c) => c.id === 'play_pause'))
})

test('go_lit for each word and flag', () => {
	const lit = (opts) => checkFeedback('go_lit', { timeline: '' }, stateWith(opts))
	assert.equal(lit({ word: 'play' }), true)
	assert.equal(lit({ word: 'chase' }), true)
	assert.equal(lit({ word: 'hold' }), false)
	assert.equal(lit({ word: 'stop' }), false)
	assert.equal(lit({ word: 'stop', waiting: 1 }), true)
	assert.equal(lit({ word: 'hold', waiting: 1 }), true)
	assert.equal(lit({ word: 'stop', waiting: 0 }), false)
	assert.equal(lit({ word: 'stop', looping: 1 }), false, 'looping alone is the flash, not the steady light')
	const two = stateWith({ word: 'stop', timeline2: { word: 'stop', waiting: 1 } })
	assert.equal(checkFeedback('go_lit', { timeline: '2' }, two), true)
	assert.equal(checkFeedback('go_lit', { timeline: '' }, two), false)
	assert.equal(checkFeedback('go_lit', { timeline: '9' }, two), false)
})

test('looping_until_go alternates every 500 ms while looping, and the timer stops when nothing loops', () => {
	mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
	try {
		const changes = []
		const light = new GoLight({ onChange: (what) => changes.push(what) })
		const state = stateWith({ word: 'hold', looping: 0 })
		light.update(state, ['transport', 'looping'])
		assert.equal(light.flashTimer, null, 'no timer while nothing loops')
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), false)

		state.apply(msg('/status/looping', int(1)))
		light.update(state, ['looping'])
		assert.ok(light.flashTimer, 'a timer while looping')
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), true, 'bright first')
		mock.timers.tick(500)
		assert.equal(
			checkFeedback('looping_until_go', { timeline: '' }, state, null, light),
			false,
			'dim after half a second',
		)
		mock.timers.tick(500)
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), true)
		assert.equal(changes.filter((c) => c === 'flash').length, 3)

		// Timeline 2 loops too: one timer, both in step.
		state.apply(msg('/status/timeline/2/looping', int(1)))
		light.update(state, ['timeline_2_looping'])
		assert.equal(checkFeedback('looping_until_go', { timeline: '2' }, state, null, light), true)
		mock.timers.tick(500)
		assert.equal(checkFeedback('looping_until_go', { timeline: '2' }, state, null, light), false)
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), false)

		state.apply(msg('/status/looping', int(0)))
		light.update(state, ['looping'])
		assert.ok(light.flashTimer, 'still a timer while timeline 2 loops')
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), false)
		state.apply(msg('/status/timeline/2/looping', int(0)))
		light.update(state, ['timeline_2_looping'])
		assert.equal(light.flashTimer, null, 'the timer stops when nothing loops')
		assert.equal(light.flashOn, false)
		const before = changes.length
		mock.timers.tick(5000)
		assert.equal(changes.length, before, 'no more ticks')
		light.stop()
	} finally {
		mock.timers.reset()
	}
})

test('go_fired is true for 300 ms after a rise and not on the first value', () => {
	mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
	try {
		const changes = []
		const light = new GoLight({ onChange: (what) => changes.push(what) })
		const state = stateWith({ word: 'play', goCount: 4 })
		light.update(state, ['transport', 'go_count'])
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), false, 'the first value is not a Go')
		state.apply(msg('/status/go_count', int(5)))
		light.update(state, ['go_count'])
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), true)
		mock.timers.tick(299)
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), true)
		mock.timers.tick(1)
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), false)
		assert.deepEqual(changes, ['fired', 'fired'])
		// A count that falls (an engine restarted) does not fire.
		state.apply(msg('/status/go_count', int(0)))
		light.update(state, ['go_count'])
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), false)
		// Timeline 2's own count, and its first value.
		state.apply(msg('/status/timeline/2/go_count', int(1)))
		light.update(state, ['timeline_2_go_count'])
		assert.equal(checkFeedback('go_fired', { timeline: '2' }, state, null, light), false)
		state.apply(msg('/status/timeline/2/go_count', int(2)))
		light.update(state, ['timeline_2_go_count'])
		assert.equal(checkFeedback('go_fired', { timeline: '2' }, state, null, light), true)
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), false)
		light.stop()
		assert.equal(checkFeedback('go_fired', { timeline: '2' }, state, null, light), false, 'cleared on destroy')
	} finally {
		mock.timers.reset()
	}
})

test('pause / resume sends pause, go or nothing by the word', () => {
	const send = (word, timeline = '') => {
		const state = stateWith({ word: 'hold', timeline2: { word: 'play' } })
		if (timeline === '') state.apply(msg('/status/transport', str(word)))
		else state.apply(msg(`/status/timeline/${timeline}/transport`, str(word)))
		const logged = []
		const ctx = { ...nullContext(state), log: (level, text) => logged.push([level, text]) }
		return [buildAction('transport', { command: 'play_pause', timeline }, ctx).map((m) => m.address), logged]
	}
	assert.deepEqual(send('play')[0], ['/transport/pause'])
	assert.deepEqual(send('chase')[0], ['/transport/pause'])
	assert.deepEqual(send('stop')[0], ['/transport/go'])
	const [held, logged] = send('hold')
	assert.deepEqual(held, [])
	assert.equal(logged[0][0], 'debug')
	assert.deepEqual(send('play', '2')[0], ['/timeline/2/transport/pause'])
	assert.deepEqual(send('stop', '2')[0], ['/timeline/2/transport/go'])
	const unknown = buildAction('transport', { command: 'play_pause', timeline: '7' }, nullContext(new EngineState()))
	assert.deepEqual(unknown, [])
	assert.deepEqual(
		buildAction('transport', { command: 'pause', timeline: '' }, nullContext()).map((m) => m.address),
		['/transport/pause'],
	)
})

test('an old engine without the values gives green on play, no flashing and no errors', () => {
	mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
	try {
		const light = new GoLight({ onChange: () => {} })
		const engine = new FakeEngine({ port: 0, oldEngine: true, looping: true })
		const state = new EngineState()
		const changed = []
		for (const m of engine.steadySet('light')) changed.push(...(state.apply(m)?.changed ?? []))
		light.update(state, changed)
		assert.ok(!changed.some((c) => /waiting|looping|go_count/.test(c)))
		assert.equal(checkFeedback('go_lit', { timeline: '' }, state, null, light), false)
		engine.apply(msg('/transport/go'))
		for (const m of engine.steadySet('light')) light.update(state, state.apply(m)?.changed ?? [])
		assert.equal(checkFeedback('go_lit', { timeline: '' }, state, null, light), true, 'green on play')
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), false)
		assert.equal(checkFeedback('go_fired', { timeline: '' }, state, null, light), false)
		assert.equal(light.flashTimer, null)
		mock.timers.tick(1000)
		assert.equal(checkFeedback('looping_until_go', { timeline: '' }, state, null, light), false)
	} finally {
		mock.timers.reset()
	}
})

test('the fake engine counts Gos and sends the flags; pause gives stop, stop and hold give hold', () => {
	const engine = new FakeEngine({ port: 0, timelines: 2, looping: true, waiting: false })
	const value = (address) => engine.steadySet('light').find((m) => m.address === address)?.args[0].value
	assert.equal(value('/status/looping'), 1)
	assert.equal(value('/status/go_count'), 0)
	engine.apply(msg('/transport/go'))
	assert.equal(engine.state.transport, 'play')
	assert.equal(value('/status/go_count'), 1)
	assert.equal(value('/status/looping'), 0, 'Go moves it on')
	engine.apply(msg('/cue/go', int(3)))
	engine.apply(msg('/timeline/2/transport/go'))
	engine.apply(msg('/timeline/2/cue/go', int(1)))
	assert.equal(value('/status/go_count'), 2)
	assert.equal(value('/status/timeline/2/go_count'), 2)
	engine.apply(msg('/transport/pause'))
	assert.equal(engine.state.transport, 'stop')
	engine.apply(msg('/transport/stop'))
	assert.equal(engine.state.transport, 'hold')
	engine.apply(msg('/transport/go'))
	engine.apply(msg('/transport/hold'))
	assert.equal(engine.state.transport, 'hold')
	engine.apply(msg('/fake/looping', int(1)))
	assert.equal(value('/status/looping'), 1)
	engine.apply(msg('/fake/waiting', int(1)))
	assert.equal(value('/status/waiting'), 1)
	assert.equal(
		new FakeEngine({ port: 0, oldEngine: true }).steadySet('light').some((m) => m.address === '/status/go_count'),
		false,
	)
})

test('the Go preset: the layered variant has the box, three texts and the three feedbacks in order', () => {
	const state = new EngineState()
	state.apply(msg('/status/timeline/2/transport', str('stop')))
	state.apply(msg('/status/timeline/3/name', str('Encore')))
	const { structure, presets } = getPresets('enzyme', null, state)
	for (const [id, timeline, nameVar, nextVar] of [
		['transport_go', '', 'master_name', 'next_cue'],
		['timeline_2_go', '2', 'timeline_2_name', 'timeline_2_next_cue'],
		['timeline_3_go', '3', 'timeline_3_name', 'timeline_3_next_cue'],
	]) {
		const preset = presets[id]
		assert.equal(preset.type, 'alternatives', id)
		const [layered, simple] = preset.variants
		assert.equal(layered.type, 'layered')
		const master = timeline === ''
		assert.deepEqual(
			layered.elements.map((e) => [e.type, e.id]),
			master
				? [
						['box', 'background'],
						['text', 'timeline'],
						['text', 'go'],
						['text', 'section'],
						['text', 'next'],
					]
				: [
						['box', 'background'],
						['text', 'timeline'],
						['text', 'go'],
						['text', 'next'],
					],
		)
		if (master) {
			assert.equal(layered.elements[3].text, '$(enzyme:section)')
			assert.ok(simple.style.text.includes('$(enzyme:section)\\n'), simple.style.text)
		}
		assert.equal(layered.elements[1].text, `$(enzyme:${nameVar})`)
		assert.equal(layered.elements[2].text, 'GO')
		assert.equal(layered.elements[2].weight, 'bold')
		assert.ok(layered.elements[2].fontsize >= layered.elements[1].fontsize)
		assert.ok(layered.elements.at(-1).text.startsWith(`$(enzyme:${nextVar}) `), layered.elements.at(-1).text)
		assert.deepEqual(
			layered.feedbacks.map((f) => f.feedbackId),
			['go_lit', 'looping_until_go', 'go_fired'],
		)
		for (const f of layered.feedbacks) {
			assert.equal(f.options.timeline, timeline)
			assert.equal(f.styleOverrides[0].elementId, 'background')
			assert.equal(f.styleOverrides[0].elementProperty, 'color')
		}
		assert.equal(layered.feedbacks[2].styleOverrides.length, master ? 5 : 4, 'go_fired blackens every text')
		assert.deepEqual(layered.steps[0].down, [{ actionId: 'transport', options: { command: 'go', timeline } }])
		assert.equal(simple.type, 'simple')
		const expected = master
			? `$(enzyme:${nameVar})\\nGO\\n$(enzyme:section)\\n$(enzyme:${nextVar})`
			: `$(enzyme:${nameVar})\\nGO\\n$(enzyme:${nextVar})`
		assert.ok(simple.style.text.startsWith(expected), simple.style.text)
		assert.deepEqual(
			simple.feedbacks.map((f) => f.feedbackId),
			['go_lit', 'looping_until_go', 'go_fired'],
		)
	}
	assert.ok(!presets.timeline_1_go && !presets.timeline_4_go, 'only the timelines the state knows')
	const timelines = structure.find((s) => s.id === 'timelines')
	assert.deepEqual(timelines.definitions, ['timeline_2_go', 'timeline_2_stop', 'timeline_3_go', 'timeline_3_stop'])
	assert.ok(
		!getPresets('enzyme', null, null).structure.some((s) => s.id === 'timelines'),
		'no section with no timelines known',
	)
})

test('the Pause, Stop and Hold presets have the corrected colours and Pause sends pause / resume', () => {
	const { presets, structure } = getPresets('enzyme', null, null)
	const transport = structure.find((s) => s.id === 'transport').definitions
	assert.ok(transport.includes('transport_play_pause') && !transport.includes('transport_pause'))
	assert.deepEqual(presets.transport_play_pause.steps[0].down[0].options, { command: 'play_pause', timeline: '' })
	assert.deepEqual(presets.transport_play_pause.feedbacks[0].options, { state: 'stop', timeline: '' })
	assert.equal(presets.transport_play_pause.feedbacks[0].style.bgcolor, combineRgb(200, 120, 0), 'amber while paused')
	assert.equal(presets.transport_stop.feedbacks[0].style.bgcolor, combineRgb(180, 0, 0), 'red while held')
	assert.equal(FEEDBACKS.go_fired.style.bgcolor, combineRgb(170, 255, 185))
	assert.deepEqual(presets.transport_stop.feedbacks[0].options, { state: 'hold', timeline: '' })
	assert.deepEqual(presets.transport_hold.feedbacks[0].options, { state: 'hold', timeline: '' })
	assert.equal(presets.transport_stop.feedbacks[0].style.bgcolor, presets.transport_hold.feedbacks[0].style.bgcolor)
	assert.notEqual(
		presets.transport_stop.feedbacks[0].style.bgcolor,
		presets.transport_play_pause.feedbacks[0].style.bgcolor,
	)
	assert.deepEqual(presets.transport_tc_lock.feedbacks[0].options, { state: 'chase', timeline: '' })
})

test('every transport key is drawn at 30: a word, or two lines of two, fits a key', () => {
	const { presets } = getPresets('enzyme', null, null)
	for (const [id, preset] of Object.entries(presets)) {
		if (!id.startsWith('transport_') || preset.type !== 'simple') continue
		const size = preset.style.size
		assert.notEqual(size, 'auto', id)
		assert.notEqual(size, 24, id)
		if (!preset.style.text.includes('\\n')) assert.ok(size >= 30, `${id} ${size}`)
	}
	assert.equal(presets.transport_stop.style.size, 30, 'a one-word key at 44 spilt past the key (until 0.2.2)')
	assert.equal(presets.transport_skip_forward.style.size, 30)
	assert.equal(presets.transport_skip_back.style.text, 'SKIP TO\\nPREV CUE')
	assert.equal(presets.transport_go_next.style.text, 'GO\\nNEXT CUE')
	assert.equal(presets.transport_go_previous.name, 'Go on the previous cue')
	assert.equal(presets.transport_section_next.style.text, 'NEXT\\nSECTION')
})
