import { createPinia } from 'pinia';
import { createApp } from 'vue';

import '../shared/styles/base.css';
import App from './App.vue';

const APPLICATION_TITLE = 'Bangumi Staff Statistics';

document.title = APPLICATION_TITLE;

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
