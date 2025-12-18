/**
 * Vital Web SDK 类型定义
 */

export interface VitalSDKOptions {
    wasmPath?: string
    workerPath?: string
    workletPath?: string
    sampleRate?: number
    bufferSize?: number
    useWorklet?: boolean
    onReady?: () => void
    onError?: (error: Error) => void
}

export interface VitalModuleInstance {
    _init: (sampleRate: number, framesPerBlock: number) => void
    _render: (outLPtr: number, outRPtr: number, frames: number) => void
    _note_on: (midi: number, velocity: number) => void
    _note_off: (midi: number) => void
    _load_preset: (dataPtr: number, length: number) => number
    _malloc: (size: number) => number
    _free: (ptr: number) => void
    HEAPF32: Float32Array
    HEAPU8: Uint8Array
}

export interface VitalModuleFactory {
    (): Promise<VitalModuleInstance>
}
