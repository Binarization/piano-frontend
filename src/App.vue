<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TopBar from './components/TopBar.vue'
import LoadingScreen from './components/LoadingScreen.vue'
import StartOverlay from './components/StartOverlay.vue'
import { useAudioStore } from './stores/audio'
import { startLogging, stopLogging } from './services/logger'

const { t } = useI18n()
const audioStore = useAudioStore()

onMounted(async () => {
  // Check if developer mode is enabled
  const isDevMode = localStorage.getItem('dev_mode') === 'true'
  
  if (isDevMode) {
    // Start console logging BEFORE audio initialization
    // This ensures we capture all WASM and audio initialization logs
    startLogging()
  }
  
  // Now initialize audio engine
  await audioStore.initialize()
})

onUnmounted(() => {
  // Clean up logging when app unmounts
  stopLogging()
})

</script>

<template>
  <div class="app-container">
    <div class="orientation-hint">
        <p>{{ t('app.rotateHint') }}</p>
    </div>
    
    <LoadingScreen v-if="!audioStore.isInitialized" />
    <template v-else>
      <StartOverlay />
      <TopBar v-if="$route.path !== '/settings'" />
      <RouterView />
    </template>
  </div>
</template>

<style lang="less">
html, body, #app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--color-background, #1a1a1a);
  color: var(--color-text, #ffffff);
  font-family: 'Inter', sans-serif;
  user-select: none;
  -webkit-user-select: none;
}

.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Orientation Hint */
.orientation-hint {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    z-index: 9999;
    padding: 20px;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: white;
    font-size: 1.2rem;
}

@media screen and (orientation: portrait) {
  .orientation-hint {
    display: flex;
  }
}
</style>
