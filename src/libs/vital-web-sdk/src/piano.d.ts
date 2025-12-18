import { VitalModuleFactory } from './types'

declare module '@/assets/vital/piano.js' {
    const VitalModule: VitalModuleFactory
    export default VitalModule
}
