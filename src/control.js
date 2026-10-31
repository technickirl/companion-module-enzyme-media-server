// The control socket: Enzyme's own TCP link, read for names and pictures.
// One JSON object a line each way. The engine speaks first with a
// Challenge; the client answers with a Hello (and a proof under the control
// key when a nonce came), and on Admitted and Welcome the show, the status,
// the set list and the pictures follow unasked. This connection writes
// nothing beyond that handshake and a few picture settings.
//
// StatusFast is the bulk of the traffic and carries nothing wanted here, so
// a line is classified by its first bytes and parsed only when it is one of
// the few messages read. A client that stops reading for three seconds is
// dropped, so lines are consumed as they come.

import net from 'node:net'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { LineSplitter } from './lines.js'

const PROOF_LABEL = 'enzyme control key v1\n'
const BACKOFF_MIN = 1_000
const BACKOFF_MAX = 30_000
export const DEFAULT_PORT = 9200

/** The answer to a nonce under the control key: hex HMAC-SHA256. */
export function prove(key, nonce) {
	return crypto.createHmac('sha256', key).update(PROOF_LABEL).update(nonce).digest('hex')
}

/** The messages read, by the bytes a line starts with. */
const WANTED = [
	['{"Challenge"', 'Challenge'],
	['{"Refused"', 'Refused'],
	['{"Welcome"', 'Welcome'],
	['{"Show"', 'Show'],
	['{"Status":', 'Status'],
	['{"SetList"', 'SetList'],
	['{"Thumbnail"', 'Thumbnail'],
	['{"NextCueThumbnail"', 'NextCueThumbnail'],
	['{"MediaThumbnail"', 'MediaThumbnail'],
]

/** The message a line carries, if one that is read; null for any other. */
export function classify(line) {
	if (line === '"Admitted"') return 'Admitted'
	if (line.charCodeAt(0) !== 123) return null
	for (const [prefix, name] of WANTED) {
		if (line.startsWith(prefix)) return name
	}
	return null
}

export class ControlSocket extends EventEmitter {
	/**
	 * @param {object} options
	 * @param {string} options.host
	 * @param {number} options.port
	 * @param {string} [options.key] the engine's control key, when it asks other machines for one
	 * @param {string} [options.name] for the log
	 * @param {(level: string, text: string) => void} [options.log]
	 * @param {number} [options.backoffMin] milliseconds before the first reconnection
	 * @param {number} [options.backoffMax]
	 * @param {(line: string) => any} [options.parse] the JSON parser, replaceable for a test
	 * @param {() => [number, string][]} [options.tiles] the media pictures already held, for the Hello
	 */
	constructor({ host, port, key, name, log, backoffMin = BACKOFF_MIN, backoffMax = BACKOFF_MAX, parse, tiles }) {
		super()
		this.host = host
		this.port = port
		this.key = key || ''
		this.name = name ?? 'control'
		this.log = log ?? (() => {})
		this.backoffMin = backoffMin
		this.backoffMax = backoffMax
		this.backoff = backoffMin
		this.parse = parse ?? JSON.parse
		this.tiles = tiles ?? (() => [])
		this.socket = null
		this.splitter = null
		this.timer = null
		this.stopped = true
		this.connected = false
		this.engine = null
		this.refusal = null
		this.settings = {}
		this.sentSettings = {}
		this.lines = 0
		this.skipped = 0
	}

	start() {
		if (!this.stopped) return
		this.stopped = false
		this.backoff = this.backoffMin
		this.connect()
	}

	stop() {
		this.stopped = true
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		this.closeSocket()
	}

