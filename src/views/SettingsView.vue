<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '../stores/audio'

const router = useRouter()
const { t, locale } = useI18n()
const audioStore = useAudioStore()
const devMode = ref(false)
const bufferSize = ref<number | string>(1024)
const customBufferSize = ref(1024)
const bufferOptions = computed(() => [
    { label: t('settings.buffer.fastest'), value: 256 },
    { label: t('settings.buffer.stable'), value: 512 },
    { label: t('settings.buffer.default'), value: 1024 },
    { label: t('settings.buffer.highLatency'), value: 2048 },
    { label: t('settings.buffer.custom'), value: 'custom' }
])
const forceScriptProcessor = ref(false)
const showProcessorReloadModal = ref(false)
const showDevModeReloadModal = ref(false)

// Check if browser supports AudioWorklet
const supportsAudioWorklet = computed(() => {
  return typeof AudioContext !== 'undefined' && 
         'audioWorklet' in AudioContext.prototype
})

const showBufferSizeSetting = computed(() => {
    return true
})

const selectedLanguage = ref('auto')

onMounted(() => {
    // Check if user has a saved locale preference
    const savedLocale = localStorage.getItem('user_locale')
    if (savedLocale) {
        selectedLanguage.value = savedLocale
    } else {
        selectedLanguage.value = 'auto'
    }

    devMode.value = localStorage.getItem('dev_mode') === 'true'
    forceScriptProcessor.value = localStorage.getItem('force_script_processor') === 'true'
    const storedBuffer = Number(localStorage.getItem('buffer_size') || 1024)
    const isStandard = bufferOptions.value.some(opt => opt.value === storedBuffer)
    
    if (isStandard) {
        bufferSize.value = storedBuffer
        customBufferSize.value = storedBuffer
    } else {
        bufferSize.value = 'custom'
        customBufferSize.value = storedBuffer
    }
})

function handleBufferChange() {
    if (bufferSize.value === 'custom') {
        // Do nothing, show input
        return
    }
    // Save immediately when dropdown changes to a standard value
    localStorage.setItem('buffer_size', String(bufferSize.value))
    location.reload()
}

function applyCustomBuffer() {
    const val = Number(customBufferSize.value)
    if (!val || val <= 0) return
    localStorage.setItem('buffer_size', String(val))
    location.reload()
}

function handleLanguageChange() {
    if (selectedLanguage.value === 'auto') {
        localStorage.removeItem('user_locale')
        // Apply system language immediately
        locale.value = navigator.language.startsWith('zh') ? 'zh' : 'en'
    } else {
        localStorage.setItem('user_locale', selectedLanguage.value)
        locale.value = selectedLanguage.value
    }
}

function toggleDevMode() {
    // Show reload modal when toggling
    showDevModeReloadModal.value = true
}

function handleLayoutChange() {
    // Save to localStorage via store
    audioStore.setKeyLayout(audioStore.keyLayout)
}

function toggleForceScriptProcessor() {
    // Only allow toggle if AudioWorklet is supported
    if (!supportsAudioWorklet.value) {
        return
    }
    // Show reload modal when toggling
    showProcessorReloadModal.value = true
}

function confirmProcessorReload() {
    localStorage.setItem('force_script_processor', String(forceScriptProcessor.value))
    location.reload()
}

function cancelProcessorReload() {
    // Revert the toggle
    forceScriptProcessor.value = !forceScriptProcessor.value
    showProcessorReloadModal.value = false
}

function confirmDevModeReload() {
    localStorage.setItem('dev_mode', String(devMode.value))
    location.reload()
}

function cancelDevModeReload() {
    // Revert the toggle
    devMode.value = !devMode.value
    showDevModeReloadModal.value = false
}

function goBack() {
    router.push('/')
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
        <header>
            <button class="back-btn" @click="goBack">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
            </button>
            <h1>{{ t('settings.title') }}</h1>
        </header>

        <div class="setting-section">
            <h2>{{ t('settings.general') }}</h2>
            
            <div class="setting-row">
                <div class="setting-label">
                    <h3>{{ t('settings.language.label') }}</h3>
                    <p>{{ t('settings.language.desc') }}</p>
                </div>
                <div class="setting-control">
                    <select v-model="selectedLanguage" @change="handleLanguageChange" class="select-input">
                        <option value="auto">{{ t('settings.language.auto') }}</option>
                        <option value="en">English</option>
                        <option value="zh">中文</option>
                    </select>
                </div>
            </div>

            <div class="setting-row">
                <div class="setting-label">
                    <h3>{{ t('settings.devMode.label') }}</h3>
                    <p>{{ t('settings.devMode.desc') }}</p>
                </div>
                <div class="setting-control">
                    <label class="toggle-switch">
                        <input type="checkbox" v-model="devMode" @change="toggleDevMode">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <h2>{{ t('settings.audio') }}</h2>
            
             <div class="setting-row">
                <div class="setting-label">
                    <h3>{{ t('settings.processor.label') }}</h3>
                    <p>{{ t('settings.processor.desc') }}</p>
                </div>
                <div class="setting-control backend-tag">
                    {{ audioStore.processorType }}
                </div>
            </div>

             <div class="setting-row" v-if="showBufferSizeSetting">
                <div class="setting-label">
                    <h3>{{ t('settings.buffer.label') }}</h3>
                    <p>{{ t('settings.buffer.desc') }}</p>
                </div>
                <div class="setting-controls-group">
                    <select v-model="bufferSize" @change="handleBufferChange" class="select-input">
                        <option v-for="opt in bufferOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                        </option>
                    </select>
                    <!-- Custom Buffer Input -->
                    <div class="custom-buffer-row" v-if="bufferSize === 'custom'" style="margin-top: 10px;">
                        <input 
                            type="number" 
                            v-model="customBufferSize" 
                            class="text-input" 
                            :placeholder="t('settings.buffer.custom')"
                        >
                        <button class="action-btn small" @click="applyCustomBuffer">{{ t('common.apply') }}</button>
                    </div>
                </div>
            </div>

             <div class="setting-row">
                <div class="setting-label">
                    <h3>{{ t('settings.processor.force') }}</h3>
                    <p v-if="supportsAudioWorklet">{{ t('settings.processor.forceDesc') }}</p>
                    <p v-else class="warning-text">{{ t('settings.processor.noWorklet') }}</p>
                </div>
                <div class="setting-control">
                    <label class="toggle-switch" :class="{ disabled: !supportsAudioWorklet }">
                        <input 
                            type="checkbox" 
                            v-model="forceScriptProcessor" 
                            @change="toggleForceScriptProcessor"
                            :disabled="!supportsAudioWorklet"
                        >
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <h2>{{ t('settings.display') }}</h2>
            
            <div class="setting-row">
                <div class="setting-label">
                    <h3>{{ t('settings.layout.label') }}</h3>
                    <p>{{ t('settings.layout.desc') }}</p>
                </div>
                <div class="setting-control">
                    <select v-model="audioStore.keyLayout" @change="handleLayoutChange" class="select-input">
                        <option value="fill">{{ t('settings.layout.fill') }}</option>
                        <option value="square-gap">{{ t('settings.layout.squareGap') }}</option>
                        <option value="square-center">{{ t('settings.layout.squareCenter') }}</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="setting-section">
            <h2>{{ t('settings.about') }}</h2>
            <div class="about-card">
                <p>Web Piano App v1.0.0</p>
            </div>
        </div>
    </div>
    
    <!-- Dev Mode Reload Modal -->
    <div v-if="showDevModeReloadModal" class="modal-overlay">
        <div class="modal-card">
            <h3>{{ t('settings.restartRequired') }}</h3>
            <p>{{ t('settings.devMode.restart') }}</p>
            <div class="modal-actions">
                <button class="action-btn secondary" @click="cancelDevModeReload">{{ t('common.cancel') }}</button>
                <button class="action-btn primary" @click="confirmDevModeReload">{{ t('settings.reloadNow') }}</button>
            </div>
        </div>
    </div>
    
    <!-- Processor Type Reload Modal -->
    <div v-if="showProcessorReloadModal" class="modal-overlay">
        <div class="modal-card">
            <h3>{{ t('settings.restartRequired') }}</h3>
            <p>{{ t('settings.processor.restart') }}</p>
            <div class="modal-actions">
                <button class="action-btn secondary" @click="cancelProcessorReload">{{ t('common.cancel') }}</button>
                <button class="action-btn primary" @click="confirmProcessorReload">{{ t('settings.reloadNow') }}</button>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at center, #2a2a2a 0%, #111 100%);
    color: white;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch; /* Momentum scroll on iOS */
    padding: 40px;
    box-sizing: border-box;
    z-index: 1000;
}

.settings-container {
    max-width: 800px;
    margin: 0 auto;
}

.header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 50px;
    
    h1 {
        font-size: 2rem;
        font-weight: 300;
        margin: 0;
        letter-spacing: 2px;
  }
}

.back-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    
    &:hover {
        background: rgba(255,255,255,0.2);
        transform: translateX(-5px);
    }
}

.setting-section {
    margin-bottom: 40px;
    
    h2 {
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: rgba(255,255,255,0.4);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 10px;
        margin-bottom: 20px;
    }
}

.setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255,255,255,0.03);
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 15px;
    transition: background 0.2s;
    
    &:hover {
        background: rgba(255,255,255,0.05);
    }
}

.setting-label {
    h3 {
        margin: 0 0 5px 0;
        font-size: 1.1rem;
        font-weight: 500;
    }
    p {
        margin: 0;
        font-size: 0.9rem;
        color: rgba(255,255,255,0.5);
    }
}

/* Premium Toggle Switch */
.toggle-switch {
    display: inline-block;
    width: 56px;
    height: 32px;
    position: relative;
    
    input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    
    .slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(255,255,255,0.1);
        transition: .4s cubic-bezier(0.2, 0.8, 0.2, 1);
        border-radius: 34px;
        border: 1px solid rgba(255,255,255,0.1);
        
        &:before {
            position: absolute;
            content: "";
            height: 24px;
            width: 24px;
            left: 3px;
            bottom: 3px;
            background-color: rgba(255,255,255,0.8);
            transition: .4s cubic-bezier(0.2, 0.8, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
    }
    
    input:checked + .slider {
        background-color: #42b883; /* Vue Green or App Theme Color */
        border-color: #42b883;
    }
    
    input:checked + .slider:before {
        transform: translateX(24px);
        background-color: white;
    }
    
    // Disabled state
    &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        
        .slider {
            cursor: not-allowed;
        }
    }
}

.select-input {
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    outline: none;
    
    option {
        background: #222;
        color: white;
    }
}

.setting-controls-group {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
}

.custom-buffer-row {
    display: flex;
    gap: 10px;
    align-items: center;
}

.text-input {
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    width: 80px;
    outline: none;
    
    &:focus {
        border-color: #42b883;
    }
}

.action-btn {
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    
    &.small {
        padding: 6px 12px;
        font-size: 0.9rem;
        background: #42b883;
        color: white;
        
        &:hover {
            background: #3aa876;
            transform: translateY(-1px);
        }
    }
    
    &.primary {
        background: #42b883;
        color: white;
        padding: 10px 20px;
        font-size: 1rem;
        
        &:hover {
            background: #3aa876;
        }
    }
    
    &.secondary {
        background: rgba(255,255,255,0.1);
        color: #ddd;
        padding: 10px 20px;
        font-size: 1rem;
        
        &:hover {
            background: rgba(255,255,255,0.2);
            color: white;
        }
    }
}

.error-text {
    color: #ff4757;
    font-size: 0.8rem;
    margin: 0;
    max-width: 200px;
    text-align: right;
}

.warning-text {
    color: #ffa502;
    font-size: 0.9rem;
}

.about-card {
    text-align: center;
    padding: 20px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    color: #888;
    
    p { margin: 5px 0; }
    .sub { font-size: 0.85rem; }
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.modal-card {
    background: #2a2a2a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    text-align: center;
    
    h3 {
        margin: 0 0 12px;
        color: white;
        font-size: 1.25rem;
    }
    
    p {
        color: #aaa;
        margin: 0 0 24px;
        line-height: 1.5;
    }
}

.modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.backend-tag {
    background: rgba(255,255,255,0.1);
    color: #42b883;
    padding: 6px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.9rem;
    font-weight: bold;
}
</style>
