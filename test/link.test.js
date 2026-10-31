// The link against the fake engine: it finds the engine, subscribes, loses
// it after two unanswered pings, finds it again and subscribes again; it
// asks for status again when that goes quiet; and with a backup it takes
// status from whichever engine answers.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineLink } from '../src/link.js'
import { FakeEngine } from './fake-engine.js'
import { waitFor, sleep } from './helpers.js'

const PING = 60

function makeLink(hosts, extra = {}) {
	const events = { connection: [], status: [] }
	const link = new EngineLink({
		hosts,
		level: 'light',
		pingInterval: PING,
		statusTimeout: 300,
		log: () => {},
		...extra,
	})
	link.on('connection', (c) => events.connection.push(c))
	link.on('status', (m) => events.status.push(m))
	return { link, events }
}

test('connects, subscribes, drops out after two unanswered pings, and comes back', async () => {
	const engine = await new FakeEngine({ port: 0 }).start()
	const port = engine.port
	const subscribes = []
	engine.on('subscribe', (level) => subscribes.push(level))
	const { link, events } = makeLink([{ host: '127.0.0.1', port, name: 'primary' }])
	try {
		await link.start()
		await waitFor(() => link.live === 0, 2000, 'the primary to answer')
		assert.deepEqual(subscribes, ['light'])
		assert.equal(events.connection.at(-1).hosts[0].up, true)
		await waitFor(() => events.status.length > 5, 2000, 'status')
		assert.ok(events.status.some((m) => m.address === '/status/heartbeat'))

		// The engine goes away: two pings go unanswered, then it is down.
		engine.stop()
		await waitFor(() => link.live === -1, PING * 6, 'the primary to be judged down')
		assert.equal(events.connection.at(-1).hosts[0].up, false)

		// It comes back on the same port: a pong brings it up and a new subscription.
		const again = await new FakeEngine({ port }).start()
		const subscribesAgain = []
		again.on('subscribe', (level) => subscribesAgain.push(level))
		try {
			await waitFor(() => link.live === 0, PING * 6, 'the primary to answer again')
			await waitFor(() => subscribesAgain.length === 1, 1000, 'the new subscription')
			assert.deepEqual(subscribesAgain, ['light'])
		} finally {
			again.stop()
		}
	} finally {
		link.stop()
		engine.stop()
	}
})

test('subscribes again when status stops but pings are answered', async () => {
	const engine = await new FakeEngine({ port: 0 }).start()
	const subscribes = []
	engine.on('subscribe', (level) => subscribes.push(level))
	const { link } = makeLink([{ host: '127.0.0.1', port: engine.port, name: 'primary' }], { level: 'full' })
	try {
		await link.start()
		await waitFor(() => subscribes.length === 1, 2000, 'the subscription')
		assert.deepEqual(subscribes, ['full'])
		// The engine forgets its subscribers (as a restarted one would) but still answers pings.
		engine.subscribers.clear()
		await waitFor(() => subscribes.length >= 2, 2000, 'a second subscription')
	} finally {
		link.stop()
		engine.stop()
	}
})

test('sends to both engines and takes status from the primary, then the backup when the primary is lost', async () => {
	const primary = await new FakeEngine({ port: 0 }).start()
	const backup = await new FakeEngine({ port: 0, following: true }).start()
	const heard = { primary: [], backup: [] }
	primary.on('command', (m) => heard.primary.push(m.address))
	backup.on('ignored', (m) => heard.backup.push(m.address))
	const backupSubscribes = []
	backup.on('subscribe', (level) => backupSubscribes.push(level))
	const { link, events } = makeLink([
		{ host: '127.0.0.1', port: primary.port, name: 'primary' },
		{ host: '127.0.0.1', port: backup.port, name: 'backup' },
	])
	try {
		await link.start()
		await waitFor(() => link.live === 0, 2000, 'the primary to answer')
		link.send({ address: '/transport/go', args: [] })
		await waitFor(() => heard.primary.includes('/transport/go'), 1000, 'the primary to hear Go')
		await waitFor(() => heard.backup.includes('/transport/go'), 1000, 'the backup to hear Go')
		// The following backup answers nothing, so it is judged down while the primary stays live.
		await waitFor(() => events.connection.at(-1)?.hosts[1].up === false, PING * 6, 'the backup to be judged down')
		assert.equal(link.live, 0)
		assert.equal(backupSubscribes.length, 0, 'a following backup took no subscription')

		// The primary is lost and the backup goes live: status now comes from the backup.
		primary.stop()
		backup.following = false
		await waitFor(() => link.live === 1, PING * 8, 'the backup to be live')
		await waitFor(() => backupSubscribes.length === 1, 1000, 'the backup subscription')
		events.status.length = 0
		await waitFor(() => events.status.length > 3, 2000, 'status from the backup')
		assert.ok(events.status.every((m) => m.address.startsWith('/status/')))
	} finally {
		link.stop()
		primary.stop()
		backup.stop()
	}
})

test('reports no engine when nothing answers', async () => {
	// A port nobody listens on; the OS refuses the datagrams quietly.
	const { link, events } = makeLink([{ host: '127.0.0.1', port: 1, name: 'primary' }])
	try {
		await link.start()
		assert.equal(link.live, -1)
		await waitFor(() => events.connection.length > 0, PING * 6, 'the verdict')
		assert.equal(events.connection.at(-1).hosts[0].up, false)
		assert.equal(events.connection.at(-1).live, -1)
	} finally {
		link.stop()
	}
	await sleep(10)
})
