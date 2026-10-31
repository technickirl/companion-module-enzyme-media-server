// The status parser, on messages built by hand, on packets captured from the
// fake engine and kept under fixtures, and on a live capture.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import dgram from 'node:dgram'
import { parseStatus, EngineState } from '../src/status.js'
import { encode, decode, int, float, str } from '../src/osc.js'
import { FakeEngine } from './fake-engine.js'
import { waitFor } from './helpers.js'

const msg = (address, ...args) => ({ address, args })

test('parses each status address, whatever the argument types', () => {
	assert.deepEqual(parseStatus(msg('/status/heartbeat', int(42))), [['heartbeat', 42]])
	assert.deepEqual(parseStatus(msg('/status/heartbeat', float(42.0))), [['heartbeat', 42]])
	assert.deepEqual(parseStatus(msg('/status/timecode', str('10:00:05:06'))), [['timecode', '10:00:05:06']])
	assert.deepEqual(parseStatus(msg('/status/position', float(5.25))), [['position', 5.25]])
	assert.deepEqual(parseStatus(msg('/status/position', int(5))), [['position', 5]])
	assert.deepEqual(parseStatus(msg('/status/frame', int(131))), [['frame', 131]])
	assert.deepEqual(parseStatus(msg('/status/transport', str('chase'))), [['transport', 'chase']])
	assert.deepEqual(parseStatus(msg('/status/cue', str('1.5'))), [['cue', '1.5']])
	assert.deepEqual(parseStatus(msg('/status/cue', str(''))), [['cue', '']])
	assert.deepEqual(parseStatus(msg('/status/next_cue', str('2'))), [['next_cue', '2']])
	assert.deepEqual(parseStatus(msg('/status/section', int(2), str('Verse'))), [
		['section_number', 2],
		['section_name', 'Verse'],
	])
	assert.deepEqual(parseStatus(msg('/status/recall', int(1), int(4), str('Warm'))), [
		['recall_bank', 1],
		['recall_tile', 4],
		['recall_name', 'Warm'],
	])
	assert.deepEqual(parseStatus(msg('/status/setlist/current', int(3), str('Encore'))), [
		['setlist_row', 3],
		['setlist_timeline', 'Encore'],
	])
	assert.deepEqual(parseStatus(msg('/status/mode', str('edit'))), [['mode', 'edit']])
	assert.deepEqual(parseStatus(msg('/status/blackout', int(1))), [['blackout', 1]])
	assert.deepEqual(parseStatus(msg('/status/blackout', float(0))), [['blackout', 0]])
	assert.deepEqual(parseStatus(msg('/status/master', float(0.5))), [['master', 0.5]])
	assert.deepEqual(parseStatus(msg('/status/override', str('dmx'))), [['override', 'dmx']])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/timecode', str('00:00:01:00'))), [
		['timeline_2_timecode', '00:00:01:00'],
	])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/transport', str('hold'))), [['timeline_2_transport', 'hold']])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/cue', str('7'))), [['timeline_2_cue', '7']])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/next_cue', str(''))), [['timeline_2_next_cue', '']])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/name', str('Encore'))), [['timeline_2_name', 'Encore']])
	assert.deepEqual(parseStatus(msg('/status/timeline/2/master', int(1))), [['timeline_2_master', 1]])
	assert.deepEqual(parseStatus(msg('/status/layer/3/owner', str('manual'))), [['layer_3_owner', 'manual']])
	assert.deepEqual(parseStatus(msg('/status/layer/3/source', str('media 1/2'))), [['layer_3_source', 'media 1/2']])
	assert.deepEqual(parseStatus(msg('/status/layer/3/showing', int(1))), [['layer_3_showing', 1]])
	assert.deepEqual(parseStatus(msg('/status/layer/3/play_mode', str('hold_last'))), [
		['layer_3_play_mode', 'hold_last'],
	])
	assert.deepEqual(parseStatus(msg('/status/layer/3/opacity', float(0.25))), [['layer_3_opacity', 0.25]])
	assert.deepEqual(parseStatus(msg('/status/layer/3/time', float(12.5))), [['layer_3_time', 12.5]])
	assert.deepEqual(parseStatus(msg('/status/layer/3/colour/rgb', float(1), float(0.5), float(0))), [
		['layer_3_colour_rgb', '1 0.5 0'],
	])
	assert.deepEqual(parseStatus(msg('/status/layer/3/colour/hsi', float(30), float(1), float(1))), [
		['layer_3_colour_hsi', '30 1 1'],
	])
	assert.deepEqual(parseStatus(msg('/status/layer/3/colour/xy', int(0), int(0), int(1))), [
		['layer_3_colour_xy', '0 0 1'],
	])
})

test('ignores what it does not know, and bad arguments', () => {
	assert.equal(parseStatus(msg('/pong')), null)
	assert.equal(parseStatus(msg('/status/nonsense', int(1))), null)
	assert.equal(parseStatus(msg('/status/layer/x/owner', str('manual'))), null)
	assert.equal(parseStatus(msg('/status/timeline/1/colour', str('x'))), null)
	assert.equal(parseStatus(msg('/enzyme/test', int(1))), null)
	assert.deepEqual(parseStatus(msg('/status/position')), [['position', 0]])
	assert.deepEqual(parseStatus(msg('/status/position', str('not a number'))), [['position', 0]])
	assert.deepEqual(parseStatus(msg('/status/section')), [
		['section_number', 0],
		['section_name', ''],
	])
})

