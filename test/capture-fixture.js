// Captures a second of Full status from the fake engine, after a few
// commands, into test/fixtures/status-full.json for the parser test.
// Run again to refresh it:  node test/capture-fixture.js

const fs = require('node:fs')
const path = require('node:path')
const dgram = require('node:dgram')
const { encode, int, str } = require('../src/osc')
const { FakeEngine } = require('./fake-engine')

async function main() {
	const engine = await new FakeEngine({ port: 0, timelines: 2, layers: 2 }).start()
	const socket = dgram.createSocket('udp4')
	const packets = []
	socket.on('message', (buffer) => packets.push(buffer.toString('hex')))
	await new Promise((resolve) => socket.bind(0, resolve))
	const send = (address, ...args) => {
		const b = encode({ address, args })
		socket.send(b, 0, b.length, engine.port, '127.0.0.1')
	}
	const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
	send('/subscribe', str('full'))
	await pause(100)
	send('/cue/go', int(3))
	send('/recall', int(1), int(4))
	send('/setlist/row/2/go')
	send('/show/blackout', int(1))
	send('/show/master', { type: 'f', value: 0.5 })
	await pause(1200)
	socket.close()
	engine.stop()
	const file = path.join(__dirname, 'fixtures', 'status-full.json')
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				about:
					'Datagrams (hex) from test/fake-engine.js at the Full level with two timelines and two layers, after cue 3, recall 1/4, set list row 2, blackout and master 0.5. Made by test/capture-fixture.js.',
				packets,
			},
			null,
			'\t',
		) + '\n',
	)
	console.log(`${packets.length} packets written to ${file}`)
}

main().catch((err) => {
	console.error(err)
	process.exitCode = 1
})
