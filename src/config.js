// The connection's settings: the engine (found by Bonjour or typed), the OSC
// port, an optional backup engine and the status level.

import * as C from './choices.js'

const DEFAULT_PORT = 9000

function getConfigFields() {
	return [
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
 * value is "address:port" with the control port, not the OSC one, or typed)
 * and the backup if given. Empty when no primary is set.
 */
function hostsFromConfig(config) {
	const port = Number(config?.port) > 0 ? Math.trunc(Number(config.port)) : DEFAULT_PORT
	const bonjour = String(config?.bonjour_host ?? '').trim()
	const primary = bonjour !== '' ? bonjour.replace(/:\d+$/, '') : String(config?.host ?? '').trim()
	if (primary === '') return []
	const hosts = [{ host: primary, port, name: 'primary' }]
	const backup = String(config?.backup_host ?? '').trim()
	if (backup !== '') hosts.push({ host: backup, port, name: 'backup' })
	return hosts
}

export { getConfigFields, hostsFromConfig, DEFAULT_PORT }
