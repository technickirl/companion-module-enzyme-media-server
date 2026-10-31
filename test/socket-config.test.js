// The OSC-only path when the socket switch is off, the socket settings
// from the config, and the link's preferred host.

import test from 'node:test'
import assert from 'node:assert/strict'
import { socketsFromConfig, hostsFromConfig, pictureRate } from '../src/config.js'
import { EngineLink } from '../src/link.js'
import { FakeEngine } from './fake-engine.js'
import { waitFor } from './helpers.js'

test('with the socket switched off nothing of part 2 is configured', () => {
	assert.deepEqual(socketsFromConfig({ host: '10.0.0.5', socket: false }, { control_key: 'k' }), [])
	assert.deepEqual(hostsFromConfig({ host: '10.0.0.5', socket: false }), [
		{ host: '10.0.0.5', port: 9000, socketPort: 9200, name: 'primary' },
	])
})

test('the socket settings follow the config, the bonjour port and the secrets', () => {
	assert.deepEqual(socketsFromConfig({ host: '10.0.0.5' }, undefined), [
		{ host: '10.0.0.5', port: 9200, key: '', name: 'primary' },
	])
	assert.deepEqual(
		socketsFromConfig(
			{ host: '10.0.0.5', socket: true, socket_port: 9300, backup_host: '10.0.0.6' },
			{ control_key: ' k ' },
		),
		[
			{ host: '10.0.0.5', port: 9300, key: 'k', name: 'primary' },
			{ host: '10.0.0.6', port: 9300, key: 'k', name: 'backup' },
		],
	)
	assert.deepEqual(socketsFromConfig({ bonjour_host: '10.0.0.7:9250', socket_port: 9200 }, {}), [
		{ host: '10.0.0.7', port: 9250, key: '', name: 'primary' },
	])
	assert.equal(pictureRate({}), 1)
	assert.equal(pictureRate({ picture_rate: 4 }), 4)
	assert.equal(pictureRate({ picture_rate: 0 }), 0)
	assert.equal(pictureRate({ picture_rate: 7 }), 1)
})

test('the fake engine without a socket serves OSC alone, as part 1', async () => {
	const engine = await new FakeEngine({ port: 0 }).start()
	try {
		assert.equal(engine.controlPort, 0)
		assert.equal(engine.control, null)
	} finally {
		engine.stop()
	}
})

test('a preferred host is taken for status while it answers', async () => {
	const a = await new FakeEngine({ port: 0, replyFrom: 'listener' }).start()
	const b = await new FakeEngine({ port: 0, replyFrom: 'listener' }).start()
	const link = new EngineLink({
		hosts: [
			{ host: '127.0.0.1', port: a.port, name: 'primary' },
			{ host: '127.0.0.1', port: b.port, name: 'backup' },
		],
		level: 'light',
		pingInterval: 50,
		log: () => {},
	})
	try {
		await link.start()
		await waitFor(() => link.hosts[0].up && link.hosts[1].up, 2000, 'both to answer')
		assert.equal(link.live, 0)
		link.prefer(1)
		assert.equal(link.live, 1)
		link.prefer(null)
		assert.equal(link.live, 0)
		link.prefer(1)
		b.stop()
		await waitFor(() => link.live === 0, 1000, 'the primary again when the preferred one is lost')
		link.prefer(5)
		assert.equal(link.live, 0)
	} finally {
		link.stop()
		a.stop()
		b.stop()
	}
})