	closeSocket() {
		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.on('error', () => {})
			this.socket.destroy()
			this.socket = null
		}
		if (this.connected) {
			this.connected = false
			this.emit('closed')
		}
	}

	connect() {
		if (this.stopped || this.socket) return
		this.log('debug', `${this.name}: connecting to ${this.host}:${this.port}`)
		const socket = net.connect({ host: this.host, port: this.port })
		this.socket = socket
		this.splitter = new LineSplitter()
		this.sentSettings = {}
		socket.setNoDelay(true)
		socket.on('connect', () => this.log('debug', `${this.name}: connected, waiting for the challenge`))
		socket.on('data', (chunk) => this.onData(chunk))
		socket.on('error', (err) => this.log('debug', `${this.name}: ${err.message}`))
		socket.on('close', () => {
			if (this.socket !== socket) return
			this.socket = null
			const was = this.connected
			this.connected = false
			this.engine = null
			if (was) this.emit('closed')
			this.scheduleReconnect()
		})
	}

	scheduleReconnect() {
		if (this.stopped || this.timer) return
		const wait = this.backoff
		this.backoff = Math.min(this.backoff * 2, this.backoffMax)
		this.log('debug', `${this.name}: reconnecting in ${wait} ms`)
		this.timer = setTimeout(() => {
			this.timer = null
			this.connect()
		}, wait)
	}

	onData(chunk) {
		for (const line of this.splitter.push(chunk)) {
			this.lines++
			const name = classify(line)
			if (!name) {
				this.skipped++
				continue
			}
			if (name === 'Admitted') {
				this.emit('admitted')
				continue
			}
			let message
			try {
				message = this.parse(line)
			} catch (err) {
				this.log('debug', `${this.name}: unreadable ${name}: ${err.message}`)
				continue
			}
			this.handle(name, message[name])
		}
	}

	handle(name, body) {
		switch (name) {
			case 'Challenge':
				this.answer(body ?? {})
				break
			case 'Refused':
				this.refusal = body?.why ?? 'refused'
				this.log('warn', `${this.name}: refused: ${this.refusal}`)
				this.emit('refused', this.refusal)
				break
			case 'Welcome':
				this.connected = true
				this.refusal = null
				this.backoff = this.backoffMin
				this.engine = { name: body?.name ?? '', version: body?.version ?? '', client: body?.client ?? 0 }
				this.log('info', `${this.name}: welcomed by ${this.engine.name} ${this.engine.version}`)
				this.emit('welcome', this.engine)
				this.pushSettings()
				break
			case 'Show':
				this.emit('show', body)
				break
			case 'Status':
				this.emit('status', body)
				break
			case 'SetList':
				this.emit('setlist', body)
				break
			case 'Thumbnail':
				this.emit('thumbnail', body)
				break
			case 'NextCueThumbnail':
				this.emit('nextCueThumbnail', body)
				break
			case 'MediaThumbnail':
				this.emit('mediaThumbnail', body)
				break
			default:
				break
		}
	}

	/** The Hello: the engine's own numbers echoed, and the proof when asked. */
	answer(challenge) {
		const hello = {
			name: 'Companion',
			protocol: challenge.protocol ?? 0,
			schema: challenge.schema ?? 0,
			tiles: this.tiles(),
		}
		const nonce = challenge.nonce
		if (typeof nonce === 'string' && nonce !== '') {
			if (this.key !== '') hello.proof = prove(this.key, nonce)
			else this.log('warn', `${this.name}: the engine asks for its control key and none is set`)
		}
		this.write({ Hello: hello })
	}

	write(message) {
		if (!this.socket) return false
		try {
			this.socket.write(`${JSON.stringify(message)}\n`)
			return true
		} catch (err) {
			this.log('debug', `${this.name}: write failed: ${err.message}`)
			return false
		}
	}

	/**
	 * The picture settings wanted: `{ PreviewRate: {per_second}, PreviewWidth,
	 * RasterPictures, NextCueTimeline }`. Sent now when connected, and again
	 * after every Welcome. Only the ones that changed go.
	 */
	setSettings(settings) {
		this.settings = { ...this.settings, ...settings }
		if (this.connected) this.pushSettings()
	}

	pushSettings() {
		for (const [name, value] of Object.entries(this.settings)) {
			const text = JSON.stringify(value)
			if (this.sentSettings[name] === text) continue
			if (this.write({ [name]: value })) this.sentSettings[name] = text
		}
	}
}
