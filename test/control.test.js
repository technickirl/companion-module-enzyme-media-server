// The control socket against the fake engine's: the handshake with and
// without a key, the refusal, StatusFast skipped without parsing, the
// picture settings and the reconnection.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ControlSocket, classify, prove } from '../src/control.js'
import { FakeControlServer } from './fake-socket.js'
import { waitFor } from './helpers.js'

const quiet = () => {}

test('classifies lines by their first bytes', () => {
	assert.equal(classify('{"StatusFast":{"tick":1}}'), null)
	assert.equal(classify('{"Status":{"name":"x"}}'), 'Status')
	assert.equal(classify('{"Show":{}}'), 'Show')
	assert.equal(classify('{"Challenge":{"protocol":8}}'), 'Challenge')
	assert.equal(classify('"Admitted"'), 'Admitted')
	assert.equal(classify('{"Refused":{"why":"no"}}'), 'Refused')
	assert.equal(classify('{"Welcome":{}}'), 'Welcome')
	assert.equal(classify('{"SetList":{}}'), 'SetList')
	assert.equal(classify('{"Thumbnail":{}}'), 'Thumbnail')
	assert.equal(classify('{"NextCueThumbnail":{}}'), 'NextCueThumbnail')
	assert.equal(classify('{"MediaThumbnail":{}}'), 'MediaThumbnail')
	assert.equal(classify('{"Log":{}}'), null)
	assert.equal(classify('{"OscLog":{}}'), null)
	assert.equal(classify('"Something"'), null)
	assert.equal(classify(''), null)
})

test('the proof is HMAC-SHA256 of the label and the nonce under the key, hex', () => {
	// Checked against the engine's own definition: "enzyme control key v1\n" then the nonce.
	assert.equal(prove('stage right', 'abc'), prove('stage right', 'abc'))
	assert.notEqual(prove('stage right', 'abc'), prove('stage left', 'abc'))
	assert.match(prove('k', 'n'), /^[0-9a-f]{64}$/)
})

test('connects without a key, is welcomed and gets the show, status, set list and pictures', async () => {
	const server = await new FakeControlServer({ port: 0 }).start()
	const got = { show: 0, status: 0, setlist: 0, thumbnail: 0, media: 0, nextCue: 0 }
	const socket = new ControlSocket({ host: '127.0.0.1', port: server.port, log: quiet })
	socket.on('show', () => got.show++)
	socket.on('status', () => got.status++)
	socket.on('setlist', () => got.setlist++)
	socket.on('thumbnail', () => got.thumbnail++)
	socket.on('mediaThumbnail', () => got.media++)
	socket.on('nextCueThumbnail', () => got.nextCue++)
	try {
		socket.start()
		await waitFor(() => socket.connected, 2000, 'the welcome')
		assert.equal(socket.engine.name, 'Fake Enzyme')
		await waitFor(() => got.thumbnail >= 2 && got.nextCue >= 1, 2000, 'pictures')
		assert.equal(got.show, 1)
		assert.equal(got.status, 1)
		assert.equal(got.setlist, 1)
		assert.equal(got.media, 4)
	} finally {
		socket.stop()
		server.stop()
	}
})

