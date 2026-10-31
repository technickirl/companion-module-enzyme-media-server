import test from 'node:test'
import assert from 'node:assert/strict'
import { ShowModel, isDriving } from '../src/show.js'
import { fixtureShow, fixtureStatus, fixtureSetList, IDS } from './fixture-show.js'
import { PictureStore, dataUri } from '../src/pictures.js'

function model() {
	const m = new ShowModel()
	m.applyShow(fixtureShow())
	m.applyStatus(fixtureStatus({ state: { cue: '3', next_cue: '4', setlist: [1, 'Main'], recall: [1, 1] } }))
	m.applySetList(fixtureSetList())
	return m
}

test('names from the fixture show', () => {
	const m = model()
	assert.equal(m.name, 'Fixture show')
	assert.deepEqual(
		m.timelines.map((t) => [t.number, t.name, t.cues.length]),
		[
			[1, 'Main', 11],
			[2, 'Encore', 2],
		],
	)
	assert.equal(m.masterIndex, 0)
	assert.deepEqual(
		m.layers.map((l) => l.name),
		['Backdrop', 'LED screens', 'Side screens', 'Overlay'],
	)
	assert.deepEqual(
		m.rasters.map((r) => [r.name, r.regions.map((g) => g.name)]),
		[
			['Stage', ['Left wall', 'Right wall']],
			['Foyer', ['Region 1']],
		],
	)
	assert.deepEqual(
		m.media.map((e) => [e.folder, e.file, e.name, e.kind]),
		[
			[1, 1, 'Logo loop', 'file'],
			[1, 2, 'Rain', 'file'],
			[1, 5, 'Credits', 'file'],
			[250, 1, 'Camera 1', 'live'],
		],
	)
	assert.equal(m.generators.length, 2)
	assert.deepEqual(
		m.recalls.items.map((r) => [r.folder, r.file, r.name, r.picture !== null]),
		[
			[1, 1, 'Warm', true],
			[1, 2, 'Cold', false],
			[1, 4, 'Blackout look', false],
			[2, 1, 'Camera', false],
		],
	)
	assert.equal(m.recallBankName(2), 'Sources')
	assert.equal(m.engineName, 'Fake Enzyme')
	assert.equal(m.driving, true)
	assert.deepEqual(m.lastRecall, { folder: 1, file: 1 })
	assert.equal(m.setList.name, 'Tour set')
	assert.deepEqual(
		m.setList.rows.map((r) => [r.number, r.timelineName, r.skip]),
		[
			[1, 'Main', false],
			[null, '', false],
			[2, 'Encore', true],
			[3, 'Main', false],
		],
	)
	assert.equal(m.currentSetListRow().number, 1)
})

test('timelines, rasters and layers by number or name; cue names by number', () => {
	const m = model()
	assert.equal(m.timelineIndex(''), 0)
	assert.equal(m.timelineIndex('2'), 1)
	assert.equal(m.timelineIndex('encore'), 1)
	assert.equal(m.timelineIndex('ENCORE'), 1)
	assert.equal(m.timelineIndex('3'), null)
	assert.equal(m.timelineIndex('nowhere'), null)
	assert.equal(m.rasterIndex('Foyer'), 1)
	assert.equal(m.rasterIndex('1'), 0)
	assert.equal(m.layerIndex('led-screens'), 1)
	assert.equal(m.cueName(0, '3'), 'Title')
	assert.equal(m.cueName(0, '3.0'), 'Title')
	assert.equal(m.cueName(0, '3.5'), 'Title hold')
	assert.equal(m.cueName(0, '99'), '')
	assert.equal(m.cueName(0, ''), '')
	assert.equal(m.cueName(1, '2'), 'Bows')
	assert.equal(m.cueName(5, '1'), '')
	assert.deepEqual(
		m.cuesFrom(0, '7', 8).map((c) => c.number),
		['7', '8', '9', '10'],
	)
	assert.deepEqual(
		m.cuesFrom(0, '', 3).map((c) => c.number),
		['1', '2', '3'],
	)
	assert.deepEqual(
		m.cuesFrom(0, '3.5', 2).map((c) => c.name),
		['Title hold', 'Band on'],
	)
})

