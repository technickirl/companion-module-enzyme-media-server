// A fake Enzyme engine for testing the module without a real one. It binds
// a UDP port, answers /ping with /pong, takes /subscribe and /unsubscribe,
// and, as the real engine does, sends its replies and status from a second
// socket bound to any free port rather than from the one it listens on
// (`replyFrom: 'listener'` sends from the listening socket instead, for a
// test that needs two engines on one address told apart),
// sends a status set to each subscriber once a second and the moving part
// ten times a second, and echoes every command it hears to the console. It
// keeps just enough show state (transport, cue, blackout, mode, master,
// override, the last recall, the set list row) for the feedbacks to light.
//
// It also serves the control socket (test/fake-socket.js) for names and
// pictures, with the fixture show, unless told not to.
//
// Run it:  node test/fake-engine.js [--port 9000] [--socket-port 9200] [--key secret] [--timelines 1] [--layers 4] [--quiet]
// Then point the connection at 127.0.0.1 and those ports.

import dgram from 'node:dgram'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { encode, decode, int, float, str, argNumber, argText, describe } from '../src/osc.js'
import { FakeControlServer } from './fake-socket.js'

const SUBSCRIBE_TIMEOUT = 5 * 60 * 1000
const FPS = 25

/** Seconds as 25 fps timecode. */
function timecode(seconds) {
	const total = Math.max(0, Math.floor(seconds * FPS))
	const f = total % FPS
	const s = Math.floor(total / FPS) % 60
	const m = Math.floor(total / FPS / 60) % 60
	const h = Math.floor(total / FPS / 3600)
	const two = (n) => String(n).padStart(2, '0')
	return `${two(h)}:${two(m)}:${two(s)}:${two(f)}`
}

class FakeEngine extends EventEmitter {
	/**
	 * @param {object} [options]
	 * @param {number} [options.port] 0 for any free port
	 * @param {number} [options.timelines] how many timelines the show has
	 * @param {number} [options.layers] how many layers
	 * @param {boolean} [options.echo] print what arrives
	 * @param {boolean} [options.following] a backup following its leader: answers nothing
	 * @param {number} [options.rate] moving messages a second
	 * @param {number|null} [options.socketPort] the control socket's port, 0 for any, null for none
	 * @param {string} [options.key] the control key the socket asks for
	 * @param {'sender'|'listener'} [options.replyFrom] the socket replies go from: a sender of its own (as the engine), or the listener
	 * @param {boolean} [options.waiting] start the master waiting at a mark for timecode
	 * @param {boolean} [options.looping] start the master looping at a section end until Go
	 * @param {boolean} [options.oldEngine] leave out waiting, looping and go_count, as an engine before 1 November 2026
	 */
	constructor({
		port = 9000,
		timelines = 1,
		layers = 4,
		echo = false,
		following = false,
		rate = 10,
		socketPort = null,
		key = '',
		replyFrom = 'sender',
		waiting = false,
		looping = false,
		oldEngine = false,
	} = {}) {
		super()
		this.oldEngine = oldEngine
		this.wantedPort = port
		this.socketPort = socketPort
		this.key = key
		this.replyFrom = replyFrom
		this.sender = null
		this.control = null
		this.timelines = timelines
		this.layers = layers
		this.echo = echo
		this.following = following
		this.rate = rate
		this.socket = null
		this.subscribers = new Map()
		this.started = Date.now()
		this.received = []
		this.state = {
			transport: 'stop',
			cue: '',
			next_cue: '1',
			section: [1, 'Opening'],
			position: 0,
			blackout: 0,
			mode: 'show',
			master: 1,
			override: 'off',
			recall: null,
			setlist: [0, ''],
			// The take recorded last, [slate, "YYYY-MM-DD HH:MM:SS"], and how many today (experimental).
			take: null,
			takesToday: 0,
			restored: [],
			// What lights a Go button beyond the word, per timeline from 1 (the master).
			waiting: Array.from({ length: timelines }, (_, i) => (i === 0 && waiting ? 1 : 0)),
			looping: Array.from({ length: timelines }, (_, i) => (i === 0 && looping ? 1 : 0)),
			gos: Array.from({ length: timelines }, () => 0),
			audio_mute: 0,
			layers: Array.from({ length: layers }, (_, i) => ({
				owner: 'timeline',
				source: i === 0 ? 'media 1/1' : '',
				showing: i === 0 ? 1 : 0,
				play_mode: 'play',
				opacity: 1,
				colour: [1, 1, 1],
				time: 0,
			})),
		}
		this.lastMoving = 0
	}

