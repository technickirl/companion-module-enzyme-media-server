const test = require('node:test')
const assert = require('node:assert/strict')
const osc = require('../src/osc')

test('encodes and decodes a message with every argument type', () => {
	const message = { address: '/layer/3/opacity', args: [osc.float(0.5), osc.str('snap'), osc.int(2)] }
	const [back] = osc.decode(osc.encode(message))
	assert.equal(back.address, '/layer/3/opacity')
	assert.deepEqual(
		back.args.map((a) => a.type),
		['f', 's', 'i'],
	)
	assert.equal(back.args[0].value, 0.5)
	assert.equal(back.args[1].value, 'snap')
	assert.equal(back.args[2].value, 2)
})

test('flattens a bundle and ignores rubbish', () => {
	const lib = require('osc')
	const bundle = Buffer.from(
		lib.writeBundle({
			timeTag: lib.timeTag(0),
			packets: [
				{ address: '/a', args: [{ type: 'i', value: 1 }] },
				{ address: '/b', args: [] },
			],
		}),
	)
	assert.deepEqual(
		osc.decode(bundle).map((m) => m.address),
		['/a', '/b'],
	)
	assert.deepEqual(osc.decode(Buffer.from('not osc at all')), [])
	assert.deepEqual(osc.decode(Buffer.alloc(0)), [])
})

test('numbers go as ints when whole and floats otherwise', () => {
	assert.deepEqual(osc.number(3), { type: 'i', value: 3 })
	assert.deepEqual(osc.number('3'), { type: 'i', value: 3 })
	assert.deepEqual(osc.number(1.5), { type: 'f', value: 1.5 })
	assert.deepEqual(osc.cueArg('1.5'), { type: 'f', value: 1.5 })
	assert.deepEqual(osc.cueArg(' 12 '), { type: 'i', value: 12 })
	assert.deepEqual(osc.cueArg('Encore'), { type: 's', value: 'Encore' })
})

test('names become address parts; numbers stay numbers', () => {
	assert.equal(osc.namePart('3'), '3')
	assert.equal(osc.namePart('LED screens'), 'LED_screens')
	assert.equal(osc.namePart(' led-screens '), 'led_screens')
	assert.equal(osc.namePart(''), '')
	assert.equal(osc.timelinePrefix(''), '')
	assert.equal(osc.timelinePrefix('2'), '/timeline/2')
	assert.equal(osc.timelinePrefix('Encore'), '/timeline/Encore')
})

test('a time is nothing, snap or seconds', () => {
	assert.deepEqual(osc.timeArgs(''), [])
	assert.deepEqual(osc.timeArgs('  '), [])
	assert.deepEqual(osc.timeArgs('Snap'), [osc.str('snap')])
	assert.deepEqual(osc.timeArgs('4'), [osc.float(4)])
	assert.deepEqual(osc.timeArgs('0'), [osc.float(0)])
	assert.deepEqual(osc.timeArgs('soon'), [])
})

test('custom arguments are typed from their text', () => {
	assert.deepEqual(osc.parseArgs('1 2.5 go "cue 1" \'12\' -3 1e3'), [
		osc.int(1),
		osc.float(2.5),
		osc.str('go'),
		osc.str('cue 1'),
		osc.str('12'),
		osc.int(-3),
		osc.float(1000),
	])
	assert.deepEqual(osc.parseArgs(''), [])
	assert.deepEqual(osc.parseArgs(undefined), [])
})

test('argument values read as numbers and text whatever their type', () => {
	assert.equal(osc.argNumber({ type: 'i', value: 3 }), 3)
	assert.equal(osc.argNumber({ type: 'f', value: 2.5 }), 2.5)
	assert.equal(osc.argNumber({ type: 's', value: '7' }), 7)
	assert.equal(osc.argNumber({ type: 'T', value: true }), 1)
	assert.ok(Number.isNaN(osc.argNumber(undefined)))
	assert.equal(osc.argText({ type: 'i', value: 3 }), '3')
	assert.equal(osc.argText(undefined), '')
})
