<script setup lang="ts">
import { useAudioStore } from '../stores/audio'
import { toRefs } from 'vue'
import { useI18n } from 'vue-i18n'

const store = useAudioStore()
const { t } = useI18n()
const { loadingProgress, initializationError } = toRefs(store)

function retry() {
    store.initialize()
}

function resetAndReload() {
    localStorage.removeItem('buffer_size')
    localStorage.removeItem('force_script_processor')
    location.reload()
}
</script>

<template>
    <div class="loading-screen">
        <div class="content">
            <h1>Piano Web</h1>
            <div v-if="initializationError" class="error">
                <p>{{ t('loading.error') }}</p>
                <p class="error-msg">{{ initializationError }}</p>
                <div class="buttons">
                    <button @click="retry">{{ t('common.retry') }}</button>
                    <button class="warning" @click="resetAndReload">{{ t('loading.resetAndRestart') }}</button>
                </div>
            </div>
            <div v-else class="loading">
                <p>{{ t('loading.initializing') }}</p>
                <div class="progress-bar">
                <div class="progress-fill" :style="{ width: loadingProgress + '%' }"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="less">
.loading-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--color-background, #1a1a1a);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
    color: white;
}

.content {
    text-align: center;
    width: 300px;
}

.progress-bar {
    height: 6px;
    background: #333;
    border-radius: 3px;
    margin-top: 20px;
    width: 100%;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: #42b883;
    transition: width 0.3s ease;
}

.error-msg {
    color: #ff4d4f;
    margin: 10px 0;
}

.hint {
    opacity: 0.5;
    font-size: 12px;
    margin-top: 20px;
}

.buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
    
    button {
        padding: 8px 16px;
        background: #42b883;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        
        &:hover {
            opacity: 0.9;
        }
        
        &.warning {
            background: #ff4d4f;
        }
    }
}
</style>
