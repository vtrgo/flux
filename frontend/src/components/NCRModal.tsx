"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import styles from "./NCRModal.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";
import { Machine, NCR, NextNCRNumberResponse } from "../types";
import { ImageUploader } from "./ImageUploader";
import { AttachmentViewer } from "./AttachmentViewer";
import { toCalendarDateInput, calendarDateToUtcNoon } from "../lib/dateUtils";
import { formatDepartmentName } from "../lib/departments";

interface NCRModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingNCR?: NCR | null;
  preselectedMachineId?: string;
  onSaved?: () => void;
  autoPrint?: boolean;
}

export function NCRModal({
  isOpen,
  onClose,
  editingNCR,
  preselectedMachineId,
  onSaved,
  autoPrint,
}: NCRModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    machine_id: "",
    ncr_number: "",
    date: new Date().toISOString().split("T")[0],
    assembler: "",
    location: "",
    description: "",
    severity: "moderate",
    source_department: "quality",
    assigned_department: "assembly",
    root_cause: "",
    corrective_action: "",
    closeout_date: "",
    team_lead_signature: "",
    status: "open",
  });

  useAppHotkeys(
    "escape",
    () => {
      if (isOpen) {
        onClose();
      }
    },
    { enableOnFormTags: true },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    fetchApi<Machine[]>("machines")
      .then((data) => {
        setMachines(data || []);
        if (!editingNCR && data && data.length > 0 && !preselectedMachineId) {
          setFormData((prev) => ({
            ...prev,
            machine_id: prev.machine_id || data[0].id,
          }));
        }
      })
      .catch((err) => console.error("Failed to fetch machines", err));

    if (editingNCR) {
      setFormData({
        machine_id: editingNCR.machine_id || "",
        ncr_number: editingNCR.ncr_number || "",
        date: editingNCR.created_at
          ? toCalendarDateInput(editingNCR.created_at)
          : new Date().toISOString().split("T")[0],
        assembler: editingNCR.assembler || "",
        location: editingNCR.location || "",
        description: editingNCR.description || "",
        severity: editingNCR.severity || "moderate",
        source_department: editingNCR.source_department || "quality",
        assigned_department: editingNCR.assigned_department || "assembly",
        root_cause: editingNCR.root_cause || "",
        corrective_action: editingNCR.corrective_action || "",
        closeout_date: toCalendarDateInput(editingNCR.closeout_date),
        team_lead_signature: editingNCR.team_lead_signature || "",
        status: editingNCR.status || "open",
      });
    } else {
      // Fetch predicted next NCR number
      fetchApi<NextNCRNumberResponse>("ncrs/next-number")
        .then((resp) => {
          if (resp?.next_number) {
            setFormData((prev) => ({
              ...prev,
              ncr_number: prev.ncr_number || resp.next_number,
            }));
          }
        })
        .catch((err) => console.error("Failed to fetch next NCR number", err));

      setFormData({
        machine_id: preselectedMachineId || "",
        ncr_number: "",
        date: new Date().toISOString().split("T")[0],
        assembler: "",
        location: "",
        description: "",
        severity: "moderate",
        source_department: "quality",
        assigned_department: "assembly",
        root_cause: "",
        corrective_action: "",
        closeout_date: "",
        team_lead_signature: "",
        status: "open",
      });
    }
  }, [isOpen, editingNCR, preselectedMachineId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.machine_id) {
      toast.error("Please select a Machine / Project");
      return;
    }
    if (!formData.assembler.trim()) {
      toast.error("Assembler name is required");
      return;
    }
    if (!formData.location.trim()) {
      toast.error("Location of NC is required");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Description of defect is required");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...formData,
      closeout_date: formData.closeout_date
        ? calendarDateToUtcNoon(formData.closeout_date)
        : undefined,
    };

    try {
      if (editingNCR) {
        await fetchApi(`ncrs/${editingNCR.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("NCR updated successfully!");
      } else {
        const createdNCR = await fetchApi<NCR>("ncrs", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (createdNCR && pendingFiles.length > 0) {
          const toastId = toast.loading(`Uploading ${pendingFiles.length} image(s)...`);
          try {
            for (const file of pendingFiles) {
              const fd = new FormData();
              fd.append("file", file);
              await fetchApi(`issues/${createdNCR.id}/attachments`, {
                method: "POST",
                body: fd,
              });
            }
            toast.success("NCR and images saved successfully!", { id: toastId });
          } catch (uploadErr) {
            console.error("Upload error", uploadErr);
            toast.error("NCR saved, but failed to upload some images", { id: toastId });
          }
        } else {
          toast.success("NCR created successfully!");
        }
      }

      setPendingFiles([]);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Failed to save NCR", err);
      toast.error("Failed to save Non-Conformance Report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all fields? Unsaved changes will be lost."
      )
    ) {
      setFormData({
        machine_id: preselectedMachineId || (machines[0]?.id ?? ""),
        ncr_number: "",
        date: new Date().toISOString().split("T")[0],
        assembler: "",
        location: "",
        description: "",
        severity: "moderate",
        source_department: "quality",
        assigned_department: "assembly",
        root_cause: "",
        corrective_action: "",
        closeout_date: "",
        team_lead_signature: "",
        status: "open",
      });
      fetchApi<NextNCRNumberResponse>("ncrs/next-number").then((resp) => {
        if (resp?.next_number) {
          setFormData((prev) => ({ ...prev, ncr_number: resp.next_number }));
        }
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    if (isOpen && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint]);

  const selectedMachine = machines.find((m) => m.id === formData.machine_id);
  const selectedMachineDisplay = selectedMachine
    ? `${selectedMachine.order_number} (${selectedMachine.model_type})`
    : formData.machine_id || "—";

  useAppHotkeys(
    "ctrl+enter, meta+enter",
    () => {
      if (isOpen) {
        const submitEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSubmit(submitEvent);
      }
    },
    { enableOnFormTags: true },
    [isOpen, formData, editingNCR]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className={styles.formContainer} id="ncr-printable-report">
          {/* Form Header */}
          <div className={styles.formHeader}>
            <div className={styles.logoArea}>
              <img
                src="/assets/VTR LOGO-Turquoise.png"
                alt="VTR Feeder Solutions Logo"
                className={styles.logoImage}
              />
            </div>
            <div className={styles.headerText}>
              <h2 className={styles.headerTitle}>Fabricated Components</h2>
              <h3 className={styles.headerSubtitle}>Non-Conformance Report</h3>
            </div>
          </div>

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
                  setFormData({ ...formData, ncr_number: e.target.value })
                }
                placeholder="e.g., NCR-2026-001"
                required
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField} style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
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
                  setFormData({ ...formData, date: e.target.value })
                }
                required
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField}>
                {formData.date || "—"}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="machine_id" className={styles.label}>
                Project / Machine #
              </label>
              <select
                id="machine_id"
                value={formData.machine_id}
                onChange={(e) =>
                  setFormData({ ...formData, machine_id: e.target.value })
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
              <div className={styles.printOnlyField}>
                {selectedMachineDisplay}
              </div>
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
                  setFormData({ ...formData, assembler: e.target.value })
                }
                placeholder="Technician name"
                required
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField}>
                {formData.assembler || "—"}
              </div>
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
                  setFormData({ ...formData, location: e.target.value })
                }
                placeholder="e.g., Station 3, main assembly track, rear weld joint"
                required
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField}>
                {formData.location || "—"}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="severity" className={styles.label}>
                Severity
              </label>
              <select
                id="severity"
                value={formData.severity}
                onChange={(e) =>
                  setFormData({ ...formData, severity: e.target.value })
                }
                className={`${styles.selectField} ${styles.screenOnlyField}`}
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="critical">Critical</option>
              </select>
              <div className={styles.printOnlyField} style={{ textTransform: "uppercase", fontWeight: 600 }}>
                {formData.severity}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="assigned_dept" className={styles.label}>
                Routing Department
              </label>
              <select
                id="assigned_dept"
                value={formData.assigned_department}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    assigned_department: e.target.value,
                  })
                }
                className={`${styles.selectField} ${styles.screenOnlyField}`}
              >
                <option value="assembly">Assembly</option>
                <option value="machine-shop">Machine Shop</option>
                <option value="laser">Laser</option>
                <option value="electrical-controls">Electrical / Controls</option>
                <option value="enclosures">Enclosures</option>
                <option value="design">Design</option>
                <option value="kitting">Kitting</option>
              </select>
              <div className={styles.printOnlyField}>
                {formatDepartmentName(formData.assigned_department)}
              </div>
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <div className={styles.label}>
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
              </div>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
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
                    + ADD PHOTO
                  </label>
                  {pendingFiles.length > 0 && (
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
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
                            style={{ width: "60px", height: "60px", objectFit: "cover", display: "block" }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section: Non-Conformance Close-out */}
          <div className={styles.sectionTitle}>Non-Conformance Close-out</div>
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label htmlFor="root_cause" className={styles.label}>
                Root Cause of NCR
              </label>
              <textarea
                id="root_cause"
                value={formData.root_cause}
                onChange={(e) =>
                  setFormData({ ...formData, root_cause: e.target.value })
                }
                placeholder="Why did this occur?"
                className={`${styles.textareaField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyBox}>
                {formData.root_cause || "—"}
              </div>
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label htmlFor="corrective_action" className={styles.label}>
                Correction Taken / Action Items
              </label>
              <textarea
                id="corrective_action"
                value={formData.corrective_action}
                onChange={(e) =>
                  setFormData({ ...formData, corrective_action: e.target.value })
                }
                placeholder="Describe the rework or corrective action executed..."
                className={`${styles.textareaField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyBox}>
                {formData.corrective_action || "—"}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="closeout_date" className={styles.label}>
                Date for Completion / Verification
              </label>
              <input
                type="date"
                id="closeout_date"
                value={formData.closeout_date}
                onChange={(e) =>
                  setFormData({ ...formData, closeout_date: e.target.value })
                }
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField}>
                {formData.closeout_date || "____ / ____ / ________"}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="signature" className={styles.label}>
                Team Lead Signature / Sign-off
              </label>
              <input
                type="text"
                id="signature"
                value={formData.team_lead_signature}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    team_lead_signature: e.target.value,
                  })
                }
                placeholder="Sign digitally or print to sign"
                className={`${styles.inputField} ${styles.screenOnlyField}`}
              />
              <div className={styles.printOnlyField}>
                {formData.team_lead_signature ? (
                  <span className={styles.digitalSignature}>
                    {formData.team_lead_signature}
                  </span>
                ) : (
                  <div className={styles.signatureLine}>
                    <span>X ________________________________________</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={`${styles.actions} no-print`}>
            <button
              type="button"
              className="vtr-btn vtr-btn-secondary"
              onClick={handleResetForm}
            >
              Reset Form
            </button>
            <button
              type="button"
              className="vtr-btn"
              onClick={handlePrint}
              title="Print standard PDF report"
            >
              🖨️ Print / Save to PDF
            </button>
            <button
              type="button"
              className="vtr-btn vtr-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="vtr-btn vtr-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : editingNCR
                ? "Save Changes"
                : "Create NCR"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
