<template>
  <div class="page">
    <div class="empty">
      <h1 class="title">世界书</h1>
      <p class="sub">RAG 知识库管理即将在此呈现。</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--agent-bg);
  color: var(--agent-text);
}
.empty {
  text-align: center;
  max-width: 360px;
  padding: 24px;
}
.title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}
.sub {
  margin: 0;
  font-size: 13px;
  color: var(--agent-text-dim);
  line-height: 1.55;
}
</style>