	get port() {
		return this.socket ? this.socket.address().port : 0
	}

	/** The port replies come from: the sender's, else the listener's. */
	get replyPort() {
		const s = this.sender ?? this.socket
		return s ? s.address().port : 0
	}

	static bind(socket, port) {
		return new Promise((resolve, reject) => {
			socket.once('error', reject)
			socket.bind(port, '0.0.0.0', () => {
				socket.off('error', reject)
				resolve()
			})
		})
	}

	async start() {
		const socket = dgram.createSocket('udp4')
		this.socket = socket
		socket.on('message', (buffer, rinfo) => this.onMessage(buffer, rinfo))
		await FakeEngine.bind(socket, this.wantedPort)
		if (this.replyFrom !== 'listener') {
			this.sender = dgram.createSocket('udp4')
			this.sender.on('error', () => {})
			await FakeEngine.bind(this.sender, 0)
		}
		this.steadyTimer = setInterval(() => this.sendSteady(), 1000)
		this.movingTimer = setInterval(() => this.sendMoving(), 1000 / this.rate)
		this.lastTick = Date.now()
		if (this.socketPort !== null) {
			this.control = new FakeControlServer({
				port: this.socketPort,
				key: this.key,
				following: this.following,
				state: this.state,
				echo: this.echo,
			})
			await this.control.start()
		}
		return this
	}

	stop() {
		clearInterval(this.steadyTimer)
		clearInterval(this.movingTimer)
		if (this.socket) {
			this.socket.close()
			this.socket = null
		}
		if (this.sender) {
			this.sender.close()
			this.sender = null
		}
		if (this.control) {
			this.control.stop()
			this.control = null
		}
	}

	/** The control socket's port, when it is served. */
	get controlPort() {
		return this.control ? this.control.port : 0
	}

	log(text) {
		if (this.echo) console.log(`${new Date().toISOString().slice(11, 23)} ${text}`)
	}

	send(to, message) {
		const from = this.sender ?? this.socket
		if (!from) return
		const buffer = encode(message)
		from.send(buffer, 0, buffer.length, to.port, to.address)
	}

	sendTo(to, messages) {
		for (const m of messages) this.send(to, m)
	}

	onMessage(buffer, rinfo) {
		const key = `${rinfo.address}:${rinfo.port}`
		for (const message of decode(buffer)) {
			this.received.push(message.address)
			if (this.following) {
				this.log(`ignored (following) ${describe(message)} from ${key}`)
				this.emit('ignored', message, rinfo)
				continue
			}
			const sub = this.subscribers.get(key)
			if (sub) sub.seen = Date.now()
			if (message.address === '/ping') {
				this.send(rinfo, { address: '/pong', args: [] })
				this.emit('ping', rinfo)
				continue
			}
			if (message.address === '/subscribe') {
				const level = argText(message.args[0]).toLowerCase() === 'light' ? 'light' : 'full'
				this.subscribers.set(key, { address: rinfo.address, port: rinfo.port, level, seen: Date.now() })
				this.log(`subscribed ${key} at ${level}`)
				this.emit('subscribe', level, rinfo)
				this.sendTo(rinfo, this.steadySet(level))
				continue
			}
			if (message.address === '/unsubscribe') {
				this.subscribers.delete(key)
				this.log(`unsubscribed ${key}`)
				this.emit('unsubscribe', rinfo)
				continue
			}
			this.log(`${describe(message)} from ${key}`)
			this.apply(message)
			this.emit('command', message, rinfo)
		}
	}

