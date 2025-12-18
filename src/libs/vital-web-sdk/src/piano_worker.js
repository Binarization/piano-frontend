import vitalWasmPath from '../dist/piano.js?url'
import { AudioRingBuffer } from './audio_ring_buffer.js'
import { RingBuffer } from './ring_buffer.js'

const DEBUG_MODE = false

function devLog(...args) {
    if (DEBUG_MODE) console.log(...args)
}

function devWarn(...args) {
    if (DEBUG_MODE) console.warn(...args)
}

function devError(...args) {
    if (DEBUG_MODE) console.error(...args)
}

devLog('Use [VitalWorker] Worker Script Loaded')

let moduleInstance = null
let audioRingBuffer = null
let commandRingBuffer = null
let heapF32 = null

let outLPtr = 0
let outRPtr = 0
let tempBufferInterleaved = null

const CMD_NOTE_ON = 1
const CMD_NOTE_OFF = 2

// State
let isReady = false
let sampleRate = 0
let targetBufferSize = 0 // Will be set by init command

let bufferSize = 128 // Standard render block
let initialVolume = 1.0

async function initWasm(config) {
    try {
        devLog('[VitalWorker] initWasm started')

        const vitalModule = (await import(/* @vite-ignore */ vitalWasmPath)).default
        const factory = await vitalModule({
            locateFile: (path) => {
                const p = path.endsWith('.wasm') ? '/vital/vital.wasm' : path
                devLog('[VitalWorker] locateFile:', path, '->', p)
                return p
            },
            print: (text) => devLog('[VitalWASM]', text),
            printErr: (text) => devError('[VitalWASM Error]', text)
        })

        devLog('[VitalWorker] VitalModule factory created')

        moduleInstance = factory

        // Initialize Engine
        if (config.presetData && moduleInstance._init_with_preset) {
            devLog('[VitalWorker] Initializing with preset...')

            let utf8Bytes
            if (typeof config.presetData === 'string') {
                utf8Bytes = new TextEncoder().encode(config.presetData)
            } else {
                utf8Bytes = config.presetData
            }

            const len = utf8Bytes.length
            const strPtr = moduleInstance._malloc(len + 1)
            moduleInstance.HEAPU8.set(utf8Bytes, strPtr)
            moduleInstance.HEAPU8[strPtr + len] = 0

            moduleInstance._init_with_preset(config.sampleRate, config.bufferSize, strPtr, len)
            moduleInstance._free(strPtr)

        } else {
            devLog('[VitalWorker] Initializing without preset...')
            moduleInstance._init(config.sampleRate, config.bufferSize)
        }

        if (moduleInstance._render) {
            moduleInstance._render(config.volume || 1.0)
        }

        // Allocate local output buffers in WASM
        const bytes = config.bufferSize * 4
        outLPtr = moduleInstance._malloc(bytes)
        outRPtr = moduleInstance._malloc(bytes)

        // Temp buffer for interleaving before writing to SAB
        // 128 frames * 2 channels = 256 samples
        tempBufferInterleaved = new Float32Array(config.bufferSize * 2)

        isReady = true
        devLog('[VitalWorker] Initialization Complete! Sending ready message.')
        postMessage({ type: 'ready' })

        // Start Render Loop
        renderLoop()

    } catch (e) {
        devError('Vital Worker Init Failed:', e)
        postMessage({ type: 'error', message: e.message })
    }
}

