<script setup lang="ts">
import { NSkeleton } from 'naive-ui';
</script>

<template>
  <div
    class="person-detail-skeleton person-inspector__identity-pending"
    aria-busy="true"
    aria-live="polite"
  >
    <span class="sr-only">正在加载人物详情</span>
    <div class="person-profile-skeleton" aria-hidden="true">
      <i>
        <n-skeleton
          class="app-skeleton person-detail-skeleton__fill"
          height="100%"
          width="100%"
        />
      </i>
      <span>
        <b v-for="index in 3" :key="index">
          <n-skeleton
            class="app-skeleton person-detail-skeleton__fill"
            height="100%"
            width="100%"
          />
        </b>
      </span>
    </div>
    <div class="person-metrics-skeleton" aria-hidden="true">
      <i v-for="index in 4" :key="index">
        <n-skeleton
          class="app-skeleton person-detail-skeleton__fill"
          height="100%"
          width="100%"
        />
      </i>
    </div>
    <div class="person-section-skeleton" aria-hidden="true">
      <i v-for="index in 5" :key="index">
        <n-skeleton
          class="app-skeleton person-detail-skeleton__fill"
          height="100%"
          width="100%"
        />
      </i>
    </div>
  </div>
</template>

<style scoped>
.person-detail-skeleton {
  container: person-detail-skeleton / inline-size;
  min-height: 520px;
  overflow: hidden;
}

.person-profile-skeleton {
  display: grid;
  min-width: 0;
  grid-template-columns: 160px minmax(0, 1fr);
  align-content: start;
  align-items: start;
  border-bottom: 1px solid var(--divider);
}

.person-profile-skeleton > i {
  width: 160px;
  height: 213px;
  align-self: start;
  border-radius: var(--radius-card) 0 0 0;
}

.person-profile-skeleton > span {
  display: grid;
  min-width: 0;
  padding: 20px 24px 8px;
  align-content: start;
  align-items: start;
  gap: 10px;
}

.person-profile-skeleton b {
  height: 18px;
}

.person-profile-skeleton b:first-child {
  width: 65%;
  height: 28px;
}

.person-metrics-skeleton {
  display: grid;
  margin-block: 20px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.person-metrics-skeleton i {
  height: 58px;
}

.person-section-skeleton {
  display: grid;
  gap: var(--space-2);
  padding-block: var(--space-3);
}

.person-section-skeleton i {
  height: 54px;
}

.person-profile-skeleton b,
.person-metrics-skeleton i,
.person-section-skeleton i {
  display: block;
  border-radius: var(--radius-control);
  overflow: hidden;
}

.person-detail-skeleton__fill {
  display: block;
}

@container person-detail-skeleton (max-width: 480px) {
  .person-profile-skeleton {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .person-profile-skeleton > i {
    width: 96px;
    height: 128px;
    border-radius: 0;
  }

  .person-profile-skeleton > span {
    padding: 14px;
  }

  .person-metrics-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width < 780px) {
  :global(.person-detail-drawer .person-profile-skeleton > i) {
    border-radius: 0;
  }
}

@media (max-width: 520px) {
  :global(.person-detail-drawer .person-profile-skeleton) {
    padding: var(--space-4);
    grid-template-columns: 96px minmax(0, 1fr);
    column-gap: var(--space-4);
  }

  :global(.person-detail-drawer .person-profile-skeleton > i) {
    width: 96px;
    height: 128px;
    border-radius: 0;
  }

  :global(.person-detail-drawer .person-profile-skeleton > span) {
    padding: var(--space-1) 0;
  }

  :global(.person-detail-drawer .person-metrics-skeleton) {
    width: calc(100% - (2 * var(--space-4)));
    margin: 0 auto var(--space-3);
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  :global(.person-detail-drawer .person-metrics-skeleton i) {
    height: 64px;
  }
}

</style>