	/** A little of what a command does, so the status moves. */
	apply(message) {
		const parts = message.address.split('/').filter((p) => p !== '')
		const s = this.state
		const a = message.args
		let changed = true
		// The master's transport addresses bare, a timeline's after /timeline/N.
		const bare = parts[0] === 'timeline' ? parts.slice(2) : parts
		const timeline = parts[0] === 'timeline' && /^\d+$/.test(parts[1]) ? Number(parts[1]) : 1
		const go = () => {
			if (s.gos[timeline - 1] !== undefined) s.gos[timeline - 1]++
		}
		// The fake's own switches, never Enzyme's: /fake/looping 0|1 and /fake/waiting 0|1 for the master.
		if (parts[0] === 'fake' && (parts[1] === 'looping' || parts[1] === 'waiting')) {
			s[parts[1]][0] = argNumber(a[0]) >= 0.5 ? 1 : 0
			for (const sub of this.subscribers.values()) this.sendTo(sub, this.steadySet(sub.level))
			return
		}
		if (bare[0] === 'transport') {
			switch (bare[1]) {
				case 'go':
				case 'play':
					go()
					s.transport = 'play'
					s.looping[0] = 0
					s.waiting[0] = 0
					if (s.cue === '') {
						s.cue = '1'
						s.next_cue = '2'
					}
					break
				// A pause: not playing and not held, which the engine says as stop.
				case 'pause':
					s.transport = 'stop'
					break
				// Stop and Hold both hold the timeline until a Go.
				case 'hold':
				case 'stop':
					s.transport = 'hold'
					break
				case 'reset':
					s.transport = 'hold'
					s.position = 0
					s.cue = ''
					s.next_cue = '1'
					break
				case 'skip_forward':
				case 'next':
				case 'go_next':
					s.cue = s.next_cue
					s.next_cue = String(Number(s.next_cue) + 1)
					s.transport = bare[1] === 'go_next' ? 'play' : 'hold'
					break
				case 'skip_back':
				case 'previous':
				case 'go_previous':
					s.cue = String(Math.max(1, Number(s.cue || 1) - 1))
					s.next_cue = String(Number(s.cue) + 1)
					s.transport = bare[1] === 'go_previous' ? 'play' : 'hold'
					break
				case 'tc_lock':
					s.transport = 'chase'
					break
				case 'tc_release':
					s.transport = 'play'
					break
				default:
					changed = false
			}
		} else if (bare[0] === 'cue' && bare[1] === 'go') {
			go()
			const n = argNumber(a[0])
			s.cue = Number.isFinite(n) ? String(n) : argText(a[0])
			s.next_cue = Number.isFinite(n) ? String(Math.floor(n) + 1) : ''
			s.transport = 'play'
		} else if (parts[0] === 'show' && parts[1] === 'blackout') {
			const n = argNumber(a[0])
			s.blackout = !Number.isFinite(n) || n > 0.5 ? 1 : 0
		} else if (parts[0] === 'show' && parts[1] === 'master') {
			s.master = argNumber(a[0])
		} else if (parts[0] === 'show' && parts[1] === 'mode') {
			s.mode = argText(a[0]).toLowerCase()
		} else if (parts[0] === 'show' && parts[1] === 'override') {
			s.override = argText(a[0]).toLowerCase()
		} else if (parts[0] === 'recall') {
			const bank = parts.length === 3 ? Number(parts[1]) : argNumber(a[0])
			const tile = parts.length === 3 ? Number(parts[2]) : argNumber(a[1])
			if (parts.length === 3 && a.length > 0 && argNumber(a[0]) < 0.5) changed = false
			else s.recall = [bank, tile, `Recall ${bank}/${tile}`]
		} else if (parts[0] === 'take') {
			// Takes (experimental): a take is named by its slate, or Take N for
			// the day; a restore or region looks live is noted and changes nothing.
			if (parts.length === 1) {
				const given = argText(a[0]).trim()
				s.takesToday++
				const slate = given === '' ? `Take ${s.takesToday}` : given
				const now = new Date()
				const two = (n) => String(n).padStart(2, '0')
				const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
				s.take = [slate, stamp]
			} else if ((parts[1] === 'restore' || parts[1] === 'regions') && argText(a[0]).trim() !== '') {
				s.restored.push([parts[1], ...a.map((arg) => argText(arg))])
				changed = false
			} else changed = false
		} else if (parts[0] === 'setlist') {
			if (parts[1] === 'row' && parts[3] === 'go') s.setlist = [Number(parts[2]), 'Main']
			else if (parts[1] === 'next') s.setlist = [s.setlist[0] + 1, 'Main']
			else if (parts[1] === 'previous') s.setlist = [Math.max(1, s.setlist[0] - 1), 'Main']
			else changed = false
		} else if (parts[0] === 'layer' && /^\d+$/.test(parts[1]) && s.layers[Number(parts[1]) - 1]) {
			const layer = s.layers[Number(parts[1]) - 1]
			if (parts[2] === 'owner') layer.owner = argText(a[0])
			else if (parts[2] === 'play_mode' || parts[2] === 'play') {
				const mode = argText(a[0])
				layer.play_mode = mode === 'hold' ? 'hold_last' : mode
			} else if (parts[2] === 'opacity') layer.opacity = argNumber(a[0])
			else if (parts[2] === 'media') {
				layer.source = `media ${argNumber(a[0])}/${argNumber(a[1])}`
				layer.showing = 1
			} else if (parts[2] === 'generator') {
				layer.source = `generator ${argNumber(a[0])}/${argNumber(a[1])}`
				layer.showing = 1
			} else if ((parts[2] === 'colour' || parts[2] === 'color') && parts[3] === 'rgb' && parts.length === 4) {
				layer.colour = [0, 1, 2].map((i) => argNumber(a[i]))
			} else changed = false
		} else {
			changed = false
		}
		if (changed) {
			for (const sub of this.subscribers.values()) this.sendTo(sub, this.steadySet(sub.level))
			if (this.control) this.control.statusChanged()
		}
	}

