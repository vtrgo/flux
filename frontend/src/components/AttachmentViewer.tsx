import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { useSSE } from "./SSEProvider";

export interface Attachment {
  id: string;
  issue_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
}

interface AttachmentViewerProps {
  issueId: string;
  editable?: boolean;
}

export function AttachmentViewer({ issueId, editable = false }: AttachmentViewerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const data = await fetchApi<Attachment[]>(`issues/${issueId}/attachments`);
      setAttachments(data || []);
    } catch (err) {
      console.error("Failed to load attachments", err);
    }
  }, [issueId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  useSSE('attachment_added', (data: any) => {
    if (data && data.issue_id === issueId) {
      fetchAttachments();
    }
  });

  useSSE('attachment_deleted', (data: any) => {
    if (data && data.issue_id === issueId) {
      fetchAttachments();
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // Stop it from bubbling up to IssueModal or react-hotkeys
        setSelectedImage(null);
      }
    };
    if (selectedImage) {
      window.addEventListener('keydown', handleKeyDown, true); // Capture phase!
    }
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedImage]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this attachment?")) return;
    try {
      await fetchApi(`attachments/${id}`, { method: 'DELETE' });
      await fetchAttachments();
    } catch (err) {
      console.error("Failed to delete attachment", err);
      alert("Failed to delete attachment");
    }
  };

  if (attachments.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h4 style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>ATTACHED IMAGES</h4>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {attachments.map(att => (
          <div 
            key={att.id} 
            style={{ border: "1px solid var(--vtr-theme-primary)", padding: "0.15rem", borderRadius: "4px", cursor: "pointer", transition: "border-color 0.2s", position: "relative" }}
            onClick={(e) => {
              e.stopPropagation(); // prevent card clicks
              setSelectedImage(`/api/attachments/${att.id}`);
            }}
          >
            {editable && (
              <button 
                type="button"
                onClick={(e) => handleDelete(e, att.id)}
                style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: '50%', width: '1.5rem', height: '1.5rem', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                &times;
              </button>
            )}
            <img 
              src={`/api/attachments/${att.id}`} 
              alt={att.filename} 
              onError={(e) => {
                e.currentTarget.style.display = 'none'; // hide broken thumbnails or fallback
                e.currentTarget.parentElement!.style.border = '1px dashed var(--accent-red)';
              }}
              style={{ width: "60px", height: "60px", objectFit: "cover", display: "block", borderRadius: "2px" }} 
            />
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem"
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedImage(null);
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(null);
              }}
              style={{
                position: "absolute",
                top: "-2rem",
                right: "-2rem",
                background: "none",
                border: "none",
                color: "#fff",
                fontSize: "2rem",
                cursor: "pointer"
              }}
            >
              &times;
            </button>
            <img 
              src={selectedImage}
              alt="Attachment full view"
              style={{ 
                maxWidth: "100%", 
                maxHeight: "90vh", 
                objectFit: "contain",
                boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
