import type { PositionData, WorkbenchSnapshot } from '../types'

const fixtureUrl = (fileName: string) => {
	const base = import.meta.env.BASE_URL.endsWith('/')
		? import.meta.env.BASE_URL
		: `${import.meta.env.BASE_URL}/`
	return `${base}workbench-data/${fileName}`
}

async function readFixture<T>(fileName: string): Promise<T> {
	const response = await fetch(fixtureUrl(fileName))
	if (!response.ok) {
		throw new Error(`无法读取本地静态数据：${fileName}（${response.status}）`)
	}
	return response.json() as Promise<T>
}

function assertWorkbenchSnapshot(value: unknown): asserts value is WorkbenchSnapshot {
	const snapshot = value as Partial<WorkbenchSnapshot> | null
	if (!snapshot || !snapshot.meta || !Array.isArray(snapshot.people) || !Array.isArray(snapshot.subjects)) {
		throw new Error('人物快照的数据结构不完整。')
	}
}

function assertPositionData(value: unknown): asserts value is PositionData {
	const positionData = value as Partial<PositionData> | null
	if (!positionData || !Array.isArray(positionData.positions) || !Array.isArray(positionData.people)) {
		throw new Error('职位快照的数据结构不完整。')
	}
}

export async function loadWorkbenchFixtures() {
	const [snapshot, positionData] = await Promise.all([
		readFixture<unknown>('co-star-snapshot.json'),
		readFixture<unknown>('position-data.json'),
	])
	assertWorkbenchSnapshot(snapshot)
	assertPositionData(positionData)

	return { snapshot, positionData }
}
