#!/usr/bin/env node

import { createReadStream } from 'node:fs'
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const frontendDir = resolve(dirname(scriptPath), '..')
const repoRoot = resolve(frontendDir, '..')
const defaultSnapshotPath = resolve(frontendDir, 'public/workbench-data/co-star-snapshot.json')
const defaultOutputDir = dirname(defaultSnapshotPath)
const positionMappingPath = resolve(repoRoot, 'backend/scripts/position_id_mapping.json')

const SUPPORTED_POSITIONS = Object.freeze([
	{ id: 102, label: '声优' },
	{ id: 2, label: '监督' },
	{ id: 3, label: '脚本' },
	{ id: 6, label: '音乐' },
	{ id: 10, label: '系列构成' },
	{ id: 44, label: '音响监督' },
])
const SUPPORTED_POSITION_IDS = new Set(SUPPORTED_POSITIONS.map(({ id }) => id))
const PRIOR_SERIES_COUNT = 5

// Keep these in sync with backend/scripts/update_database.py::load_sequels.
const SAME_SERIES_RELATIONS = new Set([
	2, 3, 4, 5, 6, 9, 10, 11, 12,
	1002, 1003, 1004, 1005, 1006, 1007, 1008, 1010, 1013, 1015,
	4002, 4003, 4006, 4009, 4010, 4012, 4015, 4016, 4017, 4018,
])
const MAIN_SERIES_POSITIVE_RELATIONS = new Set([
	1, 3, 4, 6, 11, 1003, 1006, 1007, 4003, 4006, 4015, 4018, 4019,
])
const MAIN_SERIES_NEUTRAL_RELATIONS = new Set([
	7, 8, 9, 10, 14, 99,
	1004, 1010, 1011, 1012, 1013, 1014, 1015, 1099,
	3001, 3002, 3003, 3004, 3005, 3006, 3007, 3099,
	4007, 4008, 4009, 4010, 4014, 4016, 4099,
])
const MAIN_SERIES_NEGATIVE_RELATIONS = new Set([
	2, 5, 12, 1002, 1005, 1008, 4002, 4012, 4017,
])

const REQUIRED_JSONLINES = Object.freeze([
	'subject.jsonlines',
	'person.jsonlines',
	'character.jsonlines',
	'subject-persons.jsonlines',
	'subject-characters.jsonlines',
	'person-characters.jsonlines',
	'subject-relations.jsonlines',
])

const helpText = `Usage:
  node frontend/scripts/generate-workbench-data.mjs --jsonlines-dir <directory> [options]

Options:
  --jsonlines-dir <directory>       Directory containing the Bangumi *.jsonlines dump.
                                    Defaults to BANGUMI_JSONLINES_DIR.
  --collections-snapshot <file>     Snapshot supplying preserved user collection rows.
                                    Default: frontend/public/workbench-data/co-star-snapshot.json
  --output-dir <directory>          Destination for both generated JSON files.
                                    Default: frontend/public/workbench-data
  -h, --help                        Show this help.

The generator is intentionally offline. It never calls the Bangumi API. It writes
co-star-snapshot.json and position-data.json with stable ordering and atomic renames.
The source snapshot's generatedAt is retained by default so identical inputs produce
identical bytes. Set SOURCE_DATE_EPOCH to override generatedAt reproducibly.
`

function parseArgs(argv) {
	const options = {
		jsonlinesDir: process.env.BANGUMI_JSONLINES_DIR || '',
		collectionsSnapshot: defaultSnapshotPath,
		outputDir: defaultOutputDir,
		help: false,
	}

	const readValue = (argument, index) => {
		const equalsAt = argument.indexOf('=')
		if (equalsAt >= 0) return { value: argument.slice(equalsAt + 1), nextIndex: index }
		const value = argv[index + 1]
		if (!value || value.startsWith('-')) throw new Error(`Missing value for ${argument}`)
		return { value, nextIndex: index + 1 }
	}

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]
		if (argument === '-h' || argument === '--help') {
			options.help = true
			continue
		}

		const name = argument.split('=', 1)[0]
		if (!['--jsonlines-dir', '--collections-snapshot', '--output-dir'].includes(name)) {
			throw new Error(`Unknown argument: ${argument}`)
		}
		const { value, nextIndex } = readValue(argument, index)
		index = nextIndex
		if (!value.trim()) throw new Error(`Empty value for ${name}`)
		if (name === '--jsonlines-dir') options.jsonlinesDir = value
		if (name === '--collections-snapshot') options.collectionsSnapshot = value
		if (name === '--output-dir') options.outputDir = value
	}

	return options
}

