// The connection: one engine (or a leader and its backup) over OSC for
// commands and status, and, when switched on, a read-only link to each
// engine's control socket for names and pictures. The actions, feedbacks,
// variables and presets are built from the tables in the files beside this
// one. Status arrives one message at a time and is gathered for a few
// milliseconds before Companion hears of it, so the Full level does not
// flood it; the definitions are rebuilt with the show's names no more than
// once a second.

import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import { getConfigFields, hostsFromConfig, socketsFromConfig, pictureRate } from './config.js'
import { EngineLink } from './link.js'
import { ControlSocket } from './control.js'
import { EngineState } from './status.js'
import { GoLight } from './golight.js'
import { ShowModel } from './show.js'
import { PictureStore } from './pictures.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions, feedbacksFor, bankTileOf } from './feedbacks.js'
import { variableDefinitions, nameValues, initialValues } from './variables.js'
import { getPresets } from './presets.js'

/** How long status changes are gathered before they go to Companion. */
const FLUSH_MS = 40
/** The least time between two rebuilds of the definitions and presets. */
const REBUILD_MS = 1000
/** The width asked of raster pictures: a button is smaller than this. */
const PICTURE_WIDTH = 160

export default class EnzymeInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.link = null
		this.state = new EngineState()
		this.connection = null
		this.remembered = {}
		this.pending = new Set()
		this.pendingDefinitions = false
		this.flushTimer = null
		// The control sockets, one per host, each with what it last heard.
		this.sockets = []
		this.model = new ShowModel()
		this.engine = null
		this.pictures = new PictureStore()
		this.wantedPictures = new Map()
		this.pictureFeedbacks = new Map()
		this.changedPictures = new Set()
		this.rebuildTimer = null
		this.rebuildDue = false
		this.lastRebuild = 0
		this.presetTimer = null
		this.lastPresetCue = null
		this.lastPresetTimelines = ''
		// The looping flash and the moment after a Go, as the shell lights its Go.
		this.light = new GoLight({
			onChange: (what) => this.checkFeedbacks(what === 'flash' ? 'looping_until_go' : 'go_fired'),
		})
	}

	async init(config, isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.rebuild()
		this.setVariableValues(initialValues())
		await this.connect()
	}

	async destroy() {
		this.disconnect()
	}

	async configUpdated(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.disconnect()
		this.rebuild()
		await this.connect()
	}

	getConfigFields() {
		return getConfigFields()
	}

	// Definitions

	/** The actions, feedbacks, variables and presets, with the show's names when known. */
	rebuild() {
		this.lastRebuild = Date.now()
		this.rebuildDue = false
		const model = this.model.hasShow ? this.model : null
		const choices = model
			? {
					timeline: model.timelineChoices(),
					cue: model.allCueChoices(),
					layer: model.layerChoices(),
					raster: model.rasterChoices(),
					region: model.regionChoices(),
					media: model.mediaChoices(),
					generator: model.generatorChoices(),
					recall: model.recallChoices(),
					row: model.setListRowChoices(),
					timeline_numbered: model.timelineNumberChoices(),
				}
			: null
		this.setActionDefinitions(getActionDefinitions(this, choices))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this, choices))
		this.setVariableDefinitions(variableDefinitions(this.state.timelines, this.state.layers, model))
		this.refreshPresets()
	}

	/** The presets alone: a cue change moves the next-cues group and nothing else. */
	refreshPresets() {
		if (this.presetTimer) {
			clearTimeout(this.presetTimer)
			this.presetTimer = null
		}
		this.lastPresetRefresh = Date.now()
		const model = this.model.hasShow ? this.model : null
		const { structure, presets } = getPresets(this.label, model, this.state)
		this.setPresetDefinitions(structure, presets)
		this.lastPresetCue = this.state.get('cue')
	}

	/** Asks for a rebuild, no more than once a second. */
	scheduleRebuild() {
		this.rebuildDue = true
		if (this.rebuildTimer) return
		const wait = Math.max(0, REBUILD_MS - (Date.now() - this.lastRebuild))
		this.rebuildTimer = setTimeout(() => {
			this.rebuildTimer = null
			if (this.rebuildDue) this.rebuild()
		}, wait)
	}

	/** Asks for the presets again, no more than once a second; a full rebuild already due covers it. */
	schedulePresetRefresh() {
		if (this.presetTimer || this.rebuildDue) return
		const wait = Math.max(0, REBUILD_MS - (Date.now() - (this.lastPresetRefresh ?? 0)))
		this.presetTimer = setTimeout(() => {
			this.presetTimer = null
			if (!this.rebuildDue) this.refreshPresets()
		}, wait)
	}

	// Connections

	async connect() {
		const hosts = hostsFromConfig(this.config)
		if (hosts.length === 0) {
			this.updateStatus(InstanceStatus.BadConfig, 'No engine address')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		this.state = new EngineState()
		this.connection = null
		this.light.reset()
		const link = new EngineLink({
			hosts,
			level: this.config.level,
			log: (level, text) => this.log(level, text),
		})
		this.link = link
		link.on('status', (message) => this.onStatus(message))
		link.on('connection', (connection) => this.onConnection(connection))
		link.on('error', () => {})
		try {
			await link.start()
			this.log('info', `talking to ${hosts.map((h) => `${h.host}:${h.port}`).join(' and ')} from port ${link.port}`)
		} catch (err) {
			this.updateStatus(InstanceStatus.UnknownError, `Cannot open a socket: ${err.message}`)
		}
		this.connectSockets()
	}

	connectSockets() {
		const wanted = socketsFromConfig(this.config, this.secrets)
		this.sockets = wanted.map((w, i) => {
			const socket = new ControlSocket({
				host: w.host,
				port: w.port,
				key: w.key,
				name: `${w.name} socket`,
				log: (level, text) => this.log(level, text),
				tiles: () => this.heldTiles(),
			})
			const entry = { socket, index: i, show: null, status: null, setList: null, model: new ShowModel() }
			socket.on('welcome', (engine) => this.onWelcome(entry, engine))
			socket.on('refused', () => this.showConnection())
			socket.on('closed', () => this.onSocketClosed(entry))
			socket.on('show', (show) => {
				entry.show = show
				entry.model.applyShow(show)
				this.onEngineChanged()
			})
			socket.on('status', (status) => {
				entry.status = status
				entry.model.applyStatus(status)
				this.onEngineChanged()
			})
			socket.on('setlist', (setList) => {
				entry.setList = setList
				entry.model.applySetList(setList)
				this.onEngineChanged()
			})
			socket.on('thumbnail', (t) => this.onPicture(entry, `raster:${t.raster}`, t.jpeg))
			socket.on('nextCueThumbnail', (t) =>
				this.onPicture(entry, `next_cue:${t.raster}:${t.timeline ?? entry.model.masterId ?? 'master'}`, t.jpeg),
			)
			socket.on('mediaThumbnail', (t) => {
				entry.model.mediaKeys = entry.model.mediaKeys ?? new Map()
				entry.model.mediaKeys.set(t.entry, t.key ?? '')
				this.onPicture(entry, `media:${t.entry}`, t.jpeg)
			})
			return entry
		})
		for (const entry of this.sockets) {
			this.pushPictureSettings(entry)
			entry.socket.start()
		}
	}

	disconnect() {
		for (const timer of ['flushTimer', 'rebuildTimer', 'presetTimer']) {
			if (this[timer]) {
				clearTimeout(this[timer])
				this[timer] = null
			}
		}
		if (this.link) {
			this.link.removeAllListeners()
			this.link.stop()
			this.link = null
		}
		for (const entry of this.sockets) {
			entry.socket.removeAllListeners()
			entry.socket.stop()
		}
		this.sockets = []
		this.model = new ShowModel()
		this.engine = null
		this.pictures.clear()
		this.changedPictures.clear()
		this.light.stop()
	}

	/** The media pictures held, for a Hello, so a reconnection is not sent them again. */
	heldTiles() {
		const tiles = []
		for (const entry of this.sockets) {
			for (const [id, key] of entry.model.mediaKeys ?? []) if (this.pictures.has(`media:${id}`)) tiles.push([id, key])
		}
		return tiles
	}

	// The engine driving the show, and what is shown from it

	/** The socket entry whose engine drives the show, else the first connected with a show. */
	sourceEntry() {
		const connected = this.sockets.filter((e) => e.socket.connected)
		return connected.find((e) => e.model.driving) ?? connected.find((e) => e.model.hasShow) ?? connected[0] ?? null
	}

	onWelcome(entry, engine) {
		if (entry.index === 0 || !this.engine) this.engine = engine
		this.onEngineChanged()
	}

	onSocketClosed() {
		this.onEngineChanged()
	}

	onEngineChanged() {
		const source = this.sourceEntry()
		this.model = source ? source.model : new ShowModel()
		if (source?.socket.engine) this.engine = source.socket.engine
		// The driving engine settles whose OSC status is shown; without one the pings decide.
		const driving = this.sockets.find((e) => e.socket.connected && e.model.driving)
		this.link?.prefer(driving ? driving.index : null)
		this.showConnection()
		this.scheduleRebuild()
		this.pending.add('names')
		this.queueFlush()
	}

	/** Companion's connection status: OSC and the sockets together. */
	showConnection() {
		const c = this.connection
		if (!c) {
			this.updateStatus(InstanceStatus.Connecting)
			return
		}
		const [primary, backup] = c.hosts
		if (c.live < 0) {
			if (primary?.up === null || (backup && backup.up === null)) this.updateStatus(InstanceStatus.Connecting)
			else this.updateStatus(InstanceStatus.ConnectionFailure, 'No engine answers pings')
			return
		}
		const note = c.live > 0 ? 'Backup engine live' : ''
		const entry = this.sockets[c.live]
		if (entry && !entry.socket.connected) {
			const why = entry.socket.refusal
				? `Control socket refused: ${entry.socket.refusal}`
				: 'Control socket down; names and pictures unavailable'
			this.updateStatus(InstanceStatus.UnknownWarning, note ? `${note}. ${why}` : why)
			return
		}
		this.updateStatus(InstanceStatus.Ok, note || undefined)
	}

	onConnection(connection) {
		this.connection = connection
		this.showConnection()
		this.checkFeedbacks('connected')
	}

	// Status and variables

	onStatus(message) {
		const result = this.state.apply(message)
		if (!result) return
		for (const name of result.changed) {
			this.pending.add(name)
			if (/(^|_)(cue|next_cue)$|^setlist_row$/.test(name)) this.pending.add('names')
		}
		if (result.newTimeline !== null || result.newLayer !== null) {
			this.pendingDefinitions = true
			// A timeline first seen gets its name variable and its Go preset.
			this.pending.add('names')
			this.schedulePresetRefresh()
		}
		this.queueFlush()
	}

	queueFlush() {
		if ((this.pending.size > 0 || this.pendingDefinitions || this.changedPictures.size > 0) && !this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS)
		}
	}

	/** Hands the gathered changes to Companion at once. */
	flush() {
		this.flushTimer = null
		if (this.pendingDefinitions) {
			this.pendingDefinitions = false
			this.setVariableDefinitions(
				variableDefinitions(this.state.timelines, this.state.layers, this.model.hasShow ? this.model : null),
			)
		}
		const changed = [...this.pending]
		this.pending.clear()
		const values = {}
		for (const name of changed) {
			if (name === 'names')
				Object.assign(values, nameValues(this.model.hasShow ? this.model : null, this.state, this.engine))
			else values[name] = this.state.get(name)
		}
		if (changed.includes('cue') && this.state.get('cue') !== this.lastPresetCue) this.schedulePresetRefresh()
		this.light.update(this.state, changed)
		const feedbacks = new Set(feedbacksFor(changed))
		if (changed.includes('names')) {
			feedbacks.add('cue_label')
			feedbacks.add('recall_label')
			feedbacks.add('raster_label')
			feedbacks.add('recall_picture')
		}
		const byId = []
		for (const key of this.changedPictures) {
			const variable = this.pictureVariable(key)
			if (variable) values[variable] = this.pictures.get(key)
			for (const [id, wanted] of this.pictureFeedbacks) if (wanted.key === key) byId.push(id)
		}
		this.changedPictures.clear()
		if (Object.keys(values).length > 0) this.setVariableValues(values)
		if (feedbacks.size > 0) this.checkFeedbacks(...feedbacks)
		if (byId.length > 0) this.checkFeedbacksById(...byId)
	}

	/** The variable a picture key fills, if any (rasters, and the master's next cue on the first raster). */
	pictureVariable(key) {
		const m = /^raster:(\d+)$/.exec(key)
		if (m) {
			const raster = this.model.rasters.find((r) => r.id === Number(m[1]))
			return raster ? `raster_${raster.number}_picture` : undefined
		}
		const n = /^next_cue:(\d+):(.+)$/.exec(key)
		if (n) {
			const first = this.model.rasters[0]
			const master = this.model.masterId ?? 'master'
			return first && Number(n[1]) === first.id && n[2] === String(master) ? 'next_cue_picture' : undefined
		}
		return undefined
	}

	/** The id of the timeline a feedback's Timeline option names; the master's for an empty one; null for none known. */
	timelineIdOf(text) {
		const i = this.model.timelineIndex(text)
		return i === null ? null : this.model.timelines[i].id
	}

	// Pictures

	onPicture(entry, key, jpeg) {
		if (entry !== this.sourceEntry()) return
		if (!this.pictures.set(key, jpeg)) return
		this.changedPictures.add(key)
		this.queueFlush()
	}

	/** The key of the picture a feedback asks for, from its options; null for none known. */
	pictureKey(id, options) {
		const model = this.model
		switch (id) {
			case 'raster_picture':
			case 'next_cue_picture': {
				const i = model.rasterIndex(options.raster)
				const raster = i === null ? model.rasters[0] : model.rasters[i]
				if (!raster) return null
				if (id === 'raster_picture') return `raster:${raster.id}`
				const timeline = this.timelineIdOf(options.timeline)
				return timeline === null ? null : `next_cue:${raster.id}:${timeline}`
			}
			case 'media_picture': {
				const [folder, file] = bankTileOf(options)
				const entry = model.mediaEntry(folder, file)
				return entry ? `media:${entry.id}` : null
			}
			case 'recall_picture': {
				const [folder, file] = bankTileOf(options)
				return `recall:${folder}/${file}`
			}
			default:
				return null
		}
	}

	/** A value feedback's answer: a picture as a data URI, or a label. */
	value(id, feedback) {
		const options = feedback.options ?? {}
		const model = this.model
		switch (id) {
			case 'cue_label': {
				const i = model.timelineIndex(options.timeline)
				const number = String(options.cue ?? '').trim()
				const name = i === null ? '' : model.cueName(i, number)
				return name === '' ? number : `${number}\n${name}`
			}
			case 'recall_label': {
				const [folder, file] = bankTileOf(options)
				return model.recall(folder, file)?.name ?? `${folder}/${file}`
			}
			case 'raster_label': {
				const i = model.rasterIndex(options.raster)
				return i === null ? String(options.raster ?? '') : model.rasters[i].name
			}
			case 'recall_picture': {
				const [folder, file] = bankTileOf(options)
				const recall = model.recall(folder, file)
				const key = `recall:${folder}/${file}`
				if (recall?.picture) this.pictures.set(key, recall.picture)
				else this.pictures.delete(key)
				this.pictureFeedbacks.set(feedback.id, { id, key })
				return this.pictures.get(key)
			}
			default: {
				const key = this.pictureKey(id, options)
				this.pictureFeedbacks.set(feedback.id, { id, key, timeline: options.timeline })
				this.updatePictureWants()
				return key ? this.pictures.get(key) : null
			}
		}
	}

	valueGone(feedbackId) {
		if (this.pictureFeedbacks.delete(feedbackId)) this.updatePictureWants()
	}

	/**
	 * Tells the engines which pictures are wanted: raster pictures only while
	 * a Raster picture feedback shows one, and the next cue of one timeline
	 * while a Next cue picture does. The engine pictures one timeline's next
	 * cue per client, so when buttons ask for several the first asked for
	 * wins and the rest are said once in the log.
	 */
	updatePictureWants() {
		let rasters = false
		let nextCue = false
		const timelines = new Map()
		for (const f of this.pictureFeedbacks.values()) {
			if (f.id === 'raster_picture') rasters = true
			if (f.id === 'next_cue_picture') {
				nextCue = true
				const id = this.timelineIdOf(f.timeline)
				if (id !== null && !timelines.has(id)) timelines.set(id, f.timeline)
			}
		}
		const [first] = timelines.keys()
		const chosen = first === undefined ? null : first
		if (timelines.size > 1 && this.wantedNextCueTimelines !== timelines.size) {
			const names = [...timelines.values()].map((t) => (t === '' ? 'the master' : t)).join(', ')
			this.log(
				'warn',
				`Next cue pictures are asked for ${timelines.size} timelines (${names}); the engine pictures one at a time, so only the first is shown`,
			)
		}
		this.wantedNextCueTimelines = timelines.size
		const master = this.model.masterId
		this.wanted = { rasters, nextCue, nextCueTimeline: chosen === null || chosen === master ? null : chosen }
		for (const entry of this.sockets) this.pushPictureSettings(entry)
	}

	pushPictureSettings(entry) {
		const rate = pictureRate(this.config)
		const wanted = this.wanted ?? { rasters: false, nextCue: false, nextCueTimeline: null }
		const any = (wanted.rasters || wanted.nextCue) && rate > 0
		entry.socket.setSettings({
			PreviewWidth: PICTURE_WIDTH,
			PreviewRate: { per_second: any ? rate : 0 },
			RasterPictures: wanted.rasters && rate > 0,
			NextCueTimeline: wanted.nextCueTimeline,
		})
	}

	// Actions

	/** What the actions know of the show, for a toggle: Full status, else the last value sent. */
	actionContext() {
		return {
			known: (key) => {
				const fromStatus = this.state.get(key)
				return fromStatus !== undefined ? fromStatus : this.remembered[key]
			},
			remember: (key, value) => {
				this.remembered[key] = value
			},
			word: (timeline) => {
				const n = this.state.timelineNumber(timeline)
				return n === null ? undefined : this.state.timelineValue(n, 'transport')
			},
			log: (level, text) => this.log(level, text),
		}
	}

	sendMessages(messages) {
		if (!this.link) {
			this.log('debug', 'not connected; nothing sent')
			return
		}
		this.link.sendAll(messages)
	}
}

// Companion loads the class as the default export and the upgrade scripts
// as `UpgradeScripts`.
export { UpgradeScripts }
