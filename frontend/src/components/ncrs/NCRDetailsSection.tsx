"use client";

import React, { memo } from "react";
import { NCRFormData, Machine, NCR, Defect, Attachment } from "../../types";
import { AttachmentViewer } from "../AttachmentViewer";
import { ImageUploader } from "../ImageUploader";
import styles from "../NCRModal.module.css";

interface NCRDetailsSectionProps {
  formData: NCRFormData;
  machines: Machine[];
  selectedMachineDisplay: string;
  editingNCR?: NCR | null;
  upgradeFromDefect?: Defect | null;
  attachments: Attachment[];
  pendingFiles: File[];
  setFormData: React.Dispatch<React.SetStateAction<NCRFormData>>;
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
}

export const NCRDetailsSection = memo(function NCRDetailsSection({
  formData,
  machines,
  selectedMachineDisplay,
  editingNCR,
  upgradeFromDefect,
  attachments,
  pendingFiles,
  setFormData,
  setPendingFiles,
}: NCRDetailsSectionProps) {
  return (
    <>
      {/* Core Identification Fields */}
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label htmlFor="ncr_number" className={styles.label}>
            NCR Identification #
          </label>
          <input
            type="text"
            id="ncr_number"
            value={formData.ncr_number}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, ncr_number: e.target.value }))
            }
            placeholder="e.g., NCR-2026-001"
            required
            className={`${styles.inputField} ${styles.screenOnlyField}`}
          />
          <div
            className={styles.printOnlyField}
            style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}
          >
            {formData.ncr_number || "NCR-____-____"}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="ncr_date" className={styles.label}>
            Date
          </label>
          <input
            type="date"
            id="ncr_date"
            value={formData.date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, date: e.target.value }))
            }
            required
            className={`${styles.inputField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyField}>{formData.date || "—"}</div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="machine_id" className={styles.label}>
            Project / Machine #
          </label>
          <select
            id="machine_id"
            value={formData.machine_id}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, machine_id: e.target.value }))
            }
            required
            className={`${styles.selectField} ${styles.screenOnlyField}`}
          >
            <option value="">-- Select Machine / Project --</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.order_number} ({m.model_type})
              </option>
            ))}
          </select>
          <div className={styles.printOnlyField}>{selectedMachineDisplay}</div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="assembler" className={styles.label}>
            Assembler
          </label>
          <input
            type="text"
            id="assembler"
            value={formData.assembler}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, assembler: e.target.value }))
            }
            placeholder="Technician name"
            required
            className={`${styles.inputField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyField}>{formData.assembler || "—"}</div>
        </div>
      </div>

      {/* Section: Non-Conformance Details */}
      <div className={styles.sectionTitle}>Non-Conformance Details</div>
      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label htmlFor="location" className={styles.label}>
            Location of NC (Component / Station / Joint)
          </label>
          <input
            type="text"
            id="location"
            value={formData.location}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, location: e.target.value }))
            }
            placeholder="e.g., Station 3, main assembly track, rear weld joint"
            required
            className={`${styles.inputField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyField}>{formData.location || "—"}</div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label
            htmlFor="description"
            className={styles.label}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>Description of Defect</span>
            <span
              className="no-print"
              style={{
                fontSize: "0.75rem",
                color:
                  formData.description.length > 255
                    ? "var(--accent-red)"
                    : "inherit",
              }}
            >
              {formData.description.length} / 255
            </span>
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            maxLength={255}
            placeholder="Provide a detailed description of the non-conformance..."
            required
            className={`${styles.textareaField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyBox}>
            {formData.description || "—"}
          </div>
        </div>

        {/* Photo Attachments */}
        <div className={`${styles.formGroup} ${styles.fullWidth} no-print`}>
          <label className={styles.label}>Attachments &amp; Reference Photos</label>
          {editingNCR?.id ? (
            <>
              <AttachmentViewer issueId={editingNCR.id} />
              <ImageUploader issueId={editingNCR.id} />
            </>
          ) : (
            <div>
              {upgradeFromDefect?.id && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <AttachmentViewer issueId={upgradeFromDefect.id} editable={false} />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                id="ncr-file-upload"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) {
                    setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
              <label
                htmlFor="ncr-file-upload"
                className="vtr-btn vtr-btn-secondary"
                style={{ cursor: "pointer", display: "inline-block", fontSize: "0.8rem" }}
              >
                {upgradeFromDefect ? "+ ADD ADDITIONAL PHOTO" : "+ ADD PHOTO"}
              </label>
              {pendingFiles.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {pendingFiles.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--border-color, #444)",
                        padding: "0.25rem",
                        borderRadius: "4px",
                        position: "relative",
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          position: "absolute",
                          top: "-0.5rem",
                          right: "-0.5rem",
                          background: "var(--accent-red, #ff3366)",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          width: "1.25rem",
                          height: "1.25rem",
                          cursor: "pointer",
                          zIndex: 10,
                        }}
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        &times;
                      </button>
                      <img
                        src={URL.createObjectURL(f)}
                        alt="Pending upload preview"
                        style={{
                          width: "60px",
                          height: "60px",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attached Photos & Documentation (Printable Gallery) */}
        {(attachments.length > 0 || pendingFiles.length > 0) && (
          <div
            className={`${styles.formGroup} ${styles.fullWidth} ${styles.printAttachmentsSection}`}
          >
            <div className={styles.sectionTitle}>Attached Photos &amp; Documentation</div>
            <div className={styles.printAttachmentsGrid}>
              {attachments.map((att) => (
                <div key={att.id} className={styles.printAttachmentCard}>
                  <img
                    src={`/api/attachments/${att.id}`}
                    alt={att.filename}
                    className={styles.printAttachmentImg}
                  />
                  <span className={styles.printAttachmentFilename}>{att.filename}</span>
                </div>
              ))}
              {pendingFiles.map((file, idx) => (
                <div key={idx} className={styles.printAttachmentCard}>
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className={styles.printAttachmentImg}
                  />
                  <span className={styles.printAttachmentFilename}>{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
});
