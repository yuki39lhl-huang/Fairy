// src/renderer/src/router/index.ts
// 职责：页面路由配置
// 类比：Java SpringBoot 里的 @RequestMapping 路由表

import { createRouter, createWebHashHistory } from 'vue-router'
import IndexChat from '../views/IndexChat.vue'
import Config from '../views/Config.vue'
import MemoryView from '../views/MemoryView.vue'
import WorldBook from '../views/WorldBook.vue'
import ToolPlugin from '../views/ToolPlugin.vue'
import VoiceCall from '../views/VoiceCall.vue'

// 用 Hash 模式（URL带#号），适合Electron本地文件环境
// 类比：HashRouter vs BrowserRouter，Electron里必须用Hash模式
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: '/chat'},
        { path: '/chat', component: IndexChat},
        { path: '/config', component: Config},
        { path: '/memory', component: MemoryView},
        { path: '/worldbook', component: WorldBook},
        { path: '/toolplugin', component: ToolPlugin},
        { path: '/voice-call', component: VoiceCall},
    ]
})

export default router