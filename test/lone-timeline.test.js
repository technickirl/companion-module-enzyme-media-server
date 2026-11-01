import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineState } from '../src/status.js'
import { GoLight } from '../src/golight.js'
import { FEEDBACKS } from '../src/feedbacks.js'

const msg = (address, ...args) => ({
	address,
	args: args.map((v) => (typeof v === 'number' ? { type: 'i', value: v } : { type: 's', value: v })),
})

test("a show's lone timeline takes the master's state: the engine reports no /status/timeline/N/ lines for it", () => {
	const state = new EngineState()
	state.apply(msg('/status/transport', 'play'))
	state.apply(msg('/status/waiting', 0))
	state.apply(msg('/status/looping', 1))
	state.apply(msg('/status/go_count', 3))
	assert.equal(state.timelines.size, 0)
	assert.equal(state.timelineValue(1, 'transport'), 'play')
	assert.equal(state.timelineValue(1, 'looping'), 1)
	assert.equal(state.timelineValue(2, 'go_count'), 3, 'any number: there is only the one')
	// Once the engine names timelines, each keeps to its own lines.
	state.apply(msg('/status/timeline/2/transport', 'hold'))
	assert.equal(state.timelineValue(2, 'transport'), 'hold')
	assert.equal(state.timelineValue(1, 'transport'), undefined, "not the master's any more")
})

test("a lone timeline's looping flash and Go flash are the master's timers", () => {
	const state = new EngineState()
	const light = new GoLight({ onChange: () => {}, flashMs: 60_000, firedMs: 60_000 })
	state.apply(msg('/status/looping', 1))
	state.apply(msg('/status/go_count', 1))
	light.update(state, ['looping', 'go_count'])
	assert.equal(state.lightKey(1), 0)
	assert.equal(
		FEEDBACKS.looping_until_go.check({ timeline: '1' }, state, null, light),
		true,
		'bright on the first half',
	)
	state.apply(msg('/status/go_count', 2))
	light.update(state, ['go_count'])
	assert.equal(FEEDBACKS.go_fired.check({ timeline: '1' }, state, null, light), true)
	// With timelines named, each has its own timers again.
	state.apply(msg('/status/timeline/2/looping', 0))
	assert.equal(state.lightKey(1), 1)
	assert.equal(FEEDBACKS.looping_until_go.check({ timeline: '1' }, state, null, light), false)
	light.stop()
})
