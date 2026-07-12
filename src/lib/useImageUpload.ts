"use client";

// 이미지 업로드 상태/동작 공유 훅. 입력칸 드롭과 페이지 전역 드롭/붙여넣기가 같은 첨부를 공유.
import { useCallback, useState } from "react";

export type Attachment = { path: string; name: string };

export function useImageUpload() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files]; // 모든 파일 허용 (이미지·PDF·텍스트·CSV 등)
    if (list.length === 0) return;
    setUploading(true);
    for (const f of list) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (d.ok) setAttachments((prev) => [...prev, { path: d.path, name: d.name }]);
      } catch {
        /* 무시 — 호출부에서 에러 표시 */
      }
    }
    setUploading(false);
  }, []);

  return { attachments, setAttachments, uploading, uploadFiles };
}
