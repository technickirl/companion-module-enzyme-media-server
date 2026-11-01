import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineState } from '../src/status.js'

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
