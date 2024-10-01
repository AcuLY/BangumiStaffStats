<template>
  <n-config-provider :theme-overrides="pinkTheme">
    <n-notification-provider>
      <n-layout >
        <n-layout-header class="header">
          <n-flex justify="space-between">
            <n-flex>
              <img src="/bssIcon.png" id="bss-icon">
              <div>Bangumi Staff Statistics</div>
            </n-flex>
            <n-flex justify="end">
              <a 
              href="https://github.com/AcuLY/BangumiStaffStats" 
              target="_blank" 
              class="header-items"
              >
                <img src="/github.png" alt="Github">
              </a>
              <!-- <a 
              href="https://bgm.tv/user/lucay126" 
              target="_blank" 
              class="header-items"
              >
                <img src="/bangumi.png" alt="Bangumi">
              </a> -->
            </n-flex>
          </n-flex>
        </n-layout-header>

        <n-layout-content style="padding: 20px 0 20px 0;">
          <n-flex vertical>
            <Input />
            <Rank />
          </n-flex>
        </n-layout-content>

      </n-layout>
    </n-notification-provider>

  </n-config-provider>
</template>

<script setup>
import Input from './components/Input.vue';
import Rank from './components/Rank.vue';

const pinkTheme = {
  common: {
    primaryColor: '#ff2075',
    primaryColorHover: '#FF69B4', 
    primaryColorPressed: '#C71585',  
    borderRadius: '8px', 
  }
};
</script>

<style scoped>

.header {
  padding: 15px 20px 15px 20px;
  background-color: #1e1717;
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

.header-items {
  color: white;
  text-decoration: none;
}

.header-items img {
  width: 40px;
  margin: -10px 0 -10px 0;
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
  .header-items img {
    width: 30px;
  }
}

</style>