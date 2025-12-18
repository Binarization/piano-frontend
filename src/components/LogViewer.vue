<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { logs, clearLogs as clearGlobalLogs } from '../services/logger'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['close'])
const logsContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

function close() {
    emit('close')
}

function clearLogs() {
    clearGlobalLogs()
}

// Auto-scroll when new logs are added
function scrollToBottom() {
    if (autoScroll.value) {
        nextTick(() => {
            if (logsContainer.value) {
                logsContainer.value.scrollTop = logsContainer.value.scrollHeight
            }
        })
    }
}

// Watch for new logs and scroll
const observer = new MutationObserver(() => {
    scrollToBottom()
})

function setupObserver() {
    if (logsContainer.value) {
        observer.observe(logsContainer.value, {
            childList: true,
            subtree: true
        })
    }
}

// Setup observer when component mounts
nextTick(() => {
    setupObserver()
})
</script>

<template>
    <div class="log-viewer-overlay" @click.self="close">
        <div class="log-viewer">
            <div class="header">
                <div class="title-section">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                    <h2>{{ t('logs.title') }}</h2>
                    <span class="log-count">{{ logs.length }} {{ t('logs.entries') }}</span>
                </div>
                <div class="header-actions">
                    <button class="action-btn clear-btn" @click="clearLogs" :title="t('logs.clear')">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    <label class="auto-scroll-toggle">
                        <input type="checkbox" v-model="autoScroll">
                        <span>{{ t('logs.autoScroll') }}</span>
                    </label>
                    <button class="close-btn" @click="close" :title="t('common.close')">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
            </div>
        </div>
        
        <div class="logs-container" ref="logsContainer">
            <div v-if="logs.length === 0" class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" stroke-width="1.5">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
                <p>{{ t('logs.noLogs') }}</p>
                <span>{{ t('logs.consoleOutput') }}</span>
            </div>
            
            <div 
                v-for="(log, i) in logs" 
                :key="i" 
                class="log-entry"
                :class="log.type"
            >
            <span class="timestamp">{{ log.timestamp }}</span>
            <span class="log-type-badge" :class="log.type">
                {{ log.type === 'latency' ? t('logs.latency') : log.type.toUpperCase() }}
            </span>
            <span class="log-message">{{ log.message }}</span>
            </div>
        </div>
        </div>
    </div>
</template>

<style scoped lang="less">
.log-viewer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    padding: 40px 20px;
    box-sizing: border-box;
    overflow-y: auto;
}

.log-viewer {
    width: 100%;
    max-width: 1200px;
    height: 80vh;
    max-height: 80vh;
    background: rgba(20, 20, 20, 1);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    
    .title-section {
        display: flex;
        align-items: center;
        gap: 12px;
        color: white;
        
        svg {
            color: #42b883;
        }
        
        h2 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 500;
            letter-spacing: 0.5px;
        }
        
        .log-count {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.4);
            background: rgba(255, 255, 255, 0.05);
            padding: 4px 10px;
            border-radius: 12px;
            font-family: monospace;
        }
    }
    
    .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }
}

.action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    
    &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border-color: rgba(255, 255, 255, 0.2);
    }
}

.auto-scroll-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
    cursor: pointer;
    user-select: none;
    
    input[type="checkbox"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
        accent-color: #42b883;
    }
  
    &:hover {
        color: white;
    }
}

.close-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    
    &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }
}

.logs-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #0a0a0a;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9rem;
    
    &::-webkit-scrollbar {
        width: 8px;
    }
    
    &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.02);
    }
    
    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        
        &:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    }
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.3);
    gap: 12px;
    
    svg {
        opacity: 0.3;
    }
    
    p {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 500;
    }
    
    span {
        font-size: 0.9rem;
        opacity: 0.7;
    }
}

.log-entry {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 4px;
    border-radius: 6px;
    border-left: 3px solid transparent;
    transition: background 0.15s;
    
    &:hover {
        background: rgba(255, 255, 255, 0.03);
    }
    
    &.log {
        border-left-color: #42b883;
        
        .log-type-badge {
        background: rgba(66, 184, 131, 0.15);
        color: #42b883;
        }
    }
    
    &.warn {
        border-left-color: #f39c12;
        
        .log-type-badge {
        background: rgba(243, 156, 18, 0.15);
        color: #f39c12;
        }
    }
    
    &.error {
        border-left-color: #e74c3c;
        
        .log-type-badge {
        background: rgba(231, 76, 60, 0.15);
        color: #e74c3c;
        }
    }
    
    &.latency {
        border-left-color: #3498db;
        
        .log-type-badge {
        background: rgba(52, 152, 219, 0.15);
        color: #3498db;
        }
    }
    
    .timestamp {
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.8rem;
        min-width: 90px;
        flex-shrink: 0;
    }
    
    .log-type-badge {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        min-width: 60px;
        text-align: center;
        flex-shrink: 0;
    }
    
    .log-message {
        color: rgba(255, 255, 255, 0.85);
        white-space: pre-wrap;
        word-break: break-word;
        flex: 1;
        line-height: 1.5;
    }
}

@media (max-width: 768px) {
    .log-viewer-overlay {
        padding: 20px 10px;
    }
    
    .log-viewer {
        height: 85vh;
        max-height: 85vh;
        border-radius: 12px;
    }
    
    .header {
        padding: 16px;
        flex-wrap: wrap;
        gap: 12px;
        
        .title-section {
            h2 {
                font-size: 1.1rem;
            }
        }
    }
    
    .log-entry {
        flex-direction: column;
        gap: 6px;
        
        .timestamp {
            min-width: auto;
        }
    }
}
</style>