function resolveFromCwd(value) {
	return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value)
}

function displayPath(path) {
	const relativePath = relative(repoRoot, path)
	if (relativePath && relativePath !== '..' && !relativePath.startsWith(`..${sep}`)) {
		return relativePath.split(sep).join('/')
	}
	return path
}

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'))
	} catch (error) {
		throw new Error(`Unable to read JSON ${path}: ${error.message}`, { cause: error })
	}
}

async function forEachJsonLine(path, visitor) {
	const stream = createReadStream(path, { encoding: 'utf8' })
	const lines = createInterface({ input: stream, crlfDelay: Infinity })
	let lineNumber = 0
	try {
		for await (let line of lines) {
			lineNumber += 1
			if (lineNumber === 1) line = line.replace(/^\uFEFF/, '')
			if (!line.trim()) continue
			let value
			try {
				value = JSON.parse(line)
			} catch (error) {
				throw new Error(`${basename(path)}:${lineNumber}: ${error.message}`, { cause: error })
			}
			visitor(value, lineNumber)
		}
	} finally {
		lines.close()
		stream.destroy()
	}
}

class SparseUnionFind {
	#parent = new Map()
	#size = new Map()
	#minimum = new Map()

	#ensure(value) {
		if (this.#parent.has(value)) return
		this.#parent.set(value, value)
		this.#size.set(value, 1)
		this.#minimum.set(value, value)
	}

	find(value) {
		this.#ensure(value)
		let root = value
		while (this.#parent.get(root) !== root) root = this.#parent.get(root)
		let current = value
		while (this.#parent.get(current) !== current) {
			const next = this.#parent.get(current)
			this.#parent.set(current, root)
			current = next
		}
		return root
	}

	union(left, right) {
		let leftRoot = this.find(left)
		let rightRoot = this.find(right)
		if (leftRoot === rightRoot) return false
		if (this.#size.get(leftRoot) < this.#size.get(rightRoot)) {
			;[leftRoot, rightRoot] = [rightRoot, leftRoot]
		}
		this.#parent.set(rightRoot, leftRoot)
		this.#size.set(leftRoot, this.#size.get(leftRoot) + this.#size.get(rightRoot))
		this.#minimum.set(leftRoot, Math.min(
			this.#minimum.get(leftRoot),
			this.#minimum.get(rightRoot),
		))
		return true
	}

	seriesId(value) {
		if (!this.#parent.has(value)) return value
		return this.#minimum.get(this.find(value))
	}
}

function addMapValue(map, key, delta) {
	map.set(key, (map.get(key) || 0) + delta)
}

function normalizedSubjectDate(value) {
	return String(value || '') || '9999-99-99'
}

function sumNumericValues(value) {
	return Object.values(value || {}).reduce((sum, item) => sum + (Number(item) || 0), 0)
}

function floorTwo(value) {
	return Math.floor((value + Number.EPSILON) * 100) / 100
}

function averagePositive(values) {
	const positive = values.map(Number).filter((value) => value > 0)
	return positive.length ? floorTwo(positive.reduce((sum, value) => sum + value, 0) / positive.length) : 0
}

function unique(values) {
	return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))]
}

function cleanWikiValue(value) {
	return String(value || '')
		.replace(/<!--.*?-->/g, '')
		.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/'''?/g, '')
		.trim()
}

function extractInfoboxField(infobox, names) {
	for (const name of names) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const match = String(infobox || '').match(new RegExp(`^\\|${escaped}\\s*=\\s*(.*?)\\s*$`, 'm'))
		const value = cleanWikiValue(match?.[1])
		if (value) return value
	}
	return ''
}

function extractChineseName(item) {
	return extractInfoboxField(item.infobox, ['简体中文名', '中文名']) || String(item.name || '')
}

function extractAliases(item, nameCN) {
	const aliases = [String(item.name || ''), nameCN]
	const infobox = String(item.infobox || '')
	const block = infobox.match(/^\|别名\s*=\s*\{([\s\S]*?)^\}/m)?.[1] || ''
	for (const match of block.matchAll(/\[([^\]\r\n]+)\]/g)) {
		const raw = match[1]
		const pipeAt = raw.indexOf('|')
		const value = cleanWikiValue(pipeAt >= 0 ? raw.slice(pipeAt + 1) : raw)
		if (value) aliases.push(value)
	}
	const singleAlias = extractInfoboxField(infobox, ['别名'])
	if (singleAlias && singleAlias !== '{') aliases.push(singleAlias)
	return unique(aliases)
}

function bangumiImageSet(resource, id, includeCommon = false) {
	const base = `https://api.bgm.tv/v0/${resource}/${id}/image?type=`
	return {
		small: `${base}small`,
		medium: `${base}medium`,
		...(includeCommon ? { common: `${base}common` } : { large: `${base}large` }),
	}
}

function subjectFromDump(item, collection) {
	const id = Number(item.id)
	const name = String(item.name || '')
	const nameCN = String(item.name_cn || '') || name
	return {
		id,
		type: Number(item.type) || 0,
		name,
		nameCN,
		displayName: nameCN || name,
		date: item.date || '',
		score: Number(item.score) || 0,
		ratingCount: sumNumericValues(item.score_details),
		rank: Number(item.rank) || 0,
		favoriteCount: sumNumericValues(item.favorite),
		nsfw: Boolean(item.nsfw),
		seriesId: id,
		metaTags: Array.isArray(item.meta_tags) ? item.meta_tags : [],
		tags: Array.isArray(item.tags) ? item.tags : [],
		image: bangumiImageSet('subjects', id, true),
		collection: structuredClone(collection),
	}
}

function seriesMemberFromDump(item, seriesId, sequelOrder) {
	const id = Number(item.id)
	const name = String(item.name || '')
	const nameCN = String(item.name_cn || '') || name
	return {
		id,
		seriesId,
		sequelOrder,
		name,
		nameCN,
		displayName: nameCN || name,
		image: bangumiImageSet('subjects', id, true),
	}
}

function personFromDump(item) {
	const id = Number(item.id)
	const name = String(item.name || '')
	const nameCN = extractChineseName(item) || name
	return {
		id,
		name,
		nameCN,
		displayName: nameCN || name || `人物 ${id}`,
		aliases: extractAliases(item, nameCN),
		career: Array.isArray(item.career) ? item.career : [],
		image: bangumiImageSet('persons', id),
	}
}

function fallbackPerson(id) {
	return {
		id,
		name: `人物 ${id}`,
		nameCN: `人物 ${id}`,
		displayName: `人物 ${id}`,
		aliases: [],
		career: [],
		image: bangumiImageSet('persons', id),
	}
}

function characterFromDump(item) {
	const id = Number(item.id)
	const name = String(item.name || '')
	const nameCN = extractChineseName(item) || name
	return { id, name, nameCN, displayName: nameCN || name || `角色 ${id}` }
}

function roleLabel(roleType) {
	return ({ 1: '主役', 2: '配角', 3: '客串', 4: '其他' })[Number(roleType)] || '其他'
}

function addCredit(creditIndex, personId, positionId, subjectId) {
	let positions = creditIndex.get(personId)
	if (!positions) {
		positions = new Map()
		creditIndex.set(personId, positions)
	}
	let subjects = positions.get(positionId)
	if (!subjects) {
		subjects = new Set()
		positions.set(positionId, subjects)
	}
	const before = subjects.size
	subjects.add(subjectId)
	return subjects.size !== before
}

function addVoiceRole(roleIndex, personId, subjectId, role) {
	let subjects = roleIndex.get(personId)
	if (!subjects) {
		subjects = new Map()
		roleIndex.set(personId, subjects)
	}
	let roles = subjects.get(subjectId)
	if (!roles) {
		roles = new Map()
		subjects.set(subjectId, roles)
	}
	const before = roles.size
	roles.set(role.characterId, role)
	return roles.size !== before
}

function materializeRoles(personId, roleIndex, charactersById) {
	const bySubject = roleIndex.get(personId)
	if (!bySubject) return {}
	const result = {}
	for (const [subjectId, rawRoles] of [...bySubject].sort(([left], [right]) => left - right)) {
		result[String(subjectId)] = [...rawRoles.values()]
			.map((rawRole) => {
				const character = charactersById.get(rawRole.characterId) || {
					name: `角色 ${rawRole.characterId}`,
					nameCN: `角色 ${rawRole.characterId}`,
					displayName: `角色 ${rawRole.characterId}`,
				}
				return {
					characterId: rawRole.characterId,
					roleType: rawRole.roleType,
					roleLabel: roleLabel(rawRole.roleType),
					sortOrder: rawRole.sortOrder,
					name: character.name,
					nameCN: character.nameCN,
					displayName: character.displayName,
				}
			})
			.sort((left, right) => left.sortOrder - right.sortOrder
				|| left.roleType - right.roleType
				|| left.characterId - right.characterId)
	}
	return result
}

function deriveDumpReleaseAt(directory) {
	const match = basename(directory).match(/^dump-(\d{4}-\d{2}-\d{2})\.(\d{2})(\d{2})(\d{2})Z$/)
	return match ? `${match[1]}T${match[2]}:${match[3]}:${match[4]}Z` : undefined
}

function deterministicGeneratedAt(sourceMeta, dumpReleaseAt) {
	if (process.env.SOURCE_DATE_EPOCH) {
		const epoch = Number(process.env.SOURCE_DATE_EPOCH)
		if (!Number.isFinite(epoch)) throw new Error('SOURCE_DATE_EPOCH must be a finite Unix timestamp')
		return new Date(epoch * 1000).toISOString()
	}
	return sourceMeta.generatedAt || dumpReleaseAt || '1970-01-01T00:00:00.000Z'
}

function commonSubjectIds(peopleById, personIds) {
	const sets = personIds
		.map((personId) => peopleById.get(Number(personId))?.positions?.['102']?.subjectIds || [])
		.map((ids) => new Set(ids.map(Number)))
	if (sets.length !== personIds.length || !sets.length) return []
	return [...sets[0]].filter((subjectId) => sets.every((set) => set.has(subjectId))).sort((a, b) => a - b)
}

async function stageAtomicJsonWrites(entries) {
	const staged = []
	try {
		for (const [index, entry] of entries.entries()) {
			await mkdir(dirname(entry.path), { recursive: true })
			const temporaryPath = resolve(
				dirname(entry.path),
				`.${basename(entry.path)}.${process.pid}.${index}.tmp`,
			)
			await writeFile(temporaryPath, `${JSON.stringify(entry.value)}\n`, {
				encoding: 'utf8',
				flag: 'wx',
			})
			staged.push({ temporaryPath, finalPath: entry.path })
		}
		for (const { temporaryPath, finalPath } of staged) await rename(temporaryPath, finalPath)
	} catch (error) {
		await Promise.all(staged.map(({ temporaryPath }) => rm(temporaryPath, { force: true })))
		throw error
	}
}

async function generate(options) {
	const jsonlinesDir = resolveFromCwd(options.jsonlinesDir)
	const collectionsSnapshotPath = resolveFromCwd(options.collectionsSnapshot)
	const outputDir = resolveFromCwd(options.outputDir)
	const jsonlinePath = (name) => resolve(jsonlinesDir, name)

	await Promise.all([
		...REQUIRED_JSONLINES.map((name) => access(jsonlinePath(name), fsConstants.R_OK)),
		access(collectionsSnapshotPath, fsConstants.R_OK),
		access(positionMappingPath, fsConstants.R_OK),
	])

	const sourceSnapshot = await readJson(collectionsSnapshotPath)
	if (!sourceSnapshot?.meta || !Array.isArray(sourceSnapshot.subjects)) {
		throw new Error('The collections snapshot must contain meta and subjects arrays')
	}

	const collectionBySubject = new Map()
	for (const subject of sourceSnapshot.subjects) {
		const subjectId = Number(subject?.id)
		if (!Number.isInteger(subjectId) || !subject?.collection) continue
		if (collectionBySubject.has(subjectId)) throw new Error(`Duplicate collection subject: ${subjectId}`)
		collectionBySubject.set(subjectId, structuredClone(subject.collection))
	}
	if (!collectionBySubject.size) throw new Error('The collections snapshot has no usable collection rows')

	const positionMapping = await readJson(positionMappingPath)
	const typeBySubject = new Map()
	const dateBySubject = new Map()
	const subjectsById = new Map()

	console.error(`[1/8] Reading ${displayPath(jsonlinePath('subject.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('subject.jsonlines'), (item) => {
		const subjectId = Number(item.id)
		if (!Number.isInteger(subjectId)) return
		const subjectType = Number(item.type) || 0
		typeBySubject.set(subjectId, subjectType)
		dateBySubject.set(subjectId, normalizedSubjectDate(item.date))
		const collection = collectionBySubject.get(subjectId)
		if (collection) subjectsById.set(subjectId, subjectFromDump(item, collection))
	})

	const missingSubjects = [...collectionBySubject.keys()]
		.filter((subjectId) => !subjectsById.has(subjectId))
		.sort((a, b) => a - b)
	if (missingSubjects.length) {
		throw new Error(`JSONLines dump is missing ${missingSubjects.length} collected subjects: ${missingSubjects.slice(0, 20).join(', ')}`)
	}

	const series = new SparseUnionFind()
	const mainSeriesPossibilityScore = new Map()
	let sameSeriesEdges = 0
	console.error(`[2/8] Reading ${displayPath(jsonlinePath('subject-relations.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('subject-relations.jsonlines'), (item) => {
		const subjectId = Number(item.subject_id)
		const relatedSubjectId = Number(item.related_subject_id)
		const relationType = Number(item.relation_type)
		const subjectType = typeBySubject.get(subjectId)
		const relatedSubjectType = typeBySubject.get(relatedSubjectId)
		if (subjectType === undefined || relatedSubjectType === undefined) return
		const isSameType = subjectType === relatedSubjectType

		if (SAME_SERIES_RELATIONS.has(relationType) && isSameType) {
			if (series.union(subjectId, relatedSubjectId)) sameSeriesEdges += 1
		}
		if (MAIN_SERIES_POSITIVE_RELATIONS.has(relationType) && isSameType) {
			addMapValue(mainSeriesPossibilityScore, subjectId, 5)
			addMapValue(mainSeriesPossibilityScore, relatedSubjectId, -5)
		}
		if (MAIN_SERIES_NEGATIVE_RELATIONS.has(relationType) && isSameType) {
			addMapValue(mainSeriesPossibilityScore, subjectId, -5)
			addMapValue(mainSeriesPossibilityScore, relatedSubjectId, 5)
		}
		if (MAIN_SERIES_NEUTRAL_RELATIONS.has(relationType)) {
			addMapValue(mainSeriesPossibilityScore, subjectId, 1)
			addMapValue(mainSeriesPossibilityScore, relatedSubjectId, 1)
		}
	})
	for (const subject of subjectsById.values()) subject.seriesId = series.seriesId(subject.id)

	const relevantSeriesIds = new Set([...subjectsById.values()].map((subject) => subject.seriesId))
	const memberIdsBySeries = new Map()
	for (const subjectId of typeBySubject.keys()) {
		const seriesId = series.seriesId(subjectId)
		if (!relevantSeriesIds.has(seriesId)) continue
		const memberIds = memberIdsBySeries.get(seriesId) || []
		memberIds.push(subjectId)
		memberIdsBySeries.set(seriesId, memberIds)
	}

	const sequelOrderBySubject = new Map()
	for (const memberIds of memberIdsBySeries.values()) {
		memberIds.sort((left, right) =>
			(mainSeriesPossibilityScore.get(right) || 0) - (mainSeriesPossibilityScore.get(left) || 0)
				|| dateBySubject.get(left).localeCompare(dateBySubject.get(right))
				|| left - right)
		if (memberIds.length > 1) {
			const [first, second] = memberIds
			const scoreDifference = (mainSeriesPossibilityScore.get(first) || 0)
				- (mainSeriesPossibilityScore.get(second) || 0)
			if (scoreDifference < 15 && dateBySubject.get(first) > dateBySubject.get(second)) {
				;[memberIds[0], memberIds[1]] = [memberIds[1], memberIds[0]]
			}
		}
		memberIds.forEach((subjectId, order) => sequelOrderBySubject.set(subjectId, order))
	}

	const seriesMembers = []
	console.error(`[3/8] Reading complete series members from ${displayPath(jsonlinePath('subject.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('subject.jsonlines'), (item) => {
		const subjectId = Number(item.id)
		const sequelOrder = sequelOrderBySubject.get(subjectId)
		if (sequelOrder === undefined) return
		seriesMembers.push(seriesMemberFromDump(item, series.seriesId(subjectId), sequelOrder))
	})
	seriesMembers.sort((left, right) => Number(left.seriesId) - Number(right.seriesId)
		|| left.sequelOrder - right.sequelOrder
		|| left.id - right.id)

	const creditIndex = new Map()
	const validCvPersonIds = new Set()
	let invalidSubjectPersonRows = 0
	let unmappedPositionRows = 0
	let directCreditEdges = 0
	console.error(`[4/8] Reading ${displayPath(jsonlinePath('subject-persons.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('subject-persons.jsonlines'), (item) => {
		const subjectId = Number(item.subject_id)
		const personId = Number(item.person_id)
		if (!typeBySubject.has(subjectId)) {
			invalidSubjectPersonRows += 1
			return
		}
		validCvPersonIds.add(personId)
		if (!collectionBySubject.has(subjectId)) return
		const mappedPositions = positionMapping[String(item.position)]
		if (!Array.isArray(mappedPositions)) {
			unmappedPositionRows += 1
			return
		}
		for (const rawPositionId of mappedPositions) {
			const positionId = Number(rawPositionId)
			if (!SUPPORTED_POSITION_IDS.has(positionId)) continue
			if (addCredit(creditIndex, personId, positionId, subjectId)) directCreditEdges += 1
		}
	})

	const subjectCharacterPositions = new Map()
	console.error(`[5/8] Reading ${displayPath(jsonlinePath('subject-characters.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('subject-characters.jsonlines'), (item) => {
		const subjectId = Number(item.subject_id)
		if (!collectionBySubject.has(subjectId)) return
		const subjectType = typeBySubject.get(subjectId)
		if (subjectType !== 2 && subjectType !== 4) return
		let characters = subjectCharacterPositions.get(subjectId)
		if (!characters) {
			characters = new Map()
			subjectCharacterPositions.set(subjectId, characters)
		}
		const roleType = Number(item.type) || 0
		characters.set(Number(item.character_id), {
			originalPositionId: (subjectType === 2 ? 100 : 1100) + roleType,
			roleType,
			sortOrder: Number(item.order) || 0,
		})
	})

	const voiceRoleIndex = new Map()
	const usedCharacterIds = new Set()
	let voiceCreditEdges = 0
	let voiceRoleRecords = 0
	let unmappedVoicePositionRows = 0
	console.error(`[6/8] Reading ${displayPath(jsonlinePath('person-characters.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('person-characters.jsonlines'), (item) => {
		const subjectId = Number(item.subject_id)
		const personId = Number(item.person_id)
		const characterId = Number(item.character_id)
		if (!validCvPersonIds.has(personId)) return
		const rawRole = subjectCharacterPositions.get(subjectId)?.get(characterId)
		if (!rawRole) return
		const mappedPositions = positionMapping[String(rawRole.originalPositionId)]
		if (!Array.isArray(mappedPositions)) {
			unmappedVoicePositionRows += 1
			return
		}
		let isSupportedVoice = false
		for (const rawPositionId of mappedPositions) {
			const positionId = Number(rawPositionId)
			if (!SUPPORTED_POSITION_IDS.has(positionId)) continue
			if (addCredit(creditIndex, personId, positionId, subjectId)) voiceCreditEdges += 1
			if (positionId === 102) isSupportedVoice = true
		}
		if (!isSupportedVoice) return
		usedCharacterIds.add(characterId)
		if (addVoiceRole(voiceRoleIndex, personId, subjectId, {
			characterId,
			roleType: rawRole.roleType,
			sortOrder: rawRole.sortOrder,
		})) voiceRoleRecords += 1
	})

	const peopleById = new Map()
	console.error(`[7/8] Reading ${displayPath(jsonlinePath('person.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('person.jsonlines'), (item) => {
		const personId = Number(item.id)
		if (creditIndex.has(personId)) peopleById.set(personId, personFromDump(item))
	})

	const charactersById = new Map()
	console.error(`[8/8] Reading ${displayPath(jsonlinePath('character.jsonlines'))}`)
	await forEachJsonLine(jsonlinePath('character.jsonlines'), (item) => {
		const characterId = Number(item.id)
		if (usedCharacterIds.has(characterId)) charactersById.set(characterId, characterFromDump(item))
	})

	const sortedSubjects = [...subjectsById.values()].sort((left, right) => left.id - right.id)
	const materializedPeople = new Map()
	let supportedCreditCount = 0
	for (const [personId, creditPositions] of [...creditIndex].sort(([left], [right]) => left - right)) {
		const basePerson = peopleById.get(personId) || fallbackPerson(personId)
		const positions = {}
		for (const { id: positionId } of SUPPORTED_POSITIONS) {
			const subjectIds = [...(creditPositions.get(positionId) || [])].sort((left, right) => left - right)
			if (!subjectIds.length) continue
			supportedCreditCount += subjectIds.length
			const position = { subjectIds }
			if (positionId === 102) {
				const rolesBySubject = materializeRoles(personId, voiceRoleIndex, charactersById)
				if (Object.keys(rolesBySubject).length) position.rolesBySubject = rolesBySubject
			}
			positions[String(positionId)] = position
		}
		if (Object.keys(positions).length) materializedPeople.set(personId, { ...basePerson, positions })
	}

	const positionPeople = [...materializedPeople.values()].sort((left, right) => left.id - right.id)
	const voicePeople = positionPeople
		.filter((person) => person.positions['102']?.subjectIds.length)
		.map((person) => {
			const subjectIds = person.positions['102'].subjectIds
			const subjectRows = subjectIds.map((subjectId) => subjectsById.get(subjectId)).filter(Boolean)
			const rolesBySubject = person.positions['102'].rolesBySubject || {}
			return {
				id: person.id,
				rank: 0,
				name: person.name,
				nameCN: person.nameCN,
				displayName: person.displayName,
				aliases: person.aliases,
				career: person.career,
				image: person.image,
				position: { id: 102, label: '声优' },
				subjectIds,
				subjectCount: subjectIds.length,
				ratedSubjectCount: subjectRows.filter((subject) => Number(subject.collection?.rate) > 0).length,
				userAverage: averagePositive(subjectRows.map((subject) => subject.collection?.rate)),
				globalAverage: averagePositive(subjectRows.map((subject) => subject.score)),
				rolesBySubject,
			}
		})
		.sort((left, right) => right.subjectCount - left.subjectCount
			|| right.userAverage - left.userAverage
			|| left.id - right.id)
		.map((person, index) => ({ ...person, rank: index + 1 }))

	const matchedByCollectionType = Object.fromEntries(
		[...new Set(sortedSubjects.map((subject) => Number(subject.collection?.type)))]
			.sort((left, right) => left - right)
			.map((collectionType) => [
				String(collectionType),
				sortedSubjects.filter((subject) => Number(subject.collection?.type) === collectionType).length,
			]),
	)
	const ratedIntersection = sortedSubjects.filter((subject) => Number(subject.collection?.rate) > 0).length
	const usableRatingPairs = sortedSubjects.filter((subject) =>
		Number(subject.collection?.rate) > 0 && Number(subject.score) > 0).length
	const sourceMeta = sourceSnapshot.meta || {}
	const sourceCounts = sourceMeta.counts || {}
	const sourceSelection = sourceMeta.selection || {}
	const dumpReleaseAt = deriveDumpReleaseAt(jsonlinesDir)
	const generatedAt = deterministicGeneratedAt(sourceMeta, dumpReleaseAt)
	const voicePeopleById = new Map(voicePeople.map((person) => [person.id, {
		...materializedPeople.get(person.id),
	}]))
	const defaultPairIds = Array.isArray(sourceSelection.defaultPairIds)
		? sourceSelection.defaultPairIds.map(Number)
		: [4697, 4765]
	const tripleSampleIds = Array.isArray(sourceSelection.tripleSampleIds)
		? sourceSelection.tripleSampleIds.map(Number)
		: [4697, 4765, 3965]

	const meta = {
		...sourceMeta,
		schemaVersion: 3,
		generatedAt,
		source: 'local-jsonlines+collections-snapshot',
		collectionTotals: {
			...(sourceMeta.collectionTotals || {}),
			matched: sortedSubjects.length,
			rated: ratedIntersection,
			unrated: sortedSubjects.length - ratedIntersection,
			matchedByType: matchedByCollectionType,
		},
		sources: {
			...(sourceMeta.sources || {}),
			jsonlines: basename(jsonlinesDir),
			collectionsSnapshot: displayPath(collectionsSnapshotPath),
			generator: 'frontend/scripts/generate-workbench-data.mjs',
			rating: 'subject.jsonlines.score',
			ratingCount: 'sum(subject.jsonlines.score_details)',
			series: 'subject-relations.jsonlines same-series relations, same subject type only',
			skippedInvalidRows: {
				...((sourceMeta.sources || {}).skippedInvalidRows || {}),
				'subject-persons.jsonlines': invalidSubjectPersonRows,
			},
		},
		provenance: {
			generator: 'frontend/scripts/generate-workbench-data.mjs',
			collectionSnapshotGeneratedAt: sourceMeta.generatedAt || null,
			jsonlinesDataset: basename(jsonlinesDir),
			jsonlinesReleaseAt: dumpReleaseAt || null,
			generatedAtSource: process.env.SOURCE_DATE_EPOCH
				? 'SOURCE_DATE_EPOCH'
				: sourceMeta.generatedAt ? 'collections snapshot' : dumpReleaseAt ? 'dump directory name' : 'fixed epoch',
		},
		counts: {
			...sourceCounts,
			localIntersection: sortedSubjects.length,
			ratedIntersection,
			unratedIntersection: sortedSubjects.length - ratedIntersection,
			usableRatingPairs,
			candidateUniverse: voicePeople.length,
			selectedPeople: voicePeople.length,
			supportedPeople: positionPeople.length,
			supportedCredits: supportedCreditCount,
			subjects: sortedSubjects.length,
			series: new Set(sortedSubjects.map((subject) => subject.seriesId)).size,
			seriesMembers: seriesMembers.length,
			characters: usedCharacterIds.size,
			casts: voiceRoleRecords,
			validCvPeople: validCvPersonIds.size,
			directCreditEdges,
			voiceCreditEdges,
			sameSeriesEdges,
			unmappedPositionRows,
			unmappedVoicePositionRows,
			supportedPositionPeople: Object.fromEntries(SUPPORTED_POSITIONS.map(({ id }) => [
				String(id),
				positionPeople.filter((person) => person.positions[String(id)]?.subjectIds.length).length,
			])),
		},
		selection: {
			...sourceSelection,
			topCount: voicePeople.length,
			topIncludedCount: voicePeople.length,
			selectedIds: voicePeople.map((person) => person.id),
			defaultPairIds,
			defaultPairCommonSubjectIds: commonSubjectIds(voicePeopleById, defaultPairIds),
			tripleSampleIds,
			tripleSampleCommonSubjectIds: commonSubjectIds(voicePeopleById, tripleSampleIds),
		},
		semantics: {
			...(sourceMeta.semantics || {}),
			intersection: 'Only collection rows present in the source snapshot and in the local subject.jsonlines dump are included.',
			position102: 'Credits mapped to position 102 from subject-persons plus subject-characters/person-characters; person-character rows require the loader-compatible global valid_cv person rule.',
			ratingCount: 'Sum of the 1 through 10 buckets in subject.jsonlines score_details.',
			seriesId: 'Canonical minimum subject id in the same-type connected component induced by the backend same-series relation types; isolated subjects use their own id.',
			sequelOrder: 'Backend-compatible relation weighting and date ordering from update_database.py::load_sequels, with subject id as the deterministic final tie-breaker.',
			seriesMembers: 'Complete dump-known members for every series intersecting the collection snapshot; display metadata only and not part of the collection query scope.',
			subjectCount: 'Includes collected subjects whose personal rate is 0.',
			userAverage: 'Arithmetic mean of collection.rate values greater than 0, floored to two decimals.',
			ranking: 'subjectCount descending, userAverage descending, person id ascending for deterministic ties.',
		},
		preference: {
			priorSeriesCount: PRIOR_SERIES_COUNT,
		},
	}

	const snapshot = {
		meta,
		people: voicePeople,
		subjects: sortedSubjects,
		seriesMembers,
	}
	const positionData = {
		positions: SUPPORTED_POSITIONS,
		people: positionPeople,
	}

	const snapshotOutputPath = resolve(outputDir, 'co-star-snapshot.json')
	const positionOutputPath = resolve(outputDir, 'position-data.json')
	await stageAtomicJsonWrites([
		{ path: snapshotOutputPath, value: snapshot },
		{ path: positionOutputPath, value: positionData },
	])

	console.log(JSON.stringify({
		collectionsSnapshot: displayPath(collectionsSnapshotPath),
		jsonlinesDir: displayPath(jsonlinesDir),
		outputs: [displayPath(snapshotOutputPath), displayPath(positionOutputPath)],
		subjects: sortedSubjects.length,
		seriesMembers: seriesMembers.length,
		usableRatingPairs,
		voicePeople: voicePeople.length,
		supportedPeople: positionPeople.length,
		supportedCredits: supportedCreditCount,
	}, null, 2))
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		process.stdout.write(helpText)
		return
	}
	if (!options.jsonlinesDir) {
		throw new Error('--jsonlines-dir is required unless BANGUMI_JSONLINES_DIR is set')
	}
	await generate(options)
}

main().catch((error) => {
	console.error(`generate-workbench-data: ${error.message}`)
	process.exitCode = 1
})