	heartbeat() {
		return Math.floor((Date.now() - this.started) / 1000)
	}

	/** Everything that goes once a second and on change. */
	steadySet(level) {
		const s = this.state
		const out = [
			{ address: '/status/heartbeat', args: [int(this.heartbeat())] },
			{ address: '/status/transport', args: [str(s.transport)] },
			{ address: '/status/cue', args: [str(s.cue)] },
			{ address: '/status/next_cue', args: [str(s.next_cue)] },
			{ address: '/status/section', args: [int(s.section[0]), str(s.section[1])] },
		]
		// What lights a Go button beyond the word, from engines of 1 November 2026 on.
		const goLit = (n, at) =>
			this.oldEngine
				? []
				: [
						{ address: at('waiting'), args: [int(s.waiting[n - 1])] },
						{ address: at('looping'), args: [int(s.looping[n - 1])] },
						{ address: at('go_count'), args: [int(s.gos[n - 1])] },
					]
		out.push(...goLit(1, (what) => `/status/${what}`))
		if (this.timelines > 1) {
			for (let n = 1; n <= this.timelines; n++) {
				const at = (what) => `/status/timeline/${n}/${what}`
				out.push(
					{ address: at('transport'), args: [str(n === 1 ? s.transport : 'stop')] },
					{ address: at('cue'), args: [str(n === 1 ? s.cue : '')] },
					{ address: at('next_cue'), args: [str(n === 1 ? s.next_cue : '1')] },
					...goLit(n, at),
					{ address: at('name'), args: [str(n === 1 ? 'Main' : `Timeline ${n}`)] },
					{ address: at('master'), args: [int(n === 1 ? 1 : 0)] },
				)
			}
		}
		out.push({ address: '/status/setlist/current', args: [int(s.setlist[0]), str(s.setlist[1])] })
		if (s.recall) {
			out.push({ address: '/status/recall', args: [int(s.recall[0]), int(s.recall[1]), str(s.recall[2])] })
		}
		// The last take, once one has been (experimental; engines from 2 November 2026).
		if (s.take && !this.oldEngine) {
			out.push({ address: '/status/take/last', args: [str(s.take[0]), str(s.take[1])] })
		}
		if (level !== 'full') return out
		out.push(
			{ address: '/status/mode', args: [str(s.mode)] },
			{ address: '/status/blackout', args: [int(s.blackout)] },
			{ address: '/status/master', args: [float(s.master)] },
			{ address: '/status/override', args: [str(s.override)] },
		)
		s.layers.forEach((layer, i) => {
			const n = i + 1
			const at = (what) => `/status/layer/${n}/${what}`
			const [r, g, b] = layer.colour
			out.push(
				{ address: at('owner'), args: [str(layer.owner)] },
				{ address: at('source'), args: [str(layer.source)] },
				{ address: at('showing'), args: [int(layer.showing)] },
				{ address: at('play_mode'), args: [str(layer.play_mode)] },
				{ address: at('opacity'), args: [float(layer.opacity)] },
				{ address: at('colour/rgb'), args: [float(r), float(g), float(b)] },
				{ address: at('colour/hsi'), args: [float(0), float(0), float((r + g + b) / 3)] },
				{ address: at('colour/xy'), args: [float(0.3127), float(0.329), float((r + g + b) / 3)] },
			)
		})
		return out
	}

