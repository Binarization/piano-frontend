/**
 * 工具函数：MIDI 音符转换
 */
export const MidiUtils = {
    /**
     * 将音符名称转换为 MIDI 编号
     */
    noteNameToMidi(noteName: string): number {
        const noteMap: Record<string, number> = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        }

        const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/)
        if (!match) {
            throw new Error(`Invalid note name: ${noteName}`)
        }

        const note = match[1]!
        const octave = parseInt(match[2]!)

        if (!(note in noteMap)) {
            throw new Error(`Invalid note: ${note}`)
        }

        const midi = (octave + 1) * 12 + noteMap[note]!

        if (midi < 0 || midi > 127) {
            throw new Error(`MIDI note out of range: ${midi}`)
        }

        return midi
    },

    /**
     * 将 MIDI 编号转换为音符名称
     */
    midiToNoteName(midi: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        const octave = Math.floor(midi / 12) - 1
        const note = noteNames[midi % 12]
        return `${note}${octave}`
    },

    /**
     * 将频率转换为 MIDI 编号
     */
    frequencyToMidi(frequency: number): number {
        return Math.round(69 + 12 * Math.log2(frequency / 440))
    },

    /**
     * 将 MIDI 编号转换为频率
     */
    midiToFrequency(midi: number): number {
        return 440 * Math.pow(2, (midi - 69) / 12)
    }
}

/**
 * 预设管理工具
 */
export class PresetManager {
    /**
     * 从 URL 加载预设
     */
    static async loadFromUrl(url: string): Promise<string> {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Failed to load preset from ${url}: ${response.statusText}`)
        }

        const buffer = await response.arrayBuffer()
        return this.parsePreset(buffer)
    }

    /**
     * 解析预设数据
     */
    static async parsePreset(buffer: ArrayBuffer): Promise<string> {
        let bytes = new Uint8Array(buffer)

        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
            // @ts-expect-error - 动态导入第三方 CDN 模块，无类型定义
            const { gunzipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.1/esm/browser.js')
            bytes = gunzipSync(bytes)
        }

        return new TextDecoder('utf-8').decode(bytes)
    }

    /**
     * 清理预设 JSON（移除非 ASCII 字符）
     */
    static cleanPresetJson(jsonString: string): string {
        const data = JSON.parse(jsonString)

        if (data.author) {
            data.author = data.author.replace(/[^\x00-\x7F]/g, '?')
        }
        if (data.comments) {
            data.comments = data.comments.replace(/[^\x00-\x7F]/g, '?')
        }

        return JSON.stringify(data)
    }
}
