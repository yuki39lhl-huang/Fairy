// src/renderer/src/stores/voiceCallStore.ts
// 职责：记录"Fairy是否正在播放语音"，供VoiceCall.vue判断什么时候该重新开始听
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVoiceCallStore = defineStore('voiceCall', () => {
  const isSpeaking = ref(false)
  const currentEmotion = ref('normal')
  const emotionTrigger = ref(0)   // 每次setEmotion都+1，哪怕情绪值没变，也能让watch重新触发

  function setSpeaking(value: boolean): void {
    isSpeaking.value = value
  }

  function setEmotion(value: string): void {
    currentEmotion.value = value
    emotionTrigger.value++
  }

  return { isSpeaking, setSpeaking, currentEmotion, setEmotion, emotionTrigger }
})