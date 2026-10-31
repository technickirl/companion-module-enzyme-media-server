// The fake engine's control socket: a TCP server that speaks the engine's
// side of the line protocol. It challenges, checks the Hello (with a nonce
// and proof when started with a key), welcomes, sends the fixture show, the
// status and the set list, a picture for each media tile, then StatusFast
// thirty times a second and a Thumbnail per raster at the asked rate. It
// takes the few picture settings a client may send and refuses nothing
// else, but notes any command, which this module must never send.

import net from 'node:net'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { LineSplitter } from '../src/lines.js'
import { prove } from '../src/control.js'
import {
	PROTOCOL,
	SCHEMA,
	IDS,
	fixtureShow,
	fixtureStatus,
	fixtureSetList,
	fixtureStatusFast,
	tinyJpeg,
} from './fixture-show.js'

export class FakeControlServer extends EventEmitter {
	/**
	 * @param {object} [options]
	 * @param {number} [options.port] 0 for any free port
	 * @param {string} [options.key] the control key the engine asks for; none for no challenge
	 * @param {boolean} [options.following] a backup following its leader (not live)
	 * @param {boolean} [options.live] a following backup that has gone live
	 * @param {object} [options.state] the fake's OSC state, read for the status
	 * @param {number} [options.fastRate] StatusFast lines a second
	 * @param {boolean} [options.echo] print what arrives
	 */
	constructor({
		port = 9200,
		key = '',
		following = false,
		live = false,
		state = {},
		fastRate = 30,
		echo = false,
	} = {}) {
		super()
		this.wantedPort = port
		this.key = key
		this.following = following
		this.live = live
		this.state = state
		this.fastRate = fastRate
		this.echo = echo
		this.server = null
		this.clients = new Set()
		this.show = fixtureShow()
		this.setList = fixtureSetList()
		this.nextClient = 1
		this.tick = 0
		this.mediaKeys = new Map(IDS.media.map((id) => [id, `/media/${id}.mov`]))
	}

	get port() {
		return this.server ? this.server.address().port : 0
	}

	log(text) {
		if (this.echo) console.log(`${new Date().toISOString().slice(11, 23)} socket: ${text}`)
	}

	async start() {
		this.server = net.createServer((socket) => this.accept(socket))
		await new Promise((resolve, reject) => {
			this.server.once('error', reject)
			this.server.listen(this.wantedPort, '0.0.0.0', () => {
				this.server.off('error', reject)
				resolve()
			})
		})
		this.fastTimer = setInterval(() => this.sendFast(), 1000 / this.fastRate)
		return this
	}

	stop() {
		clearInterval(this.fastTimer)
		for (const c of this.clients) this.drop(c)
		if (this.server) {
			this.server.close()
			this.server = null
		}
	}

	status() {
		return fixtureStatus({ following: this.following, live: this.live, state: this.state, controlKey: this.key !== '' })
	}

	/** Sends the whole status again, as the engine does when something changes. */
	statusChanged() {
		this.broadcast({ Status: this.status() })
	}

	showChanged() {
		this.broadcast({ Show: this.show })
	}

	setListChanged() {
		this.broadcast({ SetList: this.setList })
	}

	accept(socket) {
		const client = {
			socket,
			splitter: new LineSplitter(),
			admitted: false,
			nonce: this.key !== '' ? crypto.randomBytes(16).toString('hex') : null,
			id: this.nextClient++,
			previewRate: 4,
			previewWidth: 320,
			rasterPictures: true,
			nextCueTimeline: null,
			pictureTimer: null,
			frame: 0,
			settings: [],
		}
		this.clients.add(client)
		socket.setNoDelay(true)
		socket.on('error', () => {})
		socket.on('close', () => this.drop(client))
		socket.on('data', (chunk) => {
			for (const line of client.splitter.push(chunk)) this.onLine(client, line)
		})
		this.send(client, { Challenge: { protocol: PROTOCOL, schema: SCHEMA, nonce: client.nonce } })
		this.emit('connection', client)
	}

	drop(client) {
		if (!this.clients.has(client)) return
		this.clients.delete(client)
		if (client.pictureTimer) clearInterval(client.pictureTimer)
		client.socket.destroy()
		this.emit('dropped', client)
	}

	send(client, message) {
		if (client.socket.destroyed) return
		client.socket.write(`${JSON.stringify(message)}\n`)
	}

	broadcast(message) {
		for (const c of this.clients) if (c.admitted) this.send(c, message)
	}

