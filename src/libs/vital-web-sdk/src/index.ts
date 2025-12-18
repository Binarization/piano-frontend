/**
 * Vital Web SDK - 主入口
 * 用于在 Web 浏览器中加载和控制 Vital 合成器 WASM 模块
 */

import type { VitalModuleFactory, VitalModuleInstance, VitalSDKOptions } from './types'
import { devLog, devWarn, devError } from '../../../services/logger'
import { AudioRingBuffer } from './audio_ring_buffer.js'
import { RingBuffer } from './ring_buffer.js'
import vitalWasmPath from '../dist/piano.js?url'
import workerPath from './piano_worker.js?worker&url'
import workletPath from './piano_worklet.js?worker&url'

// MIDI CMD Constants
const CMD_NOTE_ON = 1
const CMD_NOTE_OFF = 2

export class VitalSDK {

    private vitalWasmPath: string
    private workerPath: string
    private workletPath: string

    private sampleRate: number
    private bufferSize: number

    private _audioContext: AudioContext | null = null
    private moduleInstance: VitalModuleInstance | null = null // for ScriptProcessor mode

    private worker: Worker | null = null

    private initialized = false
    private useWorklet = true

    private onReady: (() => void) | null
    private onError: ((error: Error) => void) | null

    private scriptNode: ScriptProcessorNode | null = null
    private workletNode: AudioWorkletNode | null = null

    // Buffers
    private ringBuffer: RingBuffer | null = null // MIDI Control
    private audioRingBuffer: AudioRingBuffer | null = null // Audio Streaming

    // Legacy pointers
    private outLPtr = 0
    private outRPtr = 0

    constructor(options: VitalSDKOptions = {}) {
        this.vitalWasmPath = options.wasmPath || vitalWasmPath
        this.workerPath = options.workerPath || workerPath
        this.workletPath = options.workletPath || workletPath

        this.sampleRate = options.sampleRate || 44100
        this.bufferSize = options.bufferSize || 1024
        this.useWorklet = options.useWorklet !== undefined ? options.useWorklet : true

        this.onReady = options.onReady || null
        this.onError = options.onError || null
    }

    /**
     * 获取 AudioContext
     */
    public get context(): AudioContext | null {
        return this._audioContext
    }

    /**
     * 检查是否运行在 Audio Worklet 模式
     */
    public get isWorklet(): boolean {
        return this.initialized && this.useWorklet
    }

    /**
     * 获取当前采样率
     */
    public getSampleRate(): number {
        return this.sampleRate
    }

    /**
     * 初始化 SDK
     */
    async init(): Promise<void> {
        if (this.initialized) {
            devWarn('VitalSDK already initialized')
            return
        }

        try {
            this._audioContext = new AudioContext({
                latencyHint: 'interactive'
            })
            this.sampleRate = this._audioContext.sampleRate

            devLog(`🔊 AudioContext Initialized: SampleRate=${this.sampleRate}Hz`)
            devLog(`   Threads: ${this.useWorklet ? 'Main + Worker + Worklet' : 'Main + ScriptProcessor'}`)

            this.initialized = true

            if (this.useWorklet) {
                // load worker
                this.worker = new Worker(this.workerPath, { type: 'module' })

                // load worklet
                try {
                    await this._audioContext.audioWorklet.addModule(this.workletPath)
                } catch (e) {
                    devError("Failed to add worklet module:", e)
                    throw new Error(`Failed to load worklet from ${this.workletPath}`)
                }

                await this._initWorkletAndWorker()
            } else {
                devLog('⚙️ Using ScriptProcessor (legacy mode)')
                await this._loadWasm()
                this._initScriptProcessor(this._audioContext.sampleRate)
                if (this.onReady) this.onReady()
            }

            devLog('✅ VitalSDK initialized successfully')
        } catch (error) {
            devError('VitalSDK initialization failed:', error)
            this.initialized = false
            if (this.onError) {
                this.onError(error as Error)
            }
            throw error
        }
    }

    /**
     * Initialize Worklet Node AND Worker
     */
    private async _initWorkletAndWorker(presetData?: string | Uint8Array): Promise<void> {
        if (!this._audioContext || !this.worker) return
        const worker = this.worker

        // cleanup existing node if any
        if (this.workletNode) {
            this.workletNode.disconnect()
            this.workletNode.port.onmessage = null
            this.workletNode = null
        }

        devLog('🚀 Initializing Vital Worker & Worklet...')

        return new Promise((resolve, reject) => {
            try {
                // Create Shared Buffers
                // Audio Buffer: 4096 frames (approx 85ms @ 48k)
                this.audioRingBuffer = new AudioRingBuffer(null, 2, 4096)

                // Command Buffer: 4096 bytes
                this.ringBuffer = new RingBuffer(null, 4096)

                // Setup Worklet
                this.workletNode = new AudioWorkletNode(this._audioContext!, 'vital-processor', {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                })

                // Setup Worker Message Handling
                worker.onmessage = (e) => {
                    const data = e.data
                    if (data.type === 'ready') {
                        // Worker is ready and rendering
                        devLog('✅ Vital Worker Ready')

                        // Now connect Worklet
                        this.workletNode!.connect(this._audioContext!.destination)

                        if (this.onReady) this.onReady()
                        if (presetData) devLog('✅ Preset loaded via init')
                        resolve()

                    } else if (data.type === 'error') {
                        devError('Worker Error:', data.message)
                        reject(new Error(data.message))
                    } else if (data.type === 'preset-loaded') {
                        devLog('✅ Preset loaded (Worker)')
                    }
                }

                // Handle Worklet Ready (just confirms SAB receipt)
                this.workletNode.port.onmessage = (e) => {
                    if (e.data.type === 'ready') {
                        devLog('✅ Vital Worklet Connected to RingBuffer')
                    }
                }

                // 1. Send SABs to Worklet
                this.workletNode.port.postMessage({
                    type: 'init-audio-sab',
                    sab: this.audioRingBuffer.getSharedArrayBuffer()
                })

                // 2. Send Config & SABs to Worker
                // We pass presetData here for immediate init
                const config = {
                    type: 'init',
                    sampleRate: this._audioContext!.sampleRate,
                    bufferSize: 128,
                    volume: 1.0,
                    presetData: presetData,
                    audioSab: this.audioRingBuffer.getSharedArrayBuffer(),
                    commandSab: this.ringBuffer.getSharedArrayBuffer(),
                    targetBufferFrames: this.bufferSize
                }
                worker.postMessage(config)
            } catch (e) {
                reject(e)
            }
        })
    }

    // Legacy WASM Load Methods
    private async _loadWasm(): Promise<void> {
        const vitalModule = (await import(/* @vite-ignore */ this.vitalWasmPath)).default as VitalModuleFactory
        this.moduleInstance = await vitalModule()
    }

