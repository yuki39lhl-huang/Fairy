import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],

    // ================== 新增以下配置 ==================
    server: {
      fs: {
        strict: false // 允许服务加载项目根目录以外的资源
      }
    },
    // 显式告诉 Vite 将这些后缀的文件作为静态资源处理，防止它们被错误解析或拦截
    assetsInclude: [
      '**/*.model3.json',
      '**/*.motion3.json',
      '**/*.physics3.json',
      '**/*.cdi3.json'
    ]
    // =================================================
  }
})