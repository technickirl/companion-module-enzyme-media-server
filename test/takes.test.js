// Takes (experimental): the last-take status, the next slate as the engine
// counts it, the three take actions on the wire, the two feedbacks with the
// moment after a take, the presets, the fake engine, and the marks that say
// this build is for testing.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import dgram from 'node:dgram'
import { parseStatus, EngineState } from '../src/status.js'
import { nextSlate, sameSlate } from '../src/takes.js'
import { buildAction, nullContext } from '../src/actions.js'
import { checkFeedback, feedbacksFor } from '../src/feedbacks.js'
import { GoLight } from '../src/golight.js'
import { getPresets } from '../src/presets.js'
import { getConfigFields } from '../src/config.js'
import { initialValues, BASE_VARIABLES } from '../src/variables.js'
import { FakeEngine } from './fake-engine.js'
import { encode, decode, str } from '../src/osc.js'
import { roundTrip, waitFor } from './helpers.js'

const msg = (address, ...args) => ({ address, args })

const wire = (id, options, ctx) =>
	buildAction(id, options, ctx).map((m) => {
		const back = roundTrip(m)
		return [back.address, back.args.map((a) => `${a.type}:${a.value}`)]
	})

test('the last take parses to its slate and time, and starts unknown', () => {
	assert.deepEqual(parseStatus(msg('/status/take/last', str('42A-3'), str('2026-11-01 14:35:07'))), [
		['take_slate', '42A-3'],
		['take_time', '2026-11-01 14:35:07'],
	])
	assert.deepEqual(parseStatus(msg('/status/take/last')), [
		['take_slate', ''],
		['take_time', ''],
	])
	assert.equal(parseStatus(msg('/status/take/next', str('x'))), null)
	const state = new EngineState()
	assert.equal(state.get('take_slate'), undefined)
	assert.ok(BASE_VARIABLES.take_slate && BASE_VARIABLES.take_time && BASE_VARIABLES.take_next_slate)
	assert.equal(initialValues().take_next_slate, '1')
})

test('the next slate counts as the engine does', () => {
	assert.equal(nextSlate('42A-3'), '42A-4')
	assert.equal(nextSlate('Take 7'), 'Take 8')
	assert.equal(nextSlate('Take 9'), 'Take 10')
	assert.equal(nextSlate('007'), '008')
	assert.equal(nextSlate('  12  '), '13')
	assert.equal(nextSlate(''), '1')
	assert.equal(nextSlate(undefined), '1')
	assert.equal(nextSlate('Scene'), 'Scene 2')
	assert.equal(nextSlate('Scene 2'), 'Scene 3')
})

test('slates compare trimmed, case and spacing aside, and never when empty', () => {
	assert.ok(sameSlate('42A-3', ' 42a-3 '))
	assert.ok(sameSlate('Take 7', 'take_7'))
	assert.ok(!sameSlate('42A-3', '42A-4'))
	assert.ok(!sameSlate('', ''))
	assert.ok(!sameSlate(undefined, ''))
})

test('take, restore and region looks on the wire', () => {
	assert.deepEqual(wire('take', { slate: '' }), [['/take', []]])
	assert.deepEqual(wire('take', { slate: ' 42A-3 ' }), [['/take', ['s:42A-3']]])
	assert.deepEqual(wire('take', { slate: '7' }), [['/take', ['s:7']]])
	assert.deepEqual(wire('take_restore', { slate: '42A-3', timeline: '', layer: '' }), [['/take/restore', ['s:42A-3']]])
	assert.deepEqual(wire('take_restore', { slate: '42A-3', timeline: '2', layer: '' }), [
		['/take/restore', ['s:42A-3', 'i:2']],
	])
	assert.deepEqual(wire('take_restore', { slate: '42A-3', timeline: 'Band', layer: 'LED screens' }), [
		['/take/restore', ['s:42A-3', 's:Band', 's:LED screens']],
	])
	assert.deepEqual(wire('take_restore', { slate: '42A-3', timeline: '1', layer: '3' }), [
		['/take/restore', ['s:42A-3', 'i:1', 'i:3']],
	])
	// The engine takes the layer after the timeline: a layer alone is not sent.
	const logged = []
	const ctx = { ...nullContext(), log: (level, text) => logged.push([level, text]) }
	assert.deepEqual(wire('take_restore', { slate: '42A-3', timeline: '', layer: '3' }, ctx), [])
	assert.deepEqual(wire('take_restore', { slate: '', timeline: '', layer: '' }, ctx), [])
	assert.equal(logged.length, 2)
	assert.deepEqual(wire('take_regions', { slate: '42A-3' }), [['/take/regions', ['s:42A-3']]])
	assert.deepEqual(wire('take_regions', { slate: '' }), [])
})

test('the last-take feedback, and the moment after a take lands', () => {
	const state = new EngineState()
	assert.ok(!checkFeedback('take_was', { slate: '42A-3' }, state), 'nothing heard yet')
	state.apply(msg('/status/take/last', str('42A-3'), str('2026-11-01 14:35:07')))
	assert.ok(checkFeedback('take_was', { slate: '42a-3' }, state))
	assert.ok(!checkFeedback('take_was', { slate: '42A-4' }, state))
	assert.deepEqual(feedbacksFor(['take_slate']), ['take_was'])
	assert.deepEqual(feedbacksFor(['take_time']), ['take_fired'])

	const changes = []
	const light = new GoLight({ onChange: (what) => changes.push(what), firedMs: 30 })
	// The first value heard is not a take landing: a reconnection would flash otherwise.
	light.update(state, ['take_slate', 'take_time'])
	assert.ok(!checkFeedback('take_fired', {}, state, null, light))
	assert.deepEqual(changes, [])
	state.apply(msg('/status/take/last', str('42A-4'), str('2026-11-01 14:36:10')))
	light.update(state, ['take_slate', 'take_time'])
	assert.ok(checkFeedback('take_fired', {}, state, null, light))
	assert.deepEqual(changes, ['fired'])
	return new Promise((resolve) => {
		setTimeout(() => {
			assert.ok(!checkFeedback('take_fired', {}, state, null, light), 'over after the moment')
			assert.deepEqual(changes, ['fired', 'fired'])
			light.reset()
			assert.equal(light.lastTake, undefined)
			resolve()
		}, 60)
	})
})

test('the takes presets are there and marked experimental', () => {
	const { structure, presets } = getPresets('enzyme', null, null)
	const section = structure.find((s) => s.id === 'takes')
	assert.ok(section)
	assert.match(section.name, /experimental/i)
	for (const id of section.definitions) {
		const preset = presets[id]
		assert.ok(preset, id)
		const variants = preset.type === 'alternatives' ? preset.variants : [preset]
		for (const v of variants) assert.match(v.name, /experimental/i, `${id} is marked`)
	}
	const take = presets.take.variants[1]
	assert.deepEqual(take.steps[0].down, [{ actionId: 'take', options: { slate: '' } }])
	assert.equal(take.feedbacks[0].feedbackId, 'take_fired')
	const next = presets.take_next.variants[1]
	assert.deepEqual(next.steps[0].down, [{ actionId: 'take', options: { slate: '$(enzyme:take_next_slate)' } }])
	assert.deepEqual(presets.take_restore_last.steps[0].down, [
		{ actionId: 'take_restore', options: { slate: '$(enzyme:take_slate)', timeline: '', layer: '' } },
	])
})

test('the build says it is experimental: the settings, the manifest and the version', () => {
	const first = getConfigFields()[0]
	assert.equal(first.type, 'static-text')
	assert.match(first.label, /experimental/i)
	const manifest = JSON.parse(
		fs.readFileSync(path.join(import.meta.dirname, '..', 'companion', 'manifest.json'), 'utf8'),
	)
	assert.match(manifest.description, /^EXPERIMENTAL/)
	assert.match(manifest.products[0], /experimental/i)
	const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'))
	assert.match(pkg.version, /-takes\.\d+$/, 'a prerelease version')
	assert.match(pkg.scripts['package:experimental'], /--prerelease/)
})

test('live: the fake engine records takes and reports the last one', async () => {
	const engine = await new FakeEngine({ port: 0 }).start()
	const socket = dgram.createSocket('udp4')
	const heard = []
	socket.on('message', (buffer) => {
		for (const m of decode(buffer)) if (m.address === '/status/take/last') heard.push(m.args.map((a) => a.value))
	})
	await new Promise((resolve) => socket.bind(0, resolve))
	const send = (message) => {
		const b = encode(message)
		socket.send(b, 0, b.length, engine.port, '127.0.0.1')
	}
	try {
		send(msg('/subscribe', str('light')))
		await waitFor(() => engine.subscribers.size === 1, 2000, 'the subscription')
		send(msg('/take', str('42A-3')))
		await waitFor(() => heard.some((h) => h[0] === '42A-3'), 2000, 'the take reported')
		assert.match(heard.find((h) => h[0] === '42A-3')[1], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
		send(msg('/take'))
		await waitFor(() => heard.some((h) => h[0] === 'Take 2'), 2000, 'the engine-named take')
		send(msg('/take/restore', str('42A-3'), { type: 'i', value: 2 }))
		await waitFor(() => engine.state.restored.length === 1, 2000, 'the restore noted')
		assert.deepEqual(engine.state.restored, [['restore', '42A-3', '2']])
	} finally {
		socket.close()
		engine.stop()
	}
})

test('live: an old engine reports no take', async () => {
	const engine = await new FakeEngine({ port: 0, oldEngine: true }).start()
	const socket = dgram.createSocket('udp4')
	let takes = 0
	let packets = 0
	socket.on('message', (buffer) => {
		packets++
		for (const m of decode(buffer)) if (m.address === '/status/take/last') takes++
	})
	await new Promise((resolve) => socket.bind(0, resolve))
	const send = (message) => {
		const b = encode(message)
		socket.send(b, 0, b.length, engine.port, '127.0.0.1')
	}
	try {
		send(msg('/subscribe', str('light')))
		await waitFor(() => engine.subscribers.size === 1, 2000, 'the subscription')
		send(msg('/take', str('42A-3')))
		await waitFor(() => engine.state.take !== null && packets > 20, 3000, 'status after the take')
		assert.equal(takes, 0)
	} finally {
		socket.close()
		engine.stop()
	}
})
