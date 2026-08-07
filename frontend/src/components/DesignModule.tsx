"use client";

import { useState } from "react";
import styles from "./DesignModule.module.css";

interface DesignDocument {
  id: string;
  machine_id: string;
  document_type: string;
  version: string;
  file_url: string;
  status: string;
}

interface DesignModuleProps {
  machineId: string;
  documents: DesignDocument[];
}

export function DesignModule({ machineId, documents }: DesignModuleProps) {
  const [selectedDoc, setSelectedDoc] = useState<DesignDocument | null>(null);

  const handleLogECR = async (doc: DesignDocument) => {
    const desc = window.prompt(`Describe the issue with ${doc.document_type} (v${doc.version}):`);
    if (!desc || desc.trim() === "") return;

    try {
      await fetch(`http://localhost:8080/api/machines/${machineId}/defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_department: 'design', 
          assigned_department: 'design',
          severity: 'major',
          description: `[ECR - ${doc.document_type} v${doc.version}] ${desc.trim()}`
        })
      });
      window.alert("Engineering Change Request logged to the Quality Hub!");
    } catch (err) {
      console.error("Failed to log ECR", err);
    }
  };

  const handleUpload = () => {
    // Simulated upload
    window.alert("In the future, this will open a SolidWorks PDM integration panel to upload or link a new CAD model.");
  };

  return (
    <section className={styles.module}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 className={styles.title}>Design & PDM</h2>
          <span className={styles.badge}>{documents.length} Docs</span>
        </div>
        <button className="vtr-btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={handleUpload}>
          + UPLOAD
        </button>
      </header>
      
      <div className={styles.list}>
        {documents.length === 0 ? (
          <p className={styles.emptyMessage}>No design documents available.</p>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className={styles.card}>
              <div className={styles.cardInfo}>
                <span className={styles.docType}>{doc.document_type}</span>
                <span className={styles.docVersion}>v{doc.version}</span>
              </div>
              <p className={styles.fileUrl}>{doc.file_url}</p>
              
              <div className={styles.actions}>
                <button 
                  className={styles.viewBtn} 
                  onClick={() => window.alert(`Opening viewer for ${doc.file_url}...`)}
                >
                  VIEW
                </button>
                <button 
                  className={styles.ecrBtn} 
                  onClick={() => handleLogECR(doc)}
                  title="Raise Engineering Change Request"
                >
                  ⚠️ RAISE ECR
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
