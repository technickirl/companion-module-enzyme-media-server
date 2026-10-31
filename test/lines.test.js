import test from 'node:test'
import assert from 'node:assert/strict'
import { LineSplitter } from '../src/lines.js'

test('lines split across chunks come out whole, and a part is held', () => {
	const s = new LineSplitter()
	assert.deepEqual(s.push(Buffer.from('{"a":1}\n{"b"')), ['{"a":1}'])
	assert.equal(s.pending, 4)
	assert.deepEqual(s.push(Buffer.from(':2}\n')), ['{"b":2}'])
	assert.equal(s.pending, 0)
	assert.deepEqual(s.push(Buffer.from('')), [])
	assert.deepEqual(s.push(Buffer.from('\n\n')), ['', ''])
})

test('a long line over many chunks, and multibyte text across a boundary', () => {
	const s = new LineSplitter()
	const big = 'x'.repeat(300_000)
	const line = `{"Show":"${big}"}`
	const bytes = Buffer.from(`${line}\n"Admitted"\n`)
	const out = []
	for (let i = 0; i < bytes.length; i += 7000) out.push(...s.push(bytes.subarray(i, i + 7000)))
	assert.deepEqual(out, [line, '"Admitted"'])
	const text = Buffer.from('{"name":"Encore ✓ café"}\n')
	const t = new LineSplitter()
	const got = [...t.push(text.subarray(0, 14)), ...t.push(text.subarray(14, 18)), ...t.push(text.subarray(18))]
	assert.deepEqual(got, ['{"name":"Encore ✓ café"}'])
})
