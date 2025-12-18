import { AudioRingBuffer } from './audio_ring_buffer.js'

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

class VitalProcessor extends AudioWorkletProcessor {
    constructor() {
        super()

        this.audioRingBuffer = null
        this.port.onmessage = (event) => {
            this.handleMessage(event.data)
        }
    }

    handleMessage(data) {
        if (data.type === 'init-audio-sab') {
            this.audioRingBuffer = new AudioRingBuffer(data.sab, 2)
            devLog('✅ AudioRingBuffer initialized in Worklet')
            this.port.postMessage({ type: 'ready' })
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0]
        const channelL = output[0]
        const channelR = output[1]

        // Only process if we have output channels
        if (!channelL || !channelR) return true

        const blockSize = channelL.length

        if (this.audioRingBuffer) {
            // Read directly into output channels
            const success = this.audioRingBuffer.read([channelL, channelR], blockSize)
            if (!success) {
                devWarn('Underrun')
            }
        }

        return true
    }
}

registerProcessor('vital-processor', VitalProcessor)
