<script setup lang="ts">
import PianoGrid from '../components/PianoGrid.vue'
</script>

<template>
  <main class="piano-view">
    <PianoGrid />
  </main>
</template>

<style scoped lang="less">
.piano-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
