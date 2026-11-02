// The connection's settings: the engine (found by Bonjour or typed), the OSC
// port, an optional backup engine and the status level.

import * as C from './choices.js'

const DEFAULT_PORT = 9000
const DEFAULT_SOCKET_PORT = 9200

function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'experimental',
			width: 12,
			label: 'Experimental build',
			value:
				'This build of the module is for testing only: it adds Takes (record a take, restore it, its region looks live, the last take as variables and feedbacks), ' +
				'which need an engine from 2 November 2026 with Show, Takes on. Everything else is as the released module.',
		},
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Enzyme',
			value:
				'Enzyme listens for OSC over UDP on port 9000 unless started on another; the Control workspace shows the address and port. ' +
				'Status comes back to this connection by itself once it subscribes.',
		},
		{
			type: 'bonjour-device',
			id: 'bonjour_host',
			label: 'Engine (found on the network)',
			tooltip: 'Engines announcing themselves on the network. Leave it unset to type an address below.',
			width: 6,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Engine address',
			tooltip: 'The IP address or host name of the engine; 127.0.0.1 on the same machine',
			width: 6,
			default: '127.0.0.1',
			isVisibleExpression: '!$(options:bonjour_host)',
		},
		{
			type: 'number',
			id: 'port',
			label: 'OSC port',
			width: 3,
			default: DEFAULT_PORT,
			min: 1,
			max: 65535,
			step: 1,
		},
		{
			type: 'textinput',
			id: 'backup_host',
			label: 'Backup engine address (optional)',
			tooltip:
				'A backup engine, on the same port. Every command goes to both; status comes from the primary until it stops answering, then from the backup.',
			width: 6,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'socket',
			label: 'Names and pictures over the control socket',
			tooltip:
				"A second, read-only connection to the engine's own control socket, for cue, timeline, layer, raster, region, media and recall names, and pictures for buttons",
			width: 12,
			default: true,
		},
		{
			type: 'number',
			id: 'socket_port',
			label: 'Control socket port',
			width: 3,
			default: DEFAULT_SOCKET_PORT,
			min: 1,
			max: 65535,
			step: 1,
			isVisibleExpression: '!!$(options:socket)',
		},
		{
			type: 'secret-text',
			id: 'control_key',
			label: 'Control key',
			tooltip:
				'The engine asks connections from other machines for its control key when one is set; from the same machine none is needed',
			width: 6,
			default: '',
			isVisibleExpression: '!!$(options:socket)',
		},
		{
			type: 'dropdown',
			id: 'picture_rate',
			label: 'Pictures for buttons',
			tooltip: 'How many raster and next cue pictures a second, while a button shows one',
			width: 3,
			choices: C.PICTURE_RATES,
			default: 1,
			isVisibleExpression: '!!$(options:socket)',
		},
		{
			type: 'dropdown',
			id: 'level',
			label: 'Status level',
			width: 6,
			choices: C.STATUS_LEVELS,
			default: 'light',
		},
		{
			type: 'static-text',
			id: 'level_note',
			width: 12,
			label: '',
			value:
				'Light is a handful of messages a second. Full adds the show-wide values and every layer, hundreds of messages a second; ' +
				'it is needed only for the layer, blackout, mode and override feedbacks and variables.',
		},
	]
}

/**
 * The hosts to talk to from the config: the primary (from Bonjour, whose
 * value is "address:port" with the control socket's port, not the OSC one,
 * or typed) and the backup if given. Each has the OSC port and the control
 * socket's port. Empty when no primary is set.
 */
function hostsFromConfig(config) {
	const port = Number(config?.port) > 0 ? Math.trunc(Number(config.port)) : DEFAULT_PORT
	let socketPort = Number(config?.socket_port) > 0 ? Math.trunc(Number(config.socket_port)) : DEFAULT_SOCKET_PORT
	const bonjour = String(config?.bonjour_host ?? '').trim()
	let primary = String(config?.host ?? '').trim()
	if (bonjour !== '') {
		const m = /^(.*):(\d+)$/.exec(bonjour)
		primary = m ? m[1] : bonjour
		if (m) socketPort = Number(m[2])
	}
	if (primary === '') return []
	const hosts = [{ host: primary, port, socketPort, name: 'primary' }]
	const backup = String(config?.backup_host ?? '').trim()
	if (backup !== '') hosts.push({ host: backup, port, socketPort, name: 'backup' })
	return hosts
}

/**
 * The control socket connections wanted: one per host when the switch is
 * on, each with the control key from the secrets; none when it is off, so
 * the OSC-only path is all that runs.
 */
function socketsFromConfig(config, secrets) {
	if (config?.socket === false) return []
	const key = String(secrets?.control_key ?? '').trim()
	return hostsFromConfig(config).map((h) => ({ host: h.host, port: h.socketPort, key, name: h.name }))
}

/** Raster and next cue pictures a second, from the config. */
function pictureRate(config) {
	const n = Number(config?.picture_rate)
	return [0, 1, 2, 4].includes(n) ? n : 1
}

export { getConfigFields, hostsFromConfig, socketsFromConfig, pictureRate, DEFAULT_PORT, DEFAULT_SOCKET_PORT }
