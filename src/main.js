// The connection: one engine (or a leader and its backup) over OSC, with
// the actions, feedbacks, variables and presets built from the tables in
// the files beside this one. Status arrives one message at a time and is
// gathered for a few milliseconds before Companion hears of it, so the Full
// level does not flood it.

import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import { getConfigFields, hostsFromConfig } from './config.js'
import { EngineLink } from './link.js'
import { EngineState } from './status.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions, feedbacksFor } from './feedbacks.js'
import { variableDefinitions, initialValues } from './variables.js'
import { getPresets } from './presets.js'

/** How long changes are gathered before they go to Companion. */
const FLUSH_MS = 40

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
	}

	async init(config) {
		this.config = config
		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setVariableDefinitions(variableDefinitions(this.state.timelines, this.state.layers))
		this.setVariableValues(initialValues())
		this.setPresets()
		await this.connect()
	}

	async destroy() {
		this.disconnect()
	}

	async configUpdated(config) {
		this.config = config
		this.disconnect()
		await this.connect()
	}

	getConfigFields() {
		return getConfigFields()
	}

	setPresets() {
		const { structure, presets } = getPresets(this.label)
		this.setPresetDefinitions(structure, presets)
	}

	async connect() {
		const hosts = hostsFromConfig(this.config)
		if (hosts.length === 0) {
			this.updateStatus(InstanceStatus.BadConfig, 'No engine address')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		this.state = new EngineState()
		this.connection = null
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
	}

	disconnect() {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		if (this.link) {
			this.link.removeAllListeners()
			this.link.stop()
			this.link = null
		}
	}

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
		}
	}

	sendMessages(messages) {
		if (!this.link) {
			this.log('debug', 'not connected; nothing sent')
			return
		}
		this.link.sendAll(messages)
	}

	onConnection(connection) {
		this.connection = connection
		const [primary, backup] = connection.hosts
		if (connection.live === 0) {
			this.updateStatus(InstanceStatus.Ok)
		} else if (connection.live > 0) {
			this.updateStatus(InstanceStatus.Ok, 'Backup engine live')
		} else if (primary?.up === null || (backup && backup.up === null)) {
			this.updateStatus(InstanceStatus.Connecting)
		} else {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'No engine answers pings')
		}
		this.checkFeedbacks('connected')
	}

	onStatus(message) {
		const result = this.state.apply(message)
		if (!result) return
		for (const name of result.changed) this.pending.add(name)
		if (result.newTimeline !== null || result.newLayer !== null) this.pendingDefinitions = true
		if ((this.pending.size > 0 || this.pendingDefinitions) && !this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS)
		}
	}

	/** Hands the gathered changes to Companion at once. */
	flush() {
		this.flushTimer = null
		if (this.pendingDefinitions) {
			this.pendingDefinitions = false
			this.setVariableDefinitions(variableDefinitions(this.state.timelines, this.state.layers))
		}
		if (this.pending.size === 0) return
		const changed = [...this.pending]
		this.pending.clear()
		const values = {}
		for (const name of changed) values[name] = this.state.get(name)
		this.setVariableValues(values)
		const feedbacks = feedbacksFor(changed)
		if (feedbacks.length > 0) this.checkFeedbacks(...feedbacks)
	}
}

// Companion loads the class as the default export and the upgrade scripts
// as `UpgradeScripts`.
export { UpgradeScripts }