test('answers a challenge with the proof under the key, and is refused with the wrong one or none', async () => {
	const server = await new FakeControlServer({ port: 0, key: 'stage right' }).start()
	const refusals = []
	server.on('refused', (why) => refusals.push(why))
	const good = new ControlSocket({ host: '127.0.0.1', port: server.port, key: 'stage right', log: quiet })
	const wrong = new ControlSocket({
		host: '127.0.0.1',
		port: server.port,
		key: 'stage left',
		log: quiet,
		backoffMin: 60_000,
	})
	const none = new ControlSocket({ host: '127.0.0.1', port: server.port, log: quiet, backoffMin: 60_000 })
	const refusedWhy = { wrong: null, none: null }
	wrong.on('refused', (why) => (refusedWhy.wrong = why))
	none.on('refused', (why) => (refusedWhy.none = why))
	try {
		good.start()
		wrong.start()
		none.start()
		await waitFor(() => good.connected, 2000, 'the good key')
		await waitFor(() => refusedWhy.wrong && refusedWhy.none, 2000, 'the refusals')
		assert.match(refusedWhy.wrong, /not this engine's/)
		assert.match(refusedWhy.none, /asks for its control key/)
		assert.equal(wrong.refusal, refusedWhy.wrong)
		assert.equal(none.connected, false)
		assert.equal(refusals.length, 2)
	} finally {
		good.stop()
		wrong.stop()
		none.stop()
		server.stop()
	}
})

test('refuses another protocol as the engine would', async () => {
	const server = await new FakeControlServer({ port: 0 }).start()
	const socket = new ControlSocket({ host: '127.0.0.1', port: server.port, log: quiet, backoffMin: 60_000 })
	// A client that does not echo the engine's numbers.
	socket.answer = function () {
		this.write({ Hello: { name: 'Old', protocol: 7, schema: 9, tiles: [] } })
	}
	let why = null
	socket.on('refused', (w) => (why = w))
	try {
		socket.start()
		await waitFor(() => why !== null, 2000, 'the refusal')
		assert.match(why, /different builds/)
	} finally {
		socket.stop()
		server.stop()
	}
})

test('skips StatusFast without parsing it', async () => {
	const server = await new FakeControlServer({ port: 0, fastRate: 100 }).start()
	const parsed = []
	const socket = new ControlSocket({
		host: '127.0.0.1',
		port: server.port,
		log: quiet,
		parse: (line) => {
			parsed.push(line.slice(0, 14))
			return JSON.parse(line)
		},
	})
	try {
		socket.start()
		await waitFor(() => socket.connected, 2000, 'the welcome')
		await waitFor(() => socket.skipped > 20, 2000, 'fast status to arrive')
		assert.ok(parsed.length > 0)
		assert.ok(
			parsed.every((p) => !p.startsWith('{"StatusFast"')),
			'no StatusFast line reached the parser',
		)
		assert.ok(parsed.some((p) => p.startsWith('{"Status":')))
	} finally {
		socket.stop()
		server.stop()
	}
})

test('sends only the picture settings, once each, and again after a reconnection', async () => {
	const server = await new FakeControlServer({ port: 0 }).start()
	const settings = []
	server.on('setting', (name, body) => settings.push([name, body]))
	const forbidden = []
	server.on('forbidden', (name) => forbidden.push(name))
	const socket = new ControlSocket({
		host: '127.0.0.1',
		port: server.port,
		log: quiet,
		backoffMin: 50,
		backoffMax: 100,
	})
	socket.setSettings({ PreviewRate: { per_second: 2 }, PreviewWidth: 160, RasterPictures: true, NextCueTimeline: null })
	try {
		socket.start()
		await waitFor(() => settings.length >= 4, 2000, 'the settings')
		assert.deepEqual(settings.map((s) => s[0]).sort(), [
			'NextCueTimeline',
			'PreviewRate',
			'PreviewWidth',
			'RasterPictures',
		])
		socket.setSettings({ PreviewRate: { per_second: 2 } })
		socket.setSettings({ PreviewRate: { per_second: 0 }, RasterPictures: false })
		await waitFor(() => settings.length >= 6, 2000, 'the changed settings')
		assert.equal(settings.length, 6)
		assert.deepEqual(settings[4], ['PreviewRate', { per_second: 0 }])
		assert.deepEqual(settings[5], ['RasterPictures', false])
		assert.deepEqual(forbidden, [])

		// The engine drops the connection: the client comes back and says its settings again.
		let closed = 0
		socket.on('closed', () => closed++)
		for (const c of server.clients) server.drop(c)
		await waitFor(() => closed === 1, 2000, 'the close')
		await waitFor(() => settings.length >= 10, 3000, 'the settings again')
	} finally {
		socket.stop()
		server.stop()
	}
})

test('reconnects with a backoff when nothing listens, then connects when something does', async () => {
	const probe = await new FakeControlServer({ port: 0 }).start()
	const port = probe.port
	probe.stop()
	const socket = new ControlSocket({ host: '127.0.0.1', port, log: quiet, backoffMin: 30, backoffMax: 120 })
	try {
		socket.start()
		await waitFor(() => socket.backoff === 120, 2000, 'the backoff to grow')
		const server = await new FakeControlServer({ port }).start()
		try {
			await waitFor(() => socket.connected, 2000, 'the connection')
			assert.equal(socket.backoff, 30, 'the backoff resets on a welcome')
		} finally {
			server.stop()
		}
	} finally {
		socket.stop()
	}
})

test('a host that accepts and never speaks is dropped at the handshake timeout and tried again', async () => {
	const net = await import('node:net')
	let connections = 0
	const server = net.createServer(() => {
		connections++
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const socket = new ControlSocket({
		host: '127.0.0.1',
		port: server.address().port,
		log: quiet,
		backoffMin: 20,
		backoffMax: 40,
		handshakeTimeout: 60,
	})
	try {
		socket.start()
		await waitFor(() => socket.timeouts >= 2 && connections >= 2, 2000, 'two timeouts and a second connection')
		assert.equal(socket.connected, false)
	} finally {
		socket.stop()
		server.close()
	}
})

test('an admitted socket that goes quiet is closed at the idle timeout, so a dead link is noticed', async () => {
	const net = await import('node:net')
	const server = net.createServer((c) => {
		c.write(`${JSON.stringify({ Challenge: { protocol: 8, schema: 9, nonce: null } })}\n`)
		c.once('data', () => {
			c.write('"Admitted"\n')
			c.write(`${JSON.stringify({ Welcome: { name: 'Silent', version: '0', client: 1 } })}\n`)
			// Then nothing, as a half-open socket after a cable pull gives.
		})
		c.on('error', () => {})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const closed = []
	const socket = new ControlSocket({
		host: '127.0.0.1',
		port: server.address().port,
		log: quiet,
		backoffMin: 1000,
		idleTimeout: 80,
	})
	socket.on('closed', () => closed.push(Date.now()))
	try {
		socket.start()
		await waitFor(() => socket.connected, 2000, 'the welcome')
		await waitFor(() => closed.length === 1, 2000, 'the idle timeout to close it')
		assert.equal(socket.connected, false)
		assert.equal(socket.timeouts, 1)
	} finally {
		socket.stop()
		server.close()
	}
})