function handleCommand(data) {
    if (data.type === 'init') {
        devLog('[VitalWorker] Handling INIT command. SampleRate:', data.sampleRate)
    }

    if (!isReady && !moduleInstance && data.type !== 'init') {
        return
    }

    switch (data.type) {
        case 'init':
            bufferSize = data.bufferSize || 128
            targetBufferSize = data.targetBufferFrames || 1024
            devLog(`[VitalWorker] Intialized with Target Buffer Size: ${targetBufferSize}`)
            initialVolume = data.volume

            // Audio Ring Buffer
            if (data.audioSab) {
                devLog('[VitalWorker] Setting up AudioRingBuffer')
                audioRingBuffer = new AudioRingBuffer(data.audioSab, 2)
            }

            // Command Ring Buffer (Output from Main Thread -> Input to Worker)
            if (data.commandSab) {
                devLog('[VitalWorker] Setting up CommandRingBuffer')
                commandRingBuffer = new RingBuffer(data.commandSab)
            }

            devLog('[VitalWorker] Calling initWasm...')
            initWasm({
                sampleRate,
                bufferSize,
                volume: initialVolume,
                presetData: data.presetData
            })
            break

        case 'note-on':
            moduleInstance._note_on(data.note, data.velocity)
            break

        case 'note-off':
            moduleInstance._note_off(data.note)
            break

        case 'set-volume':
            if (moduleInstance._render) moduleInstance._render(data.volume)
            break



        case 'load-preset':
            loadPreset(data.presetData)
            break
    }
}

function loadPreset(presetData) {
    if (!moduleInstance) return
    try {
        let utf8Bytes
        if (typeof presetData === 'string') {
            utf8Bytes = new TextEncoder().encode(presetData)
        } else {
            utf8Bytes = presetData
        }

        const len = utf8Bytes.length
        const strPtr = moduleInstance._malloc(len + 1)
        moduleInstance.HEAPU8.set(utf8Bytes, strPtr)
        moduleInstance.HEAPU8[strPtr + len] = 0

        moduleInstance._load_preset(strPtr, len)
        moduleInstance._free(strPtr)

        postMessage({ type: 'preset-loaded' })
    } catch (e) {
        devError('Worker Load Preset Error', e)
    }
}

function processCommands() {
    if (commandRingBuffer) {
        commandRingBuffer.read((data) => {
            const cmd = data[0]
            if (cmd === CMD_NOTE_ON) {
                moduleInstance._note_on(data[1], data[2] / 127.0)
            } else if (cmd === CMD_NOTE_OFF) {
                moduleInstance._note_off(data[1])
            }
        })
    }
}

function renderLoop() {
    if (!isReady || !audioRingBuffer) {
        setTimeout(renderLoop, 100)
        return
    }

    // Process Queued Commands
    processCommands()

    // Check buffered amount (Latency Control)
    // instead of filling the whole buffer (4096 frames ~85ms),
    // we only look ahead by a small amount (e.g., 512 frames ~11ms).
    const bufferedFrames = audioRingBuffer.availableRead()
    const TARGET_AHEAD = targetBufferSize


    // If we have enough data buffered, yield to keep latency low
    if (bufferedFrames >= TARGET_AHEAD) {
        setTimeout(renderLoop, 1)
        return
    }

    // Check actual space (Overflow protection)
    const availableWrite = audioRingBuffer.availableWrite()
    if (availableWrite < bufferSize) {
        setTimeout(renderLoop, 1) // 1ms is ~44 samples @ 44.1k
        return
    }

    // Render Block
    // 1. Render WASM
    moduleInstance._render(outLPtr, outRPtr, bufferSize)

    // 2. Interleave
    if (!heapF32 || heapF32.buffer !== moduleInstance.HEAPF32.buffer) {
        heapF32 = new Float32Array(moduleInstance.HEAPF32.buffer)
    }

    const leftStart = outLPtr >> 2
    const rightStart = outRPtr >> 2

    const leftView = heapF32.subarray(leftStart, leftStart + bufferSize)
    const rightView = heapF32.subarray(rightStart, rightStart + bufferSize)

    // Interleave loop
    for (let i = 0; i < bufferSize; i++) {
        tempBufferInterleaved[i * 2] = leftView[i]
        tempBufferInterleaved[i * 2 + 1] = rightView[i]
    }

    // 3. Write to AudioRingBuffer
    audioRingBuffer.write(tempBufferInterleaved)

    if (audioRingBuffer.availableRead() < TARGET_AHEAD) {
        queueMicrotask(renderLoop)
    } else {
        setTimeout(renderLoop, 0)
    }
}


self.onmessage = function (e) {
    // devLog('[VitalWorker] Received message:', e.data.type)
    handleCommand(e.data)
}
