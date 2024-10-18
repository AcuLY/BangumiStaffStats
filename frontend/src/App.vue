<template>
  <n-config-provider :theme="currentTheme" :theme-overrides="currentThemeOverride" :locale="zhCN">
    <n-notification-provider>
      <n-layout style="height: 100vh;">
        <n-layout-header class="header">
          <n-flex justify="space-between">
            <n-flex>
              <img src="/bssIcon.png" id="bss-icon">
              <div>Bangumi Staff Statistics</div>
            </n-flex>
            <n-flex justify="end">
              <n-button text class="mode-icon" @click="switchMode" color="#FFFFFF">
                <n-icon v-show="darkMode">
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5s5-2.24 5-5s-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0a.996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41a.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41a.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" fill="currentColor"></path></svg>
                </n-icon>
                <n-icon v-show="!darkMode">
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26a5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" fill="currentColor"></path></svg>
                </n-icon>
              </n-button>
              <a 
                href="https://github.com/AcuLY/BangumiStaffStats" 
                target="_blank" 
                class="header-items"
              >
                <img src="/github.png" alt="Github">
              </a>
            </n-flex>
          </n-flex>
        </n-layout-header>

        <n-layout-content class="content">
          <n-flex vertical>
            <Input />
            <Rank />
          </n-flex>
        </n-layout-content>
        
        <n-layout-footer style="position: relative; bottom: 0px;">
          <n-flex justify="center" style="padding: 10px; width: 100vw; background-color: #f8f8f8;">
            <a href="https://beian.miit.gov.cn/" target="_blank" style="color: grey;text-decoration: none;" >粤ICP备2024321317号</a>
          </n-flex>
        </n-layout-footer>
      </n-layout>
    </n-notification-provider>

  </n-config-provider>
</template>

<script setup>
import { darkTheme, zhCN } from 'naive-ui';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import Input from './components/Input.vue';
import Rank from './components/Rank.vue';

const pinkTheme = {
  common: {
    primaryColor: '#ff2075',
    primaryColorHover: '#FF69B4', 
    primaryColorPressed: '#C71585',
    primaryColorSuppl: '#ff2075',  
    borderRadius: '8px', 
  }
};

const darkMode = ref(false);
const currentTheme = ref(null);
const currentThemeOverride = ref(pinkTheme);

const switchMode = () => {
  darkMode.value = !darkMode.value;
}

// 检测系统主题并同步切换
const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');

const updateThemeBasedOnSystem = () => {
  darkMode.value = matchMedia.matches;
}

watch(darkMode, (newValue) => {
  if (newValue) {
    currentTheme.value = darkTheme;
    currentThemeOverride.value = pinkTheme;
  } else {
    currentTheme.value = null;
    currentThemeOverride.value = pinkTheme;
  }
});

onMounted(() => {
  updateThemeBasedOnSystem();
  matchMedia.addEventListener('change', updateThemeBasedOnSystem);
});

onBeforeUnmount(() => {
  matchMedia.removeEventListener('change', updateThemeBasedOnSystem);
});
</script>

<style scoped>

.header {
  padding: 15px 20px 15px 20px;
  background-color: #191919;
  border-style: solid none none none;
  border-color: #ff5b9a;
  border-width: 5px;
  font-size: 24px;
  font-weight: bold;
  color: rgb(255, 255, 255);
  user-select: none;
}

#bss-icon {
  width: 40px; 
  height: 40px;
  transform: translateY(-5px);
}

.mode-icon {
  color: white;
  font-size: 40px;
}

.mode-icon:hover {
  color: #ff5b9a;
}

.header-items {
  color: white;
  text-decoration: none;
}

.header-items img {
  width: 40px;
  margin: -10px 0 -10px 0;
  transform: translateY(2px);
}

.content {
  padding: 20px 0 20px 0;
  min-height: calc(100vh - 75px - 42.39px);
}

@media (max-width: 600px) {
  .header {
    padding: 10px 10px 10px 10px;
    font-size: 16px;
  }
  #bss-icon {
    width: 24px; 
    height: 24px;
    transform: translateY(-2px);
  }
  .mode-icon {
    font-size: 30px;
  }
  .header-items img {
    width: 30px;
    transform: translateY(0px);
  }
  .content {
    min-height: calc(100vh - 55px - 42.39px);
  }
}


</style>