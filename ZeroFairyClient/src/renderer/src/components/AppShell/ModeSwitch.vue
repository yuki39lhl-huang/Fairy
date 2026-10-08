<script setup lang="ts">
const mode = defineModel<'chat' | 'code'>({ required: true })
</script>

<template>
  <div class="mode-switch" role="tablist" aria-label="工作模式">
    <button
      type="button"
      role="tab"
      title="Chat"
      aria-label="Chat"
      :aria-selected="mode === 'chat'"
      :class="{ on: mode === 'chat' }"
      @click="mode = 'chat'"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6.5 16.5 4.5 19.5V7.2A2.2 2.2 0 0 1 6.7 5h10.6a2.2 2.2 0 0 1 2.2 2.2v7.1a2.2 2.2 0 0 1-2.2 2.2H6.5z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
      <span class="mode-tip">Chat</span>
    </button>
    <button
      type="button"
      role="tab"
      title="Code"
      aria-label="Code"
      :aria-selected="mode === 'code'"
      :class="{ on: mode === 'code' }"
      @click="mode = 'code'"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 8 5.5 12 9 16M15 8l3.5 4L15 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="mode-tip">Code</span>
    </button>
  </div>
</template>

<style scoped>
.mode-switch {
  display: flex;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  -webkit-app-region: no-drag;
}

.mode-switch button {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text-dim);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.ico {
  width: 15px;
  height: 15px;
}

.mode-switch button.on {
  background: rgba(255, 255, 255, 0.14);
  color: var(--agent-text);
}

.mode-tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 6px;
  background: #2c2c30;
  color: #f4f4f5;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.mode-switch button:hover .mode-tip,
.mode-switch button:focus-visible .mode-tip {
  opacity: 1;
}
</style>
