declare module 'mux.js' {
  export namespace mp4 {
    export class Transmuxer {
      constructor(options?: any)
      on(event: 'data', callback: (segment: { init: Uint8Array; data: Uint8Array }) => void): void
      on(event: 'done', callback: () => void): void
      push(data: Uint8Array): void
      flush(): void
      dispose(): void
      reset(): void
    }
  }
  const muxjs: any
  export default muxjs
}
