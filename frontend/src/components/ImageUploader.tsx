import { useState, useRef } from "react";
import { fetchApi } from "../lib/api";

interface ImageUploaderProps {
  issueId: string;
  onUploadComplete?: () => void;
}

export function ImageUploader({ issueId, onUploadComplete }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      await fetchApi(`issues/${issueId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <input 
        type="file" 
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
        id={`upload-${issueId}`}
      />
      <label htmlFor={`upload-${issueId}`} className="vtr-btn vtr-btn-secondary" style={{ cursor: "pointer", display: "inline-block", fontSize: "0.75rem" }}>
        {uploading ? "UPLOADING..." : "+ ADD PHOTO"}
      </label>
    </div>
  );
}