	onLine(client, line) {
		let message
		try {
			message = JSON.parse(line)
		} catch {
			this.log(`unreadable line from client ${client.id}`)
			return
		}
		if (!client.admitted) {
			this.hello(client, message)
			return
		}
		const name = typeof message === 'string' ? message : Object.keys(message)[0]
		const body = typeof message === 'string' ? null : message[name]
		switch (name) {
			case 'PreviewRate':
				client.previewRate = Number(body?.per_second ?? 0)
				this.restartPictures(client)
				break
			case 'PreviewWidth':
				client.previewWidth = Math.min(1920, Math.max(160, Number(body) || 320))
				break
			case 'RasterPictures':
				client.rasterPictures = body !== false
				this.restartPictures(client)
				break
			case 'NextCueTimeline':
				client.nextCueTimeline = typeof body === 'number' ? body : null
				break
			case 'Command':
			case 'Manual':
				this.log(`client ${client.id} sent ${name}, which a read-only client must not`)
				this.emit('forbidden', name, client)
				return
			default:
				this.log(`client ${client.id} sent ${name}, ignored`)
				this.emit('ignored', name, client)
				return
		}
		client.settings.push({ [name]: body })
		this.log(`client ${client.id} set ${name} ${JSON.stringify(body)}`)
		this.emit('setting', name, body, client)
	}

	hello(client, message) {
		const hello = message && typeof message === 'object' ? message.Hello : null
		const refuse = (kind, why) => {
			this.log(`client ${client.id} refused: ${why}`)
			this.send(client, { Refused: { kind, why } })
			this.emit('refused', why, client)
			client.socket.end()
		}
		if (!hello) return refuse('NoHello', 'the connection said something other than Hello first')
		if (hello.protocol !== PROTOCOL) {
			return refuse(
				{ Protocol: { engine: PROTOCOL, client: hello.protocol ?? 0 } },
				`the engine speaks protocol ${PROTOCOL} and this client ${hello.protocol ?? 0}: they are different builds of Enzyme; use the same build on both`,
			)
		}
		if (hello.schema !== SCHEMA) {
			return refuse(
				{ Schema: { engine: SCHEMA, client: hello.schema ?? 0 } },
				`the engine reads show schema ${SCHEMA} and this client ${hello.schema ?? 0}: they are different builds of Enzyme`,
			)
		}
		if (client.nonce) {
			if (typeof hello.proof !== 'string')
				return refuse('KeyNeeded', 'this engine asks for its control key, and none was given')
			const expected = prove(this.key, client.nonce)
			if (
				hello.proof.length !== expected.length ||
				!crypto.timingSafeEqual(Buffer.from(hello.proof), Buffer.from(expected))
			) {
				return refuse('KeyWrong', "the control key given is not this engine's")
			}
		}
		client.admitted = true
		client.name = hello.name
		client.tiles = new Map((hello.tiles ?? []).map(([entry, key]) => [entry, key]))
		this.log(`client ${client.id} admitted as ${hello.name}`)
		this.send(client, 'Admitted')
		this.send(client, {
			Welcome: { name: 'Fake Enzyme', version: 'fake 0.1', client: client.id, protocol: PROTOCOL, schema: SCHEMA },
		})
		this.send(client, { Show: this.show })
		this.send(client, { Status: this.status() })
		this.send(client, { SetList: this.setList })
		for (const [entry, key] of this.mediaKeys) {
			if (client.tiles.get(entry) === key) continue
			this.send(client, {
				MediaThumbnail: { entry, width: 64, height: 36, jpeg: tinyJpeg(64, 36, entry % 16), frame: 0, key },
			})
		}
		this.restartPictures(client)
		this.emit('admitted', client)
	}

	restartPictures(client) {
		if (client.pictureTimer) {
			clearInterval(client.pictureTimer)
			client.pictureTimer = null
		}
		if (!client.admitted || client.previewRate <= 0 || !client.rasterPictures) return
		client.pictureTimer = setInterval(() => this.sendPictures(client), 1000 / client.previewRate)
	}

	sendPictures(client) {
		client.frame++
		const width = Math.min(client.previewWidth, 160)
		const height = Math.round((width * 9) / 16)
		for (const raster of this.show.rasters) {
			this.send(client, {
				Thumbnail: { raster: raster.id, width, height, jpeg: tinyJpeg(width, height, client.frame) },
			})
		}
		const timeline = client.nextCueTimeline ?? this.show.master
		const next = this.state.next_cue || '1'
		this.send(client, {
			NextCueThumbnail: {
				raster: this.show.rasters[0].id,
				timeline,
				cue: String(next),
				width,
				height,
				jpeg: tinyJpeg(width, height, 99),
			},
		})
	}

	sendFast() {
		this.tick++
		this.broadcast({ StatusFast: fixtureStatusFast(this.tick) })
	}
}
