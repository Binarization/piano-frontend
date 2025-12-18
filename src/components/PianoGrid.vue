<script setup lang="ts">
import PianoKey from './PianoKey.vue'
import { useAudioStore } from '../stores/audio'

const audioStore = useAudioStore()

const rows = 3
const cols = 7

// C Major Scale Offsets: C, D, E, F, G, A, B
const scaleOffsets = [0, 2, 4, 5, 7, 9, 11]

function getKeyInfo(r: number, c: number) {
    // r is 1..3 (Top..Bottom)
    // We want Bottom Row (3) to be the lowest Octave (baseOctave)
    // Middle Row (2) to be baseOctave + 1
    // Top Row (1) to be baseOctave + 2
    const rowOctaveOffset = (rows - r) 
    
    // c is 1..7
    const scaleIndex = c - 1
    const noteOffset = scaleOffsets[scaleIndex] || 0
    
    // MIDI Note Calculation
    // C3 (48) is default base.
    // baseOctave from store (default 3).
    // Note = (baseOctave + rowOctaveOffset) * 12 + noteOffset
    // But wait, MIDI 12 is C0. 
    // (Octave + 1) * 12 = C of that octave. (since C-1 is 0, C0 is 12)
    const octave = audioStore.baseOctave + rowOctaveOffset
    const midiNote = (octave + 1) * 12 + noteOffset
    
    // Jianpu Label (1-7)
    const label = `${c}`
    
    // Dot Position relative to 'middle' row of this grid? 
    // Or relative to Central C (C4)?
    // Let's just use row logic: Top row has dot above? Bottom row dot below?
    // Let's say Base Octave (Bottom) is "No Dot" (or dot below if low octave).
    // Let's make it relative to the middle row of the grid for visual balance.
    // Row 2 (Middle) = No Dot.
    // Row 1 (Top) = Dot Top.
    // Row 3 (Bottom) = Dot Bottom.
    let dotPos = 'none'
    if (r === 1) dotPos = 'top'
    if (r === 3) dotPos = 'bottom'

    return { midiNote, label, dotPos, octave }
}
</script>

<template>
    <div class="piano-grid" :class="`layout-${audioStore.keyLayout}`">
        <div class="grid-row" v-for="r in rows" :key="r">
        <PianoKey 
            v-for="c in cols" 
            :key="getKeyInfo(r, c).midiNote" 
            :id="(r - 1) * cols + (c - 1)"
            :midi-note="getKeyInfo(r, c).midiNote"
            :label="getKeyInfo(r, c).label"
            :dot-position="getKeyInfo(r, c).dotPos"
        />
        </div>
    </div>
</template>

<style scoped lang="less">
.piano-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 20px;
    gap: 12px;
    margin: 0 auto;
  width: 100%;
  max-height: 100%;
  box-sizing: border-box;
  transition: padding-top 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

// Add padding when TopBar is visible
:global(body.topbar-visible) .piano-grid {
    max-height: calc(100% - 80px);
    padding-top: 80px;
}

.grid-row {
    flex: 1;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
}

// Layout Mode: Fill (Default - deform to fill screen)
.layout-fill {
    .grid-row {
        align-items: stretch;
    }
}

// Layout Mode: Square with gaps
.layout-square-gap {
    .grid-row {
        align-items: center;
        justify-content: center;
    }
    
    :deep(.piano-key) {
        aspect-ratio: 1 / 1;
    }
}

// Layout Mode: Square centered without gaps
.layout-square-center {
    justify-content: center; // Center the rows vertically
    
    .grid-row {
        flex: 0; // Don't stretch rows
        align-items: center;
        justify-content: center;
    }
    
    :deep(.piano-key) {
        aspect-ratio: 1 / 1;
    }
}
</style>
