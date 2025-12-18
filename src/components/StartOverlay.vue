<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAudioStore } from '../stores/audio'
import { devError } from '@/services/logger'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
    (e: 'started'): void
}>()

const { t } = useI18n()
const audioStore = useAudioStore()
const isVisible = ref(true)
const isFading = ref(false)

async function startAudio() {
    if (isFading.value) return

    try {
      // Attempt to resume/unlock audio
      await audioStore.resumeContext()
      
      // Fade out animation
      isFading.value = true
      setTimeout(() => {
        isVisible.value = false
        emit('started')
      }, 500)
    } catch (e) {
      devError('Failed to resume audio context:', e)
    }
}

onMounted(async () => {
    try {
        const autoResumed = await audioStore.resumeContext()
        if (autoResumed) {
            // If auto-resume worked immediately, skip overlay
            isVisible.value = false
            emit('started')
        }
    } catch (e) {
        // Expected if no interaction
    }
})
</script>

<template>
    <div v-if="isVisible" class="start-overlay" :class="{ 'fading-out': isFading }" @click="startAudio">
        <div class="content">
            <div class="icon">🎹</div>
            <h1>{{ t('overlay.clickToStart') }}</h1>
            <p>{{ t('overlay.tapToEnable') }}</p>
        </div>
    </div>
</template>

<style scoped lang="less">
.start-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: opacity 0.5s ease;
    user-select: none;
    
    &.fading-out {
        opacity: 0;
        pointer-events: none;
    }

    .content {
        text-align: center;
        color: white;
        animation: pulse 2s infinite ease-in-out;
        
        .icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 2rem;
            margin: 0 0 10px;
            font-weight: 300;
            letter-spacing: 2px;
        }

        p {
            opacity: 0.7;
            margin: 0;
        }
    }
}

@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
}
</style>
