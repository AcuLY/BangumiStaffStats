<!--
THESIS: 先证明正式应用边界可信且唯一，拒绝把空基础伪装成仪表盘成品。
OWN-WORLD: 继承 Bangumi 粉色识别、冷灰页面、单层 8px 表面与紧凑无衬线层级。
STORY: 用户看见正式前端已安全就绪，并明确人物排行与共演能力仍在后续接入。
FIRST VIEWPORT: 轻量文本标题栏、居中的语义就绪说明、版本边界和克制页脚。
FORM: 既有 Operate 世界中的窄范围基础壳；不运行概念 seed，也不建立新视觉身份。
-->
<script setup lang="ts">
import { NTag } from 'naive-ui';
import { computed, onMounted } from 'vue';

import AppProviders from './AppProviders.vue';
import { useRuntimeStore } from './store/runtime';

const runtime = useRuntimeStore();
const isReady = computed(() => runtime.phase === 'ready');

onMounted(() => {
  runtime.markReady();
});
</script>

<template>
  <app-providers>
    <div
      class="app-shell"
      data-app-root
      :data-app-ready="isReady ? 'true' : 'false'"
      :data-runtime-phase="runtime.phase"
    >
      <header class="app-header">
        <div class="app-content-line app-header__content">
          <span class="app-brand-name">Bangumi Staff Statistics</span>
        </div>
      </header>

      <main id="main-content" class="app-main">
        <section class="foundation-surface" aria-labelledby="foundation-title">
          <n-tag size="small" round>正式前端基础</n-tag>
          <h1 id="foundation-title">应用基础已就绪</h1>
          <p>
            单一应用入口、共享契约边界和质量检查已经建立。人物排行与共演分析将在后续功能阶段接入。
          </p>
          <dl class="foundation-facts" aria-label="当前基础边界">
            <div>
              <dt>应用状态</dt>
              <dd>{{ isReady ? '可用' : '启动中' }}</dd>
            </div>
            <div>
              <dt>数据请求</dt>
              <dd>尚未发起</dd>
            </div>
            <div>
              <dt>功能阶段</dt>
              <dd>基础设施</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer class="app-footer">
        <div class="app-content-line">
          正式功能将按共享 OpenAPI 与 JSON Schema 契约逐步接入
        </div>
      </footer>
    </div>
  </app-providers>
</template>
