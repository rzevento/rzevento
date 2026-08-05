/// <reference types="vite/client" />

interface BarcodeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetector
}

interface Window {
  BarcodeDetector: BarcodeDetectorConstructor
}
