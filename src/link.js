// The link to the engines: one UDP socket, sent from and listened on, so
// Enzyme's replies and status come back to it. Each host is pinged every
// twenty seconds; two unanswered pings mean it is down, and a pong from a
// host that was down (or never answered) subscribes to it again. Commands go
// to every host; status is taken from the first host that answers, the
// primary while it does, else the backup once it has gone live. (A backup
// that is following its leader answers nothing, so to this link it is down
// until it takes over, which is exactly when its status is wanted.)
//
// This file knows nothing of Companion, so the tests drive it against the
// fake engine with short intervals.

import dgram from 'node:dgram'
import dns from 'node:dns'
import { EventEmitter } from 'node:events'
import { encode, decode, str, describe } from './osc.js'

const PING_INTERVAL = 20_000
/** Status that stays quiet this long on a host that answers pings is asked for again. */
const STATUS_TIMEOUT = 5_000
/** Pings without an answer before a host is down. */
const MISSED_PINGS = 2

class EngineLink extends EventEmitter {
	/**
	 * @param {object} options
	 * @param {{host: string, port: number, name: string}[]} options.hosts the primary first, the backup after
	 * @param {'light'|'full'} options.level the status level to subscribe at
	 * @param {number} [options.pingInterval] milliseconds between pings
	 * @param {number} [options.statusTimeout] milliseconds of silence before subscribing again
	 * @param {(level: string, text: string) => void} [options.log]
	 */
	constructor({ hosts, level, pingInterval = PING_INTERVAL, statusTimeout = STATUS_TIMEOUT, log }) {
		super()
		this.hosts = hosts.map((h) => ({
			host: h.host,
			port: h.port,
			name: h.name,
			address: null,
			up: null,
			pending: 0,
			lastStatus: 0,
			lastSubscribe: 0,
		}))
		this.level = level === 'full' ? 'full' : 'light'
		this.pingInterval = pingInterval
		this.statusTimeout = statusTimeout
		this.log = log ?? (() => {})
		this.socket = null
		this.timer = null
		this.live = -1
		/** A host to take status from while it answers, chosen from outside (the one driving the show). */
		this.preferred = null
		this.sent = 0
		this.received = 0
	}

	/** Opens the socket and starts pinging. Resolves once the socket is bound. */
	async start() {
		if (this.socket) return
		const socket = dgram.createSocket('udp4')
		this.socket = socket
		socket.on('message', (buffer, rinfo) => this.onMessage(buffer, rinfo))
		socket.on('error', (err) => {
			this.log('error', `socket: ${err.message}`)
			this.emit('error', err)
		})
		await new Promise((resolve, reject) => {
			socket.once('error', reject)
			socket.bind(0, () => {
				socket.off('error', reject)
				resolve()
			})
		})
		await Promise.all(this.hosts.map((h) => this.resolve(h)))
		this.tick()
		this.timer = setInterval(() => this.tick(), this.pingInterval)
	}

	/** Unsubscribes from the hosts that answer and closes the socket. */
	stop() {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		if (this.socket) {
			for (const [i, h] of this.hosts.entries()) {
				if (h.up) this.sendTo(i, { address: '/unsubscribe', args: [] })
			}
			try {
				this.socket.close()
			} catch {
				// Already closed.
			}
			this.socket = null
		}
		this.live = -1
	}

	/** The socket's own port, for a test or a log line. */
	get port() {
		try {
			return this.socket?.address().port ?? 0
		} catch {
			return 0
		}
	}

	async resolve(h) {
		if (h.address) return true
		try {
			const { address } = await dns.promises.lookup(h.host, { family: 4 })
			h.address = address
			return true
		} catch (err) {
			this.log('error', `${h.name}: cannot resolve ${h.host}: ${err.message}`)
			return false
		}
	}

	/** Sends one message to every host. */
	send(message) {
		for (let i = 0; i < this.hosts.length; i++) this.sendTo(i, message)
	}

	/** Sends several messages to every host, in order. */
	sendAll(messages) {
		for (const m of messages) this.send(m)
	}

	sendTo(i, message) {
		const h = this.hosts[i]
		if (!this.socket || !h) return
		if (!h.address) {
			// Try again later; a name may resolve once the network is up.
			this.resolve(h).then((ok) => ok && this.sendTo(i, message))
			return
		}
		const buffer = encode(message)
		this.socket.send(buffer, 0, buffer.length, h.port, h.address, (err) => {
			if (err) this.log('debug', `${h.name}: send failed: ${err.message}`)
		})
		this.sent++
		this.log('debug', `> ${h.name} ${describe(message)}`)
	}

	subscribe(i) {
		const h = this.hosts[i]
		h.lastSubscribe = Date.now()
		this.sendTo(i, { address: '/subscribe', args: [str(this.level)] })
	}

	/** The ping round: judges the last, sends the next, and renews quiet status. */
	tick() {
		const now = Date.now()
		let changed = false
		for (const [i, h] of this.hosts.entries()) {
			if (h.pending >= MISSED_PINGS && h.up !== false) {
				h.up = false
				changed = true
				this.log(i === 0 ? 'warn' : 'debug', `${h.name}: no answer to ${MISSED_PINGS} pings`)
			}
			h.pending++
			this.sendTo(i, { address: '/ping', args: [] })
		}
		if (changed) this.updateLive()
		const live = this.hosts[this.live]
		if (
			live &&
			live.up &&
			now - live.lastStatus > this.statusTimeout &&
			now - live.lastSubscribe > this.statusTimeout
		) {
			this.log('debug', `${live.name}: no status for ${this.statusTimeout} ms, subscribing again`)
			this.subscribe(this.live)
		}
	}

	/** Prefers a host for status while it answers; null for the first that answers. */
	prefer(index) {
		const i = typeof index === 'number' && this.hosts[index] ? index : null
		if (i === this.preferred) return
		this.preferred = i
		this.updateLive()
	}

	updateLive() {
		let live = this.hosts.findIndex((h) => h.up)
		if (this.preferred !== null && this.hosts[this.preferred].up) live = this.preferred
		if (live !== this.live) {
			this.live = live
			this.log('info', live < 0 ? 'no engine answers' : `status from ${this.hosts[live].name}`)
		}
		this.emit('connection', this.connection())
	}

	/** Who answers, for the connection status. */
	connection() {
		return {
			live: this.live,
			hosts: this.hosts.map((h) => ({ name: h.name, up: h.up })),
		}
	}

	onMessage(buffer, rinfo) {
		this.received++
		const i = this.hosts.findIndex((h) => h.address === rinfo.address && h.port === rinfo.port)
		if (i < 0) {
			this.log('debug', `ignored ${buffer.length} bytes from ${rinfo.address}:${rinfo.port}`)
			return
		}
		const h = this.hosts[i]
		for (const message of decode(buffer)) {
			if (message.address === '/pong') {
				h.pending = 0
				if (!h.up) {
					h.up = true
					this.log('info', `${h.name}: answering`)
					this.subscribe(i)
					this.updateLive()
				}
				continue
			}
			if (message.address.startsWith('/status/')) {
				h.lastStatus = Date.now()
				if (i === this.live) this.emit('status', message, i)
				continue
			}
			this.log('debug', `< ${h.name} ${describe(message)}`)
		}
	}
}

export { EngineLink, PING_INTERVAL, STATUS_TIMEOUT, MISSED_PINGS }
