// What the control socket tells of the show, kept as names: timelines and
// their cues, layers, rasters and regions, media and generator tiles,
// recalls and the set list; and from the status, the engine's name and
// whether it is the one driving the show. Only the fields named here are
// read; the document has many more and they change between builds.

const normalise = (text) =>
	String(text ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s\-_]+/g, '_')

/** Cue numbers compare as numbers when both read as one, else as text. */
function sameNumber(a, b) {
	const x = String(a ?? '').trim()
	const y = String(b ?? '').trim()
	if (x === '' || y === '') return x === y
	const nx = Number(x)
	const ny = Number(y)
	if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny
	return x === y
}

/**
 * Whether an engine is driving the show, from its status `pair`: it is
 * when its role is not Follows, or is Follows and it has gone live; a
 * leader that stood down is not.
 */
export function isDriving(pair) {
	if (!pair || typeof pair !== 'object') return false
	const role = pair.role
	const follows = role === 'Follows' || (role && typeof role === 'object' && 'Follows' in role)
	if (follows) return pair.live === true
	return pair.stood_down !== true
}

export class ShowModel {
	constructor() {
		this.clear()
	}

	clear() {
		this.name = ''
		this.timelines = []
		this.master = null
		this.layers = []
		this.rasters = []
		this.media = []
		this.generators = []
		this.recalls = { banks: [], items: [] }
		this.setList = { name: '', rows: [] }
		this.engineName = ''
		this.pair = null
		this.driving = false
		this.controlKey = false
		this.lastRecall = null
		this.currentRow = null
		this.hasShow = false
	}

	applyShow(show) {
		if (!show || typeof show !== 'object') return
		this.hasShow = true
		this.name = String(show.name ?? '')
		this.master = typeof show.master === 'number' ? show.master : null
		this.timelines = (show.timelines ?? []).map((t, i) => ({
			id: t.id,
			number: i + 1,
			name: String(t.name ?? ''),
			cues: (t.cues ?? []).map((c) => ({
				id: c.id,
				number: String(c.number ?? ''),
				name: String(c.name ?? ''),
				t: c.t,
			})),
			sections: (t.sections ?? []).map((s) => ({ id: s.id, name: String(s.name ?? '') })),
		}))
		this.layers = (show.layers ?? []).map((l, i) => ({ id: l.id, number: i + 1, name: String(l.name ?? '') }))
		this.rasters = (show.rasters ?? []).map((r, i) => ({
			id: r.id,
			number: i + 1,
			name: String(r.name ?? ''),
			regions: (r.regions ?? []).map((g, j) => ({ id: g.id, number: j + 1, name: String(g.name ?? '') })),
		}))
		this.media = flattenBank(show.banks?.media)
		this.generators = flattenBank(show.banks?.generators)
		const recalls = show.recalls ?? {}
		this.recalls = {
			banks: (recalls.banks ?? []).map((b) => ({ number: Number(b.number), name: String(b.name ?? '') })),
			items: (recalls.items ?? [])
				.filter((r) => r.at)
				.map((r) => ({
					folder: Number(r.at.folder),
					file: Number(r.at.file),
					name: String(r.name ?? ''),
					picture: typeof r.picture === 'string' && r.picture !== '' ? r.picture : null,
					kind: r.kind,
				})),
		}
	}

	applyStatus(status) {
		if (!status || typeof status !== 'object') return
		if (typeof status.name === 'string') this.engineName = status.name
		this.pair = status.pair ?? null
		this.driving = isDriving(this.pair)
		this.controlKey = status.control_key === true
		const recall = status.last_recall
		this.lastRecall =
			recall && typeof recall === 'object' ? { folder: Number(recall.folder), file: Number(recall.file) } : null
		const current = status.snapshot?.set_list?.current
		this.currentRow = typeof current === 'number' ? current : null
	}

	applySetList(wire) {
		const list = wire?.list ?? wire
		if (!list || typeof list !== 'object') return
		let number = 0
		this.setList = {
			name: String(list.name ?? ''),
			rows: (list.rows ?? []).map((r) => {
				const hasTimeline = typeof r.timeline === 'number'
				if (hasTimeline) number++
				return {
					id: r.id,
					number: hasTimeline ? number : null,
					timeline: hasTimeline ? r.timeline : null,
					timelineName: String(r.timeline_name ?? ''),
					skip: r.skip === true,
				}
			}),
		}
	}

	/** The master's index in the tab row, or 0 with none known. */
	get masterIndex() {
		const i = this.timelines.findIndex((t) => t.id === this.master)
		return i < 0 ? 0 : i
	}

	/** The master timeline's id, or null with no show. */
	get masterId() {
		return this.timelines[this.masterIndex]?.id ?? null
	}

	/**
	 * A timeline as an action names it: empty for the master, a number for
	 * its place, or a name. The index in the tab row, or null when unknown.
	 */
	timelineIndex(text) {
		const t = String(text ?? '').trim()
		if (t === '') return this.timelines.length > 0 ? this.masterIndex : null
		if (/^\d+$/.test(t)) {
			const i = Number(t) - 1
			return i >= 0 && i < this.timelines.length ? i : null
		}
		const wanted = normalise(t)
		const i = this.timelines.findIndex((x) => normalise(x.name) === wanted)
		return i < 0 ? null : i
	}

	/** A cue's name on a timeline (by index), by its number as text; empty when unknown. */
	cueName(timelineIndex, number) {
		const timeline = this.timelines[timelineIndex]
		if (!timeline) return ''
		const n = String(number ?? '').trim()
		if (n === '') return ''
		const cue = timeline.cues.find((c) => sameNumber(c.number, n))
		return cue ? cue.name : ''
	}

	/** The next cues of a timeline from a cue number: that cue and those after it. */
	cuesFrom(timelineIndex, number, count) {
		const timeline = this.timelines[timelineIndex]
		if (!timeline) return []
		const cues = [...timeline.cues].sort((a, b) => Number(a.number) - Number(b.number))
		let start = 0
		if (String(number ?? '').trim() !== '') {
			const i = cues.findIndex((c) => sameNumber(c.number, number))
			if (i >= 0) start = i
		}
		return cues.slice(start, start + count)
	}

	rasterIndex(text) {
		return indexByNumberOrName(this.rasters, text)
	}

	layerIndex(text) {
		return indexByNumberOrName(this.layers, text)
	}

	mediaEntry(folder, file) {
		return this.media.find((e) => e.folder === Number(folder) && e.file === Number(file)) ?? null
	}

	recall(folder, file) {
		return this.recalls.items.find((r) => r.folder === Number(folder) && r.file === Number(file)) ?? null
	}

	recallBankName(number) {
		return this.recalls.banks.find((b) => b.number === Number(number))?.name ?? ''
	}

	/** The current set list row's number and timeline name, from the status. */
	currentSetListRow() {
		if (this.currentRow === null) return null
		return this.setList.rows.find((r) => r.id === this.currentRow) ?? null
	}

	/** A set list row by its number as the window and the OSC status count them (timeline rows from 1); null for none. */
	setListRow(number) {
		const n = Number(number)
		if (!Number.isInteger(n) || n < 1) return null
		return this.setList.rows.find((r) => r.number === n) ?? null
	}

	// Dropdown choices, with the text these fields took before kept as custom values.

	timelineChoices() {
		return [
			{ id: '', label: 'Master timeline' },
			...this.timelines.map((t) => ({ id: String(t.number), label: `${t.number}: ${t.name}` })),
		]
	}

	/** The timelines by number alone, for a field that cannot mean the master by an empty value. */
	timelineNumberChoices() {
		return this.timelines.map((t) => ({ id: String(t.number), label: `${t.number}: ${t.name}` }))
	}

	cueChoices(timelineText) {
		const i = this.timelineIndex(timelineText)
		if (i === null) return []
		return this.timelines[i].cues.map((c) => ({
			id: c.number,
			label: c.name === '' ? c.number : `${c.number}  ${c.name}`,
		}))
	}

	/** Every timeline's cues, labelled by timeline, for a dropdown with no timeline context. */
	allCueChoices() {
		const seen = new Set()
		const out = []
		for (const t of this.timelines) {
			for (const c of t.cues) {
				if (seen.has(c.number)) continue
				seen.add(c.number)
				const names = this.timelines
					.map((x) => x.cues.find((y) => y.number === c.number))
					.filter(Boolean)
					.map((y) => y.name)
					.filter((n) => n !== '')
				out.push({ id: c.number, label: names.length ? `${c.number}  ${[...new Set(names)].join(' / ')}` : c.number })
			}
		}
		return out.sort((a, b) => Number(a.id) - Number(b.id))
	}

	layerChoices() {
		return this.layers.map((l) => ({ id: String(l.number), label: `${l.number}: ${l.name}` }))
	}

	rasterChoices() {
		return this.rasters.map((r) => ({ id: String(r.number), label: `${r.number}: ${r.name}` }))
	}

	/** Regions of every raster, as "raster/region" numbers, so a pick sets both. */
	regionChoices() {
		const out = []
		for (const r of this.rasters) {
			for (const g of r.regions) out.push({ id: `${r.number}/${g.number}`, label: `${r.name} › ${g.name}` })
		}
		return out
	}

	mediaChoices() {
		return this.media.map((e) => ({ id: `${e.folder}/${e.file}`, label: `${e.folder}/${e.file}  ${e.name}` }))
	}

	generatorChoices() {
		return this.generators.map((e) => ({ id: `${e.folder}/${e.file}`, label: `${e.folder}/${e.file}  ${e.name}` }))
	}

	recallChoices() {
		return this.recalls.items.map((r) => {
			const bank = this.recallBankName(r.folder)
			return { id: `${r.folder}/${r.file}`, label: `${bank === '' ? r.folder : bank} › ${r.file}  ${r.name}` }
		})
	}

	setListRowChoices() {
		return this.setList.rows
			.filter((r) => r.number !== null)
			.map((r) => ({ id: String(r.number), label: `${r.number}: ${r.timelineName}${r.skip ? ' (skipped)' : ''}` }))
	}
}

function flattenBank(bank) {
	const out = []
	for (const folder of bank?.folders ?? []) {
		for (const e of folder.entries ?? []) {
			if (!e.address) continue
			const item = e.item
			const kind = item && typeof item === 'object' && 'Live' in item ? 'live' : 'file'
			out.push({
				id: e.id,
				folder: Number(e.address.folder),
				file: Number(e.address.file),
				name: String(e.name ?? ''),
				folderName: String(folder.name ?? ''),
				kind,
			})
		}
	}
	return out
}

function indexByNumberOrName(list, text) {
	const t = String(text ?? '').trim()
	if (t === '') return null
	if (/^\d+$/.test(t)) {
		const i = Number(t) - 1
		return i >= 0 && i < list.length ? i : null
	}
	const wanted = normalise(t)
	const i = list.findIndex((x) => normalise(x.name) === wanted)
	return i < 0 ? null : i
}

export { sameNumber, normalise }
