import { useLayoutEffect, useState } from "react";

function fileFingerprint(file: File, sessionKey: number): string {
  return `${sessionKey}:${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * ビューア用 Blob URL。useLayoutEffect で初回ペイント前に URL を用意する。
 */
export function useFileBlobUrl(
  file: File | null,
  sessionKey: number,
  enabled: boolean,
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !file) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [enabled, file, sessionKey, file ? fileFingerprint(file, sessionKey) : ""]);

  return blobUrl;
}
