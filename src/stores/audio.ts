import { defineStore } from 'pinia'
import { ref } from 'vue'
import { VitalSDK } from '@/libs/vital-web-sdk/src'
import { devLog, devError } from '@/services/logger'

export const useAudioStore = defineStore('audio', () => {
    const isInitialized = ref(false)
    const isLoading = ref(false)

    const loadingProgress = ref(0) // 0 to 100
    const initializationError = ref<string | null>(null)
    const baseOctave = ref(3) // Default C3
    // Read buffer_size from localStorage or default to 1024 (stable)
    const bufferSize = ref(Number(localStorage.getItem('buffer_size') || 1024))
    // Volume memory: default to 0.8 if not set
    const volume = ref(Number(localStorage.getItem('master_volume') || 0.8))
    const processorType = ref('Unknown')
    // Force ScriptProcessorNode instead of AudioWorklet
    const forceScriptProcessor = ref(localStorage.getItem('force_script_processor') === 'true')
    // Key Layout: 'fill' (deform to fill), 'square-gap' (square with gaps), 'square-center' (square centered no gaps)
    const keyLayout = ref<'fill' | 'square-gap' | 'square-center'>(
        (localStorage.getItem('key_layout') as 'fill' | 'square-gap' | 'square-center') || 'fill'
    )

    const vitalInstance = ref<VitalSDK | null>(null)

    async function resumeContext(): Promise<boolean> {
        if (!vitalInstance.value) return false

        const ctx = vitalInstance.value.context as AudioContext
        if (ctx) {
            if (ctx.state === 'suspended') {
                await ctx.resume()
            }
            return ctx.state === 'running'
        }
        return false
    }

    async function initialize() {
        if (isInitialized.value || isLoading.value) return

        isLoading.value = true
        initializationError.value = null
        loadingProgress.value = 10

        // Initialize with fallback strategy
        try {
            // 0. Environment Diagnostics
            const isIsolated = window.crossOriginIsolated
            const hasSAB = typeof SharedArrayBuffer !== 'undefined'
            const isSecure = window.isSecureContext

            // check if audio worklet support available
            if (!isIsolated && !hasSAB && !isSecure && !forceScriptProcessor.value) {
                console.warn('[Audio] ⚠️ Page is NOT Cross-Origin Isolated. SharedArrayBuffer will fail. Expect fallback to ScriptProcessor.')
            }

            // 1. Try Configuration (Worklet or ScriptProcessor based on settings)
            const shouldUseWorklet = !forceScriptProcessor.value

            let vital = new VitalSDK({
                bufferSize: bufferSize.value,
                useWorklet: shouldUseWorklet,
            })

            try {
                loadingProgress.value = 30
                await vital.init()
            } catch (initError) {
                // If we were trying to use Worklet and it failed, try fallback
                if (shouldUseWorklet) {
                    // Use console.error to ensure visibility in production for debugging
                    console.error('[Audio] ❌ Worklet initialization failed! Attempting fallback...', initError)
                    loadingProgress.value = 40

                    vital = new VitalSDK({
                        bufferSize: bufferSize.value,
                        useWorklet: false, // Force ScriptProcessor
                    })

                    await vital.init()
                    devLog('[Audio] Fallback to ScriptProcessor successful')

                    // Update state to reflect fallback
                    processorType.value = 'ScriptProcessorNode (Fallback)'
                } else {
                    throw initError // Re-throw if we were already in legacy mode
                }
            }

            loadingProgress.value = 90

            // Log audio context info
            const context = vital.context
            if (context) {
                const ctx = context
                devLog(`[Audio] Sample Rate: ${ctx.sampleRate}Hz`)
                devLog(`[Audio] Base Latency: ${(ctx.baseLatency * 1000).toFixed(2)}ms`)
                devLog(`[Audio] Output Latency: ${(ctx.outputLatency * 1000).toFixed(2)}ms`)
                devLog(`[Audio] State: ${ctx.state}`)

                // Try to resume immediately (works if previously interacted or specific browser policies)
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => { })
                }
            }

            // Check which backend is running (if not already set by fallback logic)
            if (processorType.value === 'Unknown') {
                if (vital.isWorklet) {
                    processorType.value = 'Audio Worklet'
                    devLog('[Audio] Backend: Audio Worklet')
                } else {
                    processorType.value = 'ScriptProcessorNode'
                    devLog('[Audio] Backend: ScriptProcessorNode')
                }
            }

            vitalInstance.value = vital
            isInitialized.value = true
            loadingProgress.value = 100

            // Sync volume from stored state
            vital.setVolume(volume.value)

        } catch (e: any) {
            devError('Failed to initialize Vital Audio:', e)

            // Auto-recovery for invalid buffer size
            const errStr = String(e)
            if (errStr.includes("IndexSizeError") || errStr.includes("buffer size")) {
                // UI will handle the reset option
                initializationError.value = `Invalid Audio Buffer Size detected (${bufferSize.value}). Please reset settings.`
                return
            }

            initializationError.value = e.message || 'Unknown error during audio initialization'
        } finally {
            isLoading.value = false
        }
    }

    function noteOn(note: number, velocity = 0.8) {
        if (!vitalInstance.value) return

        // Ensure AudioContext is running (browser policy requirement)
        const ctx = vitalInstance.value.context
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().then(() => {
                devLog('[Audio] Context Resumed')
            })
        }

        vitalInstance.value.noteOn(note, velocity)
    }

    function noteOff(note: number) {
        if (!vitalInstance.value) return
        vitalInstance.value.noteOff(note)
    }

    function loadPreset(presetData: string | File | ArrayBuffer) {
        if (!vitalInstance.value) return
        return vitalInstance.value.loadPreset(presetData)
    }

    function shiftOctave(delta: number) {
        const newOctave = baseOctave.value + delta
        if (newOctave >= 0 && newOctave <= 8) {
            baseOctave.value = newOctave
        }
    }

    function setKeyLayout(layout: 'fill' | 'square-gap' | 'square-center') {
        keyLayout.value = layout
        localStorage.setItem('key_layout', layout)
    }

    return {
        isInitialized,
        isLoading,
        loadingProgress,
        initializationError,
        baseOctave,
        bufferSize,
        processorType,
        forceScriptProcessor,
        keyLayout,
        vitalInstance,
        initialize,
        resumeContext,
        shiftOctave,
        setKeyLayout,
        noteOn,
        noteOff,
        loadPreset,
        setVolume: (vol: number) => {
            volume.value = vol
            localStorage.setItem('master_volume', String(vol))
            vitalInstance.value?.setVolume(vol)
        },
        volume
    }
})
