<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '../stores/audio'
import { devError } from '@/services/logger'
import LogViewer from './LogViewer.vue'
import LoadingModal from './LoadingModal.vue'

const { t, locale } = useI18n()
const audioStore = useAudioStore()

const isLogsOpen = ref(false)
const isHidden = ref(false)
const volume = ref(audioStore.volume * 100)
const fileInput = ref<HTMLInputElement | null>(null)
const isLoadingPreset = ref(false)
const loadingMessage = ref('Loading Preset...')
const showPresetDialog = ref(false)
const publicPresets = ref<string[]>([])
const isLoadingPublicPresets = ref(false)

const currentOctave = computed(() => audioStore.baseOctave)
const isDevMode = computed(() => localStorage.getItem('dev_mode') === 'true')

function toggleSettings() {
    import('../router').then(({ default: router }) => {
        router.push('/settings')
    })
}

function toggleLogs() {
    isLogsOpen.value = !isLogsOpen.value
}

function toggleHide() {
    isHidden.value = !isHidden.value
    
    if (isHidden.value) {
        isIdle.value = false
        setTimeout(() => {
            isIdle.value = true
        }, 50)
    } else {
        isIdle.value = false
    }
}

async function openPresetLoader() {
    showPresetDialog.value = true
    await fetchPublicPresets()
}

async function fetchPublicPresets() {
    isLoadingPublicPresets.value = true
    try {
        const res = await fetch('/presets/presets.json')
        if (res.ok) {
            publicPresets.value = await res.json()
        }
    } catch (e) {
        devError('Failed to fetch public presets', e)
    } finally {
        isLoadingPublicPresets.value = false
    }
}

function selectLocalFile() {
    showPresetDialog.value = false
    // Small delay to ensure modal is closed before file picker opens
    setTimeout(() => {
        fileInput.value?.click()
    }, 100)
}

async function selectPublicPreset(filename: string) {
    showPresetDialog.value = false
    isLoadingPreset.value = true
    loadingMessage.value = t('loading.preset')
    
    try {
        const res = await fetch(`/presets/${filename}`)
        if (!res.ok) throw new Error(`Failed to fetch preset ${filename}`)
        
        const blob = await res.blob()
        const file = new File([blob], filename, { type: 'application/json' }) // Vital presets are JSON/binary, but File constructor works
        
        await audioStore.loadPreset(file)
    } catch (e) {
        devError('Failed to load public preset', e)
        alert(t('loading.presetFailed'))
    } finally {
        isLoadingPreset.value = false
    }
}

function octaveUp() {
    audioStore.shiftOctave(1)
}

function octaveDown() {
    audioStore.shiftOctave(-1)
}

async function onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
        try {
            await audioStore.loadPreset(file)
            if (fileInput.value) fileInput.value.value = ''
        } catch (e) {
            devError('Failed to load preset', e)
            alert(t('loading.presetFailed'))
        } finally {
            // Hide loading modal with fade out animation
            isLoadingPreset.value = false
        }
    } else {
        // User cancelled file selection, hide the modal
        isLoadingPreset.value = false
    }
}

const isFullscreen = ref(false)
const showBtnY = ref(100)
const isShowBtnLeft = ref(true)
const isShowBtnRight = ref(false)
const isIdle = ref(false)
const isDragging = ref(false)
const wasDragging = ref(false)
const isTransitioning = ref(false)
let idleTimer: any = null
let dragDelayTimer: any = null
let dragStartX = 0
let dragStartY = 0
let initialBtnY = 0
let hasMoved = false
let wasIdleWhenPressed = false
let hasCapturedIdleState = false
let lastTouchTime = 0

// Computed property for X position based on left/right state
const showBtnX = computed(() => {
    return isShowBtnLeft.value ? 20 : window.innerWidth - 44 - 20
})

// Update body class based on TopBar visibility
function updateBodyClass() {
    if (isHidden.value) {
        document.body.classList.remove('topbar-visible')
    } else {
        document.body.classList.add('topbar-visible')
    }
}

// Watch isHidden to update body class
watch(isHidden, () => {
    updateBodyClass()
})

// Update volume when slider changes
watch(volume, (val) => {
    audioStore.setVolume(val / 100)
})

// Sync volume when audio initializes
watch(() => audioStore.isInitialized, (ready) => {
    if (ready) {
        // Apply the stored volume to the engine
        audioStore.setVolume(audioStore.volume)
    }
})

// Watch for external volume changes
watch(() => audioStore.volume, (newVol) => {
    if (Math.abs(volume.value - newVol * 100) > 1) {
        volume.value = newVol * 100
    }
})

// Watch locale to update loading message if active
watch(locale, () => {
    if (isLoadingPreset.value) {
        loadingMessage.value = t('loading.preset')
    }
})

onMounted(() => {
    // Check fullscreen state
    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!document.fullscreenElement
        
        // Auto-hide top bar when entering fullscreen
        if (document.fullscreenElement && !isHidden.value) {
            isHidden.value = true
            
            // Immediately set button to idle state after a brief render tick
            isIdle.value = false
            setTimeout(() => {
                isIdle.value = true
            }, 50)
        }
    })
    
    // Load button position
    const savedSide = localStorage.getItem('show_btn_side')
    const savedY = localStorage.getItem('show_btn_y')
    
    if (savedSide === 'right') {
        isShowBtnLeft.value = false
        isShowBtnRight.value = true
    } else {
        isShowBtnLeft.value = true
        isShowBtnRight.value = false
    }
    
    if (savedY) {
        showBtnY.value = Math.min(Math.max(Number(savedY), 50), window.innerHeight - 50)
    }
    
    // Initialize body class based on current state
    updateBodyClass()
    
    resetIdleTimer()
    
    // Proximity detection for mouse (disabled on touch devices)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    
    if (!isTouchDevice) {
        const proximityThreshold = 30 // pixels from button to trigger reveal
        let lastProximityCheck = 0
        const proximityCheckDelay = 100 // Check proximity every 100ms
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isHidden.value || isDragging.value) return
            
            const now = Date.now()
            if (now - lastProximityCheck < proximityCheckDelay) return
            lastProximityCheck = now
            
            // Calculate distance from mouse to button center
            const btnCenterX = showBtnX.value + 22 // 44px button / 2
            const btnCenterY = showBtnY.value + 22
            const distanceX = e.clientX - btnCenterX
            const distanceY = e.clientY - btnCenterY
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY)
            
            if (distance < proximityThreshold) {
                // Mouse is near button, cancel idle state
                if (isIdle.value) {
                    isIdle.value = false
                }
                resetIdleTimer()
            }
        }
        
        // Mouse events - only mousemove for proximity detection
        window.addEventListener('mousemove', handleMouseMove)
        
        // Cleanup on unmount
        onUnmounted(() => {
            window.removeEventListener('mousemove', handleMouseMove)
            clearTimeout(idleTimer)
        })
    } else {
        // Touch device - only cleanup idle timer on unmount
        onUnmounted(() => {
            clearTimeout(idleTimer)
        })
    }
})

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
    } else {
        document.exitFullscreen()
    }
}

function resetIdleTimer() {
    isIdle.value = false
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
        if (!isHidden.value) return // Only idle hide if TopBar is hidden (button is visible)
        isIdle.value = true
    }, 1000)
}

// Drag Logic for Show Button
function startDrag(e: TouchEvent | MouseEvent) {
    if ((e as MouseEvent).button !== 0 && (e as MouseEvent).button !== undefined) return
    
    const isTouchEvent = 'touches' in e
    const now = Date.now()
    
    // Prevent mousedown from firing within 100ms after touchstart
    if (!isTouchEvent && now - lastTouchTime < 100) {
        return
    }
    
    if (isTouchEvent) {
        lastTouchTime = now
    }
    
    // Capture idle state on FIRST press event only
    if (!isDragging.value && !hasCapturedIdleState) {
        wasIdleWhenPressed = isIdle.value
        hasCapturedIdleState = true
        
        // Set timer to enter dragging state after delay
        dragDelayTimer = setTimeout(() => {
            isDragging.value = true
        }, 600)
    }
    
    wasDragging.value = false
    hasMoved = false
    const clientX = 'touches' in e 
        ? (e.touches[0]?.clientX ?? 0)
        : (e as MouseEvent).clientX
    const clientY = 'touches' in e 
        ? (e.touches[0]?.clientY ?? 0)
        : (e as MouseEvent).clientY
    dragStartX = clientX
    dragStartY = clientY
    initialBtnY = showBtnY.value
    
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
    window.addEventListener('touchmove', onDrag)
    window.addEventListener('touchend', stopDrag)
}

function onDrag(e: TouchEvent | MouseEvent) {
    if (!isDragging.value) return
    const clientX = 'touches' in e 
        ? (e.touches[0]?.clientX ?? 0)
        : (e as MouseEvent).clientX
    const clientY = 'touches' in e 
        ? (e.touches[0]?.clientY ?? 0)  // 可选链 + 默认值
        : (e as MouseEvent).clientY
    const deltaX = clientX - dragStartX
    const deltaY = clientY - dragStartY
    
    // Track if actually moved (more than 5px in any direction)
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true
    }
    
    // Determine which side based on current X position
    const screenWidth = window.innerWidth
    if (clientX < screenWidth / 2) {
        isShowBtnLeft.value = true
        isShowBtnRight.value = false
    } else {
        isShowBtnLeft.value = false
        isShowBtnRight.value = true
    }
    
    // Only update Y position
    let newY = initialBtnY + deltaY
    newY = Math.max(20, Math.min(newY, window.innerHeight - 60))
    
    showBtnY.value = newY
}

function stopDrag() {
    // Clear drag delay timer if still pending
    clearTimeout(dragDelayTimer)
    dragDelayTimer = null
    hasCapturedIdleState = false
    isDragging.value = false
    
    // If actually moved, mark as was dragging to prevent click
    if (hasMoved) {
        wasDragging.value = true
        // Reset after a short delay
        setTimeout(() => {
            wasDragging.value = false
        }, 200)
    }
    
    // Save side preference and Y position
    localStorage.setItem('show_btn_side', isShowBtnLeft.value ? 'left' : 'right')
    localStorage.setItem('show_btn_y', String(showBtnY.value))
    resetIdleTimer()
    
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
    window.removeEventListener('touchmove', onDrag)
    window.removeEventListener('touchend', stopDrag)
}

// Handle button click
function onButtonClick() {
    if (isDragging.value || wasDragging.value || isTransitioning.value) return
    
    // Check the idle state that was captured when user first pressed
    if (wasIdleWhenPressed) {
        isIdle.value = false
        isTransitioning.value = true
        wasIdleWhenPressed = false
        
        // Wait for transition animation to complete (500ms for transform)
        setTimeout(() => {
            isTransitioning.value = false
        }, 500)
        
        resetIdleTimer()
    } else {
        // Not idle - toggle UI
        toggleHide()
    }
}

// Computed properties for CSS v-bind to avoid parser errors with quotes
// Computed properties for CSS v-bind to avoid parser errors with quotes
const loadText = computed(() => `'${t('topbar.load')}'`)

// Watch interactions to reset idle (only for mouse, not touch)
function onButtonInteract(e: MouseEvent | TouchEvent) {
    // Ignore touch events - let onButtonClick handle touch interactions
    if ('touches' in e || e instanceof TouchEvent) {
        return
    }
    // Only reset idle timer for mouse events (proximity detection)
    resetIdleTimer()
}
</script>

<template>
  <div>
    <div 
        class="show-ui-btn-wrapper"
        v-if="isHidden"
        :style="{ left: showBtnX + 'px', top: showBtnY + 'px' }"
        :class="{ 'idle': isIdle && !isDragging, 'dragging': isDragging, 'left': isShowBtnLeft, 'right': isShowBtnRight }"
        @mousedown="startDrag"
        @touchstart="startDrag"
        @click="onButtonInteract" 
    >
        <button class="show-ui-btn-inner" @click.stop="onButtonClick">
             <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </button>
    </div>

    <div class="top-bar" :class="{ 'hidden': isHidden }">
        <div class="group left">
            <button class="icon-btn hide-btn" @click="toggleHide" :title="t('topbar.hideUI')">
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                    <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
            </button>
            <button class="icon-btn fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? t('topbar.fullscreen.exit') : t('topbar.fullscreen.enter')">
                <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                     <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
            </button>
            
            <div class="control-group">
                <button class="text-btn" @click="openPresetLoader">
                    <span>{{ t('topbar.loadPreset') }}</span>
                </button>
            </div>
        </div>

        <div class="group center">
            <div class="pitch-control">
                <button @click="octaveDown" :disabled="currentOctave <= 0">-</button>
                <span class="octave-label">{{ t('topbar.octave') }} #{{ currentOctave }}</span>
                <button @click="octaveUp" :disabled="currentOctave >= 8">+</button>
            </div>
        </div>
        
        <div class="group right">
            <div class="volume-slider">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                </svg>
                <input type="range" v-model="volume" min="0" max="100" />
            </div>

            <button v-if="isDevMode" class="icon-btn log-btn" @click="toggleLogs" :title="t('topbar.devLogs')">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
            </button>
            <button class="icon-btn settings-btn" @click="toggleSettings" :title="t('topbar.settings')">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
        </div>
        
        <input type="file" ref="fileInput" accept=".vital" style="display: none" @change="onFileSelected" />
        
        <LogViewer v-if="isLogsOpen" @close="toggleLogs" />
    </div>
    
    <!-- Loading Modal -->
    <LoadingModal :visible="isLoadingPreset" :message="loadingMessage" />

    <!-- Preset Selection Modal -->
    <div v-if="showPresetDialog" class="modal-overlay" @click.self="showPresetDialog = false">
        <div class="modal-content">
            <h3>{{ t('presetDialog.title') }}</h3>
            
            <div class="preset-options">
                <button class="option-btn local" @click="selectLocalFile">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>{{ t('presetDialog.localFile') }}</span>
                </button>

                <div class="divider">
                    <span>{{ t('common.or') || 'OR' }}</span>
                </div>

                <div class="public-presets">
                    <h4>{{ t('presetDialog.soundLibrary') }}</h4>
                    <div v-if="isLoadingPublicPresets" class="loading-spinner">
                        {{ t('common.loading') }}
                    </div>
                    <div v-else-if="publicPresets.length === 0" class="empty-list">
                        No presets found
                    </div>
                    <div v-else class="preset-list">
                        <button 
                            v-for="preset in publicPresets" 
                            :key="preset"
                            class="preset-item"
                            @click="selectPublicPreset(preset)"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                                <path d="M9 18V5l12-2v13"></path>
                                <circle cx="6" cy="18" r="3"></circle>
                                <circle cx="18" cy="16" r="3"></circle>
                            </svg>
                            {{ preset.replace('.vital', '') }}
                        </button>
                    </div>
                </div>
            </div>

            <button class="close-btn" @click="showPresetDialog = false">
                {{ t('presetDialog.cancel') }}
            </button>
        </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.show-ui-btn-wrapper {
    position: fixed;
    z-index: 90;
    transform: translateX(0) rotate(0deg);
    transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
    
    /* Idle State: Hide 50% */
    &.idle {
        opacity: 0.5;

        &.left {
            transform: translateX(-100%) rotate(-90deg);
        }

        &.right {
            transform: translateX(100%) rotate(90deg);
        }
        
        // Only enable hover on devices with hover capability (non-touch)
        @media (hover: hover) {
            &:hover {
                transform: translateX(0) rotate(0deg); /* Quick peek on hover */
                opacity: 1;
            }
        }
    }
    
    &.dragging {
        /* Only disable transform transition while dragging, keep opacity transition */
        transition: opacity 0.3s ease;
        transform: scale(1.1);
        cursor: grabbing;
    }
}

.show-ui-btn-inner {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(50, 50, 50, 0.9);
    /* backdrop-filter: blur(10px); */
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: grab;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all 0.3s;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    -webkit-tap-highlight-color: transparent;
    
    &:active {
        cursor: grabbing;
        background: rgba(255, 255, 255, 0.3);
        transform: scale(0.95);
    }
    
    @media (hover: hover) {
        &:hover {
            background: rgba(255, 255, 255, 0.25);
            transform: scale(1.05);
        }
    }
}

.fullscreen-btn {
    margin-right: 10px;
}

.top-bar {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 80px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 30px;
    background: rgba(20, 20, 20, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 100;
    box-sizing: border-box;
    
    &.hidden {
        transform: translateY(-100%);
    }
}

.group {
    display: flex;
    align-items: center;
    gap: 20px;
    flex: 1;
}

.group.left { justify-content: flex-start; }
.group.center { justify-content: center; }
.group.right { justify-content: flex-end; }

.control-group {
    display: flex;
    gap: 10px;
    background: rgba(0,0,0,0.3);
    padding: 5px;
    border-radius: 12px;
}

.text-btn {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.7);
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
    
    &:active {
        background: rgba(255,255,255,0.15);
        color: white;
        transform: scale(0.95);
    }
    
    @media (hover: hover) {
        &:hover {
            background: rgba(255,255,255,0.1);
            color: white;
        }
    }
}

.pitch-control {
    display: flex;
    align-items: center;
    background: rgba(0,0,0,0.3);
    border-radius: 12px;
    padding: 5px;
    
    button {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.1);
        color: white;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.2rem;
        transition: all 0.2s;
        -webkit-tap-highlight-color: transparent;
        
        &:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        
        &:not(:disabled):active {
            background: rgba(255,255,255,0.25);
            transform: scale(0.9);
        }
        
        @media (hover: hover) {
            &:not(:disabled):hover {
                background: rgba(255,255,255,0.2);
            }
        }
    }
    
    .octave-label {
        color: white;
        margin: 0 15px;
        font-family: monospace;
        font-weight: bold;
        letter-spacing: 1px;
        min-width: 50px;
        text-align: center;
    }
}

.volume-slider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(255,255,255,0.6);
    background: rgba(0,0,0,0.3);
    padding: 8px 15px;
    border-radius: 20px;
    
    input[type="range"] {
        width: 100px;
        height: 4px;
        background: rgba(255,255,255,0.2);
        border-radius: 2px;
        outline: none;
        appearance: none;
        -webkit-appearance: none;
        
        &::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            transition: transform 0.2s;
            
            &:hover {
                transform: scale(1.2);
            }
        }
    }
}

.icon-btn {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.8);
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: all 0.2s;
    display: flex;
    -webkit-tap-highlight-color: transparent;
    
    &:active {
        background: rgba(255,255,255,0.15);
        color: white;
        transform: scale(0.9);
    }
    
    @media (hover: hover) {
        &:hover {
            background: rgba(255,255,255,0.1);
            color: white;
        }
    }
}

@media (max-width: 768px) {
    .top-bar {
        padding: 0 15px;
        height: 70px;
    }
    
    .text-btn span {
        display: none;
    }
    
    .text-btn::after {
        content: v-bind(loadText);
        font-size: 0.8rem;
    }
    
    .pitch-control .octave-label {
        margin: 0 5px;
        min-width: 40px;
    }
    
    .volume-slider {
        display: none;
    }
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    z-index: 200;
    display: flex;
    justify-content: center;
    align-items: center;
    animation: fadeIn 0.2s ease;
}

.modal-content {
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    width: 90%;
    max-width: 400px;
    color: white;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-content h3 {
    margin: 0 0 20px 0;
    text-align: center;
    font-size: 1.2rem;
    font-weight: 500;
}

.preset-options {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.option-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px;
    border-radius: 12px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 1rem;
    transition: all 0.2s;
    
    &:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-2px);
    }
    
    &:active {
        transform: scale(0.98);
    }
}

.divider {
    text-align: center;
    color: rgba(255, 255, 255, 0.3);
    font-size: 0.8rem;
    position: relative;
    margin: 5px 0;
    
    &::before, &::after {
        content: '';
        position: absolute;
        top: 50%;
        width: 40%;
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
    }
    
    &::before { left: 0; }
    &::after { right: 0; }
}

.public-presets {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 12px;
    
    h4 {
        margin: 0 0 10px 0;
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.5);
    }
}

.preset-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
}

.preset-item {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    transition: all 0.2s;
    font-size: 0.95rem;
    
    &:hover {
        background: rgba(255, 255, 255, 0.05);
    }
    
    svg {
        opacity: 0.6;
    }
}

.close-btn {
    margin-top: 20px;
    width: 100%;
    padding: 12px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s;
    
    &:hover {
        background: rgba(255, 255, 255, 0.05);
        color: white;
    }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
</style>