test('dropdown choices from the show', () => {
	const m = model()
	assert.deepEqual(m.timelineChoices(), [
		{ id: '', label: 'Master timeline' },
		{ id: '1', label: '1: Main' },
		{ id: '2', label: '2: Encore' },
	])
	assert.deepEqual(m.cueChoices('')[3], { id: '3.5', label: '3.5  Title hold' })
	assert.deepEqual(m.cueChoices('encore')[1], { id: '2', label: '2  Bows' })
	assert.deepEqual(m.cueChoices('nowhere'), [])
	const all = m.allCueChoices()
	assert.deepEqual(all[0], { id: '1', label: '1  Walk in / Encore start' })
	assert.equal(all.length, 11)
	assert.deepEqual(m.layerChoices()[1], { id: '2', label: '2: LED screens' })
	assert.deepEqual(m.rasterChoices(), [
		{ id: '1', label: '1: Stage' },
		{ id: '2', label: '2: Foyer' },
	])
	assert.deepEqual(m.regionChoices(), [
		{ id: '1/1', label: 'Stage › Left wall' },
		{ id: '1/2', label: 'Stage › Right wall' },
		{ id: '2/1', label: 'Foyer › Region 1' },
	])
	assert.deepEqual(m.mediaChoices()[2], { id: '1/5', label: '1/5  Credits' })
	assert.deepEqual(m.recallChoices()[0], { id: '1/1', label: 'Looks › 1  Warm' })
	assert.deepEqual(m.recallChoices()[3], { id: '2/1', label: 'Sources › 1  Camera' })
	assert.deepEqual(m.setListRowChoices(), [
		{ id: 1, label: '1: Main' },
		{ id: 2, label: '2: Encore (skipped)' },
		{ id: 3, label: '3: Main' },
	])
})

test('the driving rule for each pair shape', () => {
	assert.equal(isDriving({ role: 'Alone', live: false, stood_down: false }), true)
	assert.equal(isDriving({ role: 'Alone', stood_down: true }), false)
	assert.equal(isDriving({ role: { Leads: { backup: '10.0.0.2:9200' } }, stood_down: false }), true)
	assert.equal(isDriving({ role: { Leads: { backup: '10.0.0.2:9200' } }, stood_down: true }), false)
	assert.equal(isDriving({ role: { Follows: { leader: '10.0.0.1:9200' } }, live: false }), false)
	assert.equal(isDriving({ role: { Follows: { leader: '10.0.0.1:9200' } }, live: true }), true)
	assert.equal(isDriving({ role: 'Follows', live: true }), true)
	assert.equal(isDriving(null), false)
	assert.equal(isDriving({}), true)
	const m = new ShowModel()
	m.applyStatus(fixtureStatus({ following: true }))
	assert.equal(m.driving, false)
	m.applyStatus(fixtureStatus({ following: true, live: true }))
	assert.equal(m.driving, true)
})

test('an empty or odd document leaves the model sane', () => {
	const m = new ShowModel()
	m.applyShow({})
	assert.equal(m.hasShow, true)
	assert.deepEqual(m.timelines, [])
	assert.equal(m.timelineIndex(''), null)
	assert.equal(m.cueName(0, '1'), '')
	m.applyShow(null)
	m.applyStatus('nonsense')
	m.applySetList(undefined)
	assert.equal(m.driving, false)
	m.applyShow({ timelines: [{ id: 1, name: 'Only' }], layers: [{ id: 2 }], rasters: [{ id: 3 }], master: 1 })
	assert.deepEqual(m.timelineChoices()[1], { id: '1', label: '1: Only' })
	assert.equal(m.layers[0].name, '')
	assert.equal(IDS.timelineMain, 11)
})

test('pictures are kept as data URIs and a recheck gives the same string back', () => {
	const store = new PictureStore({ limit: 2 })
	assert.equal(dataUri(''), null)
	assert.equal(dataUri('/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ')
	assert.equal(store.set('raster:1', '/9j/one'), true)
	const first = store.get('raster:1')
	assert.equal(first, 'data:image/jpeg;base64,/9j/one')
	assert.equal(store.set('raster:1', '/9j/one'), false, 'the same picture again is no change')
	assert.equal(store.get('raster:1'), first, 'the very same string comes back')
	assert.equal(store.set('raster:1', '/9j/two'), true)
	assert.notEqual(store.get('raster:1'), first)
	assert.equal(store.set('raster:2', '/9j/x'), true)
	assert.equal(store.set('raster:3', '/9j/y'), true)
	assert.equal(store.size, 2, 'the oldest goes past the limit')
	assert.equal(store.has('raster:1'), false)
	assert.equal(store.get('nothing'), null)
	assert.equal(store.set('raster:2', ''), true, 'an empty picture removes it')
	assert.equal(store.has('raster:2'), false)
})