test('the state reports changes only, and new timelines and layers once', () => {
	const state = new EngineState()
	assert.deepEqual(state.apply(msg('/status/transport', str('play'))), {
		changed: ['transport'],
		newTimeline: null,
		newLayer: null,
	})
	assert.deepEqual(state.apply(msg('/status/transport', str('play'))), {
		changed: [],
		newTimeline: null,
		newLayer: null,
	})
	assert.deepEqual(state.apply(msg('/status/timeline/2/name', str('Encore'))), {
		changed: ['timeline_2_name'],
		newTimeline: 2,
		newLayer: null,
	})
	assert.deepEqual(state.apply(msg('/status/timeline/2/cue', str('1'))), {
		changed: ['timeline_2_cue'],
		newTimeline: null,
		newLayer: null,
	})
	assert.deepEqual(state.apply(msg('/status/layer/5/showing', int(1))), {
		changed: ['layer_5_showing'],
		newTimeline: null,
		newLayer: 5,
	})
	assert.equal(state.apply(msg('/pong')), null)
	assert.deepEqual([...state.timelines], [2])
	assert.deepEqual([...state.layers], [5])
	assert.equal(state.get('transport'), 'play')
})

test('a timeline by nothing, number or name', () => {
	const state = new EngineState()
	state.apply(msg('/status/timeline/1/name', str('Main')))
	state.apply(msg('/status/timeline/2/name', str('LED screens')))
	state.apply(msg('/status/transport', str('play')))
	state.apply(msg('/status/timeline/2/transport', str('hold')))
	assert.equal(state.timelineNumber(''), 0)
	assert.equal(state.timelineNumber('2'), 2)
	assert.equal(state.timelineNumber('led-screens'), 2)
	assert.equal(state.timelineNumber('LED_SCREENS'), 2)
	assert.equal(state.timelineNumber('Nowhere'), null)
	assert.equal(state.timelineValue(0, 'transport'), 'play')
	assert.equal(state.timelineValue(2, 'transport'), 'hold')
})

/** Feeds raw packets (hex) through the decoder and the state, as the link does. */
function feed(state, packetsHex) {
	let count = 0
	for (const hex of packetsHex) {
		for (const message of decode(Buffer.from(hex, 'hex'))) {
			if (message.address.startsWith('/status/')) {
				state.apply(message)
				count++
			}
		}
	}
	return count
}

test('the fixture captured from the fake engine parses to a full picture', () => {
	const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'status-full.json'), 'utf8'))
	const state = new EngineState()
	const count = feed(state, fixture.packets)
	assert.ok(count > 40, `parsed ${count} status messages`)
	assert.equal(state.get('transport'), 'play')
	assert.equal(state.get('cue'), '3')
	assert.equal(state.get('next_cue'), '4')
	assert.equal(state.get('section_number'), 1)
	assert.equal(state.get('section_name'), 'Opening')
	assert.equal(typeof state.get('heartbeat'), 'number')
	assert.match(state.get('timecode'), /^\d\d:\d\d:\d\d:\d\d$/)
	assert.equal(typeof state.get('position'), 'number')
	assert.equal(typeof state.get('frame'), 'number')
	assert.equal(state.get('recall_bank'), 1)
	assert.equal(state.get('recall_tile'), 4)
	assert.equal(state.get('recall_name'), 'Recall 1/4')
	assert.equal(state.get('setlist_row'), 2)
	assert.equal(state.get('setlist_timeline'), 'Main')
	assert.equal(state.get('mode'), 'show')
	assert.equal(state.get('blackout'), 1)
	assert.equal(state.get('master'), 0.5)
	assert.equal(state.get('override'), 'off')
	assert.deepEqual([...state.timelines], [1, 2])
	assert.equal(state.get('timeline_1_master'), 1)
	assert.equal(state.get('timeline_2_master'), 0)
	assert.equal(state.get('timeline_2_name'), 'Timeline 2')
	assert.deepEqual([...state.layers], [1, 2])
	assert.equal(state.get('layer_1_owner'), 'timeline')
	assert.equal(state.get('layer_1_source'), 'media 1/1')
	assert.equal(state.get('layer_1_showing'), 1)
	assert.equal(state.get('layer_1_play_mode'), 'play')
	assert.equal(state.get('layer_1_opacity'), 1)
	assert.equal(state.get('layer_1_colour_rgb'), '1 1 1')
	assert.equal(state.get('layer_2_showing'), 0)
})

test('live: packets from the fake engine at Light parse and move', async () => {
	const engine = await new FakeEngine({ port: 0, timelines: 1, layers: 2 }).start()
	const socket = dgram.createSocket('udp4')
	const packets = []
	socket.on('message', (buffer) => packets.push(buffer))
	await new Promise((resolve) => socket.bind(0, resolve))
	const send = (message) => {
		const b = encode(message)
		socket.send(b, 0, b.length, engine.port, '127.0.0.1')
	}
	try {
		send(msg('/subscribe', str('light')))
		await waitFor(() => engine.subscribers.size === 1, 2000, 'the subscription')
		send(msg('/transport/go'))
		await waitFor(() => packets.length > 25, 3000, 'status packets')
		const state = new EngineState()
		const count = feed(
			state,
			packets.map((b) => b.toString('hex')),
		)
		assert.ok(count > 20)
		assert.equal(state.get('transport'), 'play')
		assert.equal(state.get('cue'), '1')
		assert.ok(state.get('position') > 0, 'the position moved')
		assert.equal(state.get('mode'), undefined, 'Light has no show-wide values')
		assert.equal(state.layers.size, 0, 'Light has no layers')
	} finally {
		socket.close()
		engine.stop()
	}
})
