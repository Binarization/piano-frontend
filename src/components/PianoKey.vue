<script setup lang="ts">
import { ref } from 'vue'
import { useAudioStore } from '../stores/audio'

const props = defineProps<{
    id: number
    midiNote: number
    label: string
    dotPosition?: string // 'top' | 'bottom' | 'none'
    isHighlighted?: boolean
}>()

const audioStore = useAudioStore()
const isPressed = ref(false)

function startNote(e: Event) {
    if (e.cancelable) e.preventDefault()
    
    isPressed.value = true
    audioStore.noteOn(props.midiNote)
}

function stopNote(e: Event) {
    if (e && e.cancelable) e.preventDefault()

    if (isPressed.value) {
      isPressed.value = false
      audioStore.noteOff(props.midiNote)
    }
}
</script>

<template>
    <button 
        class="piano-key" 
        :class="{ 'highlight': isHighlighted, 'active-touch': isPressed }"
        @mousedown="startNote" 
        @touchstart="startNote"
        @mouseup="stopNote"
        @touchend="stopNote"
        @mouseleave="stopNote"
        @touchcancel="stopNote"
    >
        <div class="key-inner">
            <!-- SVG Jianpu Notation -->
            <svg viewBox="0 0 100 100" class="jianpu-icon">
                <!-- Dot Above -->
                <circle v-if="dotPosition === 'top'" cx="50" cy="20" r="6" fill="currentColor" />
                
                <!-- Number -->
                <text x="50" y="65" text-anchor="middle" font-size="45" font-weight="bold" fill="currentColor">{{ label }}</text>
                
                <!-- Dot Below -->
                <circle v-if="dotPosition === 'bottom'" cx="50" cy="85" r="6" fill="currentColor" />
            </svg>
        </div>
        
        <!-- Glow Effect Container -->
        <div class="glow-fx"></div>
    </button>
</template>

<style scoped lang="less">
.piano-key {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
    color: rgba(255,255,255,0.9);
    box-shadow: 0 4px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1);
    -webkit-tap-highlight-color: transparent;

    &:active, &.active-touch {
        transform: scale(0.96);
        background: rgba(255, 255, 255, 0.15);
    }

    &.highlight {
        background: rgba(66, 184, 131, 0.3);
        border: 2px solid rgba(66, 184, 131, 0.8);
        
        .jianpu-icon {
            color: #42b883;
        }
    }
}

.key-inner {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2;
}

.jianpu-icon {
    width: 60%;
    height: 60%;
    display: block;
    color: inherit;
    transition: color 0.2s;
}
</style>