	/** The position in its three forms, and at Full each layer's time. */
	movingSet(level) {
		const s = this.state
		const out = [
			{ address: '/status/timecode', args: [str(timecode(s.position))] },
			{ address: '/status/position', args: [float(s.position)] },
			{ address: '/status/frame', args: [int(Math.floor(s.position * FPS))] },
		]
		if (this.timelines > 1) {
			for (let n = 1; n <= this.timelines; n++) {
				out.push({ address: `/status/timeline/${n}/timecode`, args: [str(timecode(n === 1 ? s.position : 0))] })
			}
		}
		if (level === 'full') {
			s.layers.forEach((layer, i) => {
				if (layer.showing) out.push({ address: `/status/layer/${i + 1}/time`, args: [float(layer.time)] })
			})
		}
		return out
	}

	dropStale() {
		const now = Date.now()
		for (const [key, sub] of this.subscribers) {
			if (now - sub.seen > SUBSCRIBE_TIMEOUT) {
				this.subscribers.delete(key)
				this.log(`dropped ${key}: nothing heard for five minutes`)
			}
		}
	}

	sendSteady() {
		this.dropStale()
		for (const sub of this.subscribers.values()) this.sendTo(sub, this.steadySet(sub.level))
	}

	sendMoving() {
		const now = Date.now()
		const dt = (now - this.lastTick) / 1000
		this.lastTick = now
		if (this.state.transport === 'play' || this.state.transport === 'chase') {
			this.state.position += dt
			for (const layer of this.state.layers) if (layer.showing) layer.time += dt
		}
		for (const sub of this.subscribers.values()) this.sendTo(sub, this.movingSet(sub.level))
	}
}

function parseCli(argv) {
	const options = { port: 9000, socketPort: 9200, key: '', timelines: 1, layers: 4, echo: true }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--port') options.port = Number(argv[++i])
		else if (arg === '--socket-port') options.socketPort = Number(argv[++i])
		else if (arg === '--no-socket') options.socketPort = null
		else if (arg === '--key') options.key = String(argv[++i] ?? '')
		else if (arg === '--timelines') options.timelines = Number(argv[++i])
		else if (arg === '--layers') options.layers = Number(argv[++i])
		else if (arg === '--quiet') options.echo = false
		else if (arg === '--following') options.following = true
		else if (arg === '--waiting') options.waiting = true
		else if (arg === '--looping') options.looping = true
		else if (arg === '--old-engine') options.oldEngine = true
		else if (arg === '--help' || arg === '-h') options.help = true
	}
	return options
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const options = parseCli(process.argv.slice(2))
	if (options.help) {
		console.log(
			'node test/fake-engine.js [--port 9000] [--socket-port 9200 | --no-socket] [--key secret] [--timelines 1] [--layers 4] [--following] [--waiting] [--looping] [--old-engine] [--quiet]',
		)
	} else {
		const engine = new FakeEngine(options)
		engine
			.start()
			.then(() => {
				console.log(
					`fake Enzyme listening on UDP ${engine.port}: ${engine.timelines} timeline(s), ${engine.layers} layer(s)${engine.following ? ', following (answers nothing)' : ''}`,
				)
				if (engine.control) {
					console.log(
						`control socket on TCP ${engine.controlPort}${engine.key ? ' asking for the control key' : ''}: the fixture show, two timelines with named cues, four layers, two rasters, media tiles, recalls and a set list`,
					)
				}
				console.log('every command heard is printed here; Ctrl-C stops it')
			})
			.catch((err) => {
				console.error(`cannot start: ${err.message}`)
				process.exitCode = 1
			})
		process.on('SIGINT', () => {
			engine.stop()
		})
	}
}

export { FakeEngine, timecode }
