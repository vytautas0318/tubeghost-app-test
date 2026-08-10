// The "Scan a QR code" upload target for the Add-account dialog.
//
// Shows a thumbnail of whatever the user picked — on success it confirms the
// upload landed, on failure it shows WHAT they picked so a wrong or cropped
// screenshot is obvious instead of being reported as a bare error string.
//
// Decoding itself lives in parse.ts (native BarcodeDetector, then jsQR).

import * as React from 'react'
import { useRef } from 'react'
import { Upload } from 'lucide-react'

export function QrDropZone({
  preview,
  decoded,
  onFile
}: {
  /** data: URL of the chosen image, or null before anything is picked. */
  preview: string | null
  /** True once the image decoded to a usable otpauth URI. */
  decoded: boolean
  onFile: (file: File) => void
}): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="mb-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex flex-col items-center gap-2 py-6 border border-dashed border-[var(--line)] rounded-[var(--r)] text-[var(--t2)] hover:bg-[var(--hover)]"
      >
        {preview ? (
          <>
            {/* White plate: dark-mode QR screenshots are often transparent PNGs
                that vanish against the dialog background. */}
            <img
              src={preview}
              alt="Uploaded QR code"
              className="w-24 h-24 object-contain rounded-[var(--r)] bg-white p-1"
            />
            <span className="text-sm">
              {decoded ? 'QR code read — details below' : 'Click to choose a different image'}
            </span>
          </>
        ) : (
          <>
            <Upload size={20} />
            <span className="text-sm">Upload a QR code image</span>
          </>
        )}
      </button>
    </div>
  )
}
