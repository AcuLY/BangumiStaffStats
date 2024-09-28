<template>
  <n-config-provider>
    <n-notification-provider>
      <h1>Welcome</h1>
      <Input />
      <Rank />
      <h1>GoodBye</h1>
    </n-notification-provider>

  </n-config-provider>
</template>

<script setup>
import Input from './components/Input.vue';
import Rank from './components/Rank.vue';
</script>

<style scoped></style>