// src/renderer/src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import AppShell from '../components/AppShell/AppShell.vue'
import IndexChat from '../views/IndexChat.vue'
import Config from '../views/Config.vue'
import MemoryView from '../views/MemoryView.vue'
import WorldBook from '../views/WorldBook.vue'
import ToolPlugin from '../views/ToolPlugin.vue'
import ScheduleTasks from '../views/ScheduleTasks.vue'
import VoiceCall from '../views/VoiceCall.vue'
import FairyFloat from '../views/FairyFloat.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/chat' },
        { path: 'chat', component: IndexChat },
        { path: 'config', component: Config },
        { path: 'memory', component: MemoryView },
        { path: 'worldbook', component: WorldBook },
        { path: 'toolplugin', component: ToolPlugin },
        { path: 'schedule', component: ScheduleTasks }
      ]
    },
    // Fullscreen voice-call window stays outside the agent shell.
    { path: '/voice-call', component: VoiceCall },
    // Desktop toast float (top-right capsule).
    { path: '/fairy-float', component: FairyFloat }
  ]
})

export default router
