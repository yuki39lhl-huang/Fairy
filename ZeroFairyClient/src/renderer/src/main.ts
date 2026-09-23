// src/renderer/src/main.ts
// 职责：渲染进程入口，初始化 Vue + Pinia + VueRouter
// 类比：Java SpringBoot 的 Application.java

import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from "pinia";
import App from './App.vue'
import router from './router/index'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')