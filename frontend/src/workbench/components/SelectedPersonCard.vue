<script setup lang="ts">
import type { Person } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'

const props = defineProps<{
	person: Person
	positionIds: number[]
	subjectCount: number
	average: string
	index: number
}>()
const workbench = useWorkbench()
</script>

<template>
	<article
		class="selected-person-card"
		:data-selected-person-id="props.person.id"
		:aria-labelledby="`selected-person-${props.person.id}-name`"
	>
		<div class="selected-person-card__media">
			<SafeImage
				class="selected-person-card__image"
				:sources="workbench.personImageSources(props.person)"
				:alt="workbench.personName(props.person)"
				kind="person"
				decorative
				:loading="props.index < 2 ? 'eager' : 'lazy'"
				:priority="props.index < 2"
				:width="84"
			/>
		</div>

		<div class="selected-person-card__body">
			<header class="selected-person-card__header">
				<span class="selected-person-card__ordinal" aria-hidden="true">
					{{ String(props.index + 1).padStart(2, '0') }}
				</span>
				<span class="selected-person-card__signature-rule" aria-hidden="true"></span>
				<div class="selected-person-card__signature">
					<h3
						:id="`selected-person-${props.person.id}-name`"
						class="selected-person-card__name"
						:title="workbench.personName(props.person)"
					>
						{{ workbench.personName(props.person) }}
					</h3>

					<p class="selected-person-card__identities" :aria-label="`${workbench.personName(props.person)}的已选身份`">
						<template v-for="(positionId, identityIndex) in props.positionIds" :key="positionId">
							<span>{{ workbench.positionLabel(positionId) }}</span>
							<span v-if="identityIndex < props.positionIds.length - 1" class="selected-person-card__identity-separator" aria-hidden="true">·</span>
						</template>
					</p>
				</div>
			</header>

			<dl class="selected-person-card__metrics metric-grid">
				<div class="metric-unit">
					<dd class="metric-unit__value">{{ props.subjectCount }}</dd>
					<dt class="metric-unit__label">{{ workbench.query.mergeSeries ? '参与系列' : workbench.query.isGlobal ? '参与作品' : '收藏作品' }}</dt>
				</div>
				<div class="metric-unit">
					<dd class="metric-unit__value">{{ props.average }}</dd>
					<dt class="metric-unit__label">均分</dt>
				</div>
			</dl>
		</div>
	</article>
</template>