    /**
     * 初始化 ScriptProcessor (降级方案)
     */
    private _initScriptProcessor(sampleRate: number): void {
        if (!this.moduleInstance || !this._audioContext) return

        this.moduleInstance._init(sampleRate, this.bufferSize)
        const framesPerBlock = this.bufferSize
        const bytes = framesPerBlock * 4
        this.outLPtr = this.moduleInstance._malloc(bytes)
        this.outRPtr = this.moduleInstance._malloc(bytes)

        this.scriptNode = this._audioContext.createScriptProcessor(this.bufferSize, 0, 2)
        this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
            const outL = e.outputBuffer.getChannelData(0)
            const outR = e.outputBuffer.getChannelData(1)
            this._render(outL, outR)
        }
        this.scriptNode.connect(this._audioContext.destination)
    }

    private _cachedWasmBuffer: ArrayBufferLike | null = null
    private _cachedWasmViewL: Float32Array | null = null
    private _cachedWasmViewR: Float32Array | null = null

    private _render(bufferL: Float32Array, bufferR: Float32Array): void {
        if (!this.moduleInstance || !this.outLPtr || !this.outRPtr) return
        const len = bufferL.length
        this.moduleInstance._render(this.outLPtr, this.outRPtr, len)

        if (!this._cachedWasmBuffer || this._cachedWasmBuffer !== this.moduleInstance.HEAPF32.buffer) {
            this._cachedWasmBuffer = this.moduleInstance.HEAPF32.buffer
            const leftStart = this.outLPtr >> 2
            const rightStart = this.outRPtr >> 2
            this._cachedWasmViewL = this.moduleInstance.HEAPF32.subarray(leftStart, leftStart + len)
            this._cachedWasmViewR = this.moduleInstance.HEAPF32.subarray(rightStart, rightStart + len)
        }

        if (this._cachedWasmViewL && this._cachedWasmViewR) {
            bufferL.set(this._cachedWasmViewL)
            bufferR.set(this._cachedWasmViewR)
        }
    }

    /**
     * 播放音符
     */
    noteOn(midiNote: number, velocity = 0.6): void {
        if (!this.initialized) return

        if (this.useWorklet && this.worker && this.ringBuffer) {
            // Send to Worker via RingBuffer
            const velocityByte = Math.floor(velocity * 127)
            const ret = this.ringBuffer.write(new Uint8Array([CMD_NOTE_ON, midiNote, velocityByte]))
            if (!ret) console.warn('RingBuffer Overflow!')
        } else if (this.moduleInstance) {
            this.moduleInstance._note_on(midiNote, velocity)
        }
    }

    /**
     * 停止音符
     */
    noteOff(midiNote: number): void {
        if (!this.initialized) return

        if (this.useWorklet && this.worker && this.ringBuffer) {
            this.ringBuffer.write(new Uint8Array([CMD_NOTE_OFF, midiNote]))
        } else if (this.moduleInstance) {
            this.moduleInstance._note_off(midiNote)
        }
    }

    /**
     * 加载预设
     */
    async loadPreset(preset: File | ArrayBuffer | string): Promise<void> {
        if (!this.initialized) throw new Error('VitalSDK not initialized')

        let jsonString: string
        if (preset instanceof File) {
            jsonString = await this._loadPresetFromFile(preset)
        } else if (preset instanceof ArrayBuffer) {
            jsonString = await this._loadPresetFromArrayBuffer(preset)
        } else if (typeof preset === 'string') {
            jsonString = preset
        } else {
            throw new Error('Invalid preset format')
        }

        const data = JSON.parse(jsonString)
        if (data.author) data.author = data.author.replace(/[^\x00-\x7F]/g, '?')
        if (data.comments) data.comments = data.comments.replace(/[^\x00-\x7F]/g, '?')
        const cleanJson = JSON.stringify(data)

        const utf8Bytes = new TextEncoder().encode(cleanJson)

        if (this.useWorklet) {
            // If we want to fully reload and reset the worker state, we could re-init
            // But better to just send a message if the worker supports hot-swapping
            // Our vital_worker.js supports 'load-preset' message
            if (this.worker) {
                this.worker.postMessage({
                    type: 'load-preset',
                    presetData: utf8Bytes
                })
            }
        } else if (this.moduleInstance) {
            // Legacy
            const strPtr = this.moduleInstance._malloc(utf8Bytes.length + 1)
            this.moduleInstance.HEAPU8.set(utf8Bytes, strPtr)
            this.moduleInstance.HEAPU8[strPtr + utf8Bytes.length] = 0
            const rc = this.moduleInstance._load_preset(strPtr, utf8Bytes.length)
            this.moduleInstance._free(strPtr)
            if (rc !== 0) throw new Error(`Failed to load preset: ${rc}`)
        }
    }

    private async _loadPresetFromFile(file: File): Promise<string> {
        const buffer = await file.arrayBuffer()
        return this._loadPresetFromArrayBuffer(buffer)
    }

    private async _loadPresetFromArrayBuffer(buffer: ArrayBuffer): Promise<string> {
        let bytes = new Uint8Array(buffer)
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
            // @ts-ignore
            const { gunzipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.1/esm/browser.js')
            bytes = gunzipSync(bytes)
        }
        return new TextDecoder('utf-8').decode(bytes)
    }

    setVolume(volume: number): void {
        if (!this.initialized) return

        if (this.useWorklet && this.worker) {
            this.worker.postMessage({ type: 'set-volume', volume })
        }
    }

    destroy(): void {
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
        }
        if (this.scriptNode) {
            this.scriptNode.disconnect()
            this.scriptNode = null
        }
        if (this._audioContext) {
            this._audioContext.close()
            this._audioContext = null
        }
        if (this.outLPtr && this.moduleInstance) {
            this.moduleInstance._free(this.outLPtr)
            this.moduleInstance._free(this.outRPtr)
            this.outLPtr = 0
            this.outRPtr = 0
        }
        this.initialized = false
        console.log('VitalSDK destroyed')
    }
}

export default VitalSDK
