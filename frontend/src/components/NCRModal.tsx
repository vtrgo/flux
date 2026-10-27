"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";
import {
  Machine,
  NCR,
  User,
  NextNCRNumberResponse,
  Defect,
  Attachment,
  NCRFormData,
} from "../types";
import { useSSE } from "./SSEProvider";
import { toCalendarDateInput, calendarDateToUtcNoon } from "../lib/dateUtils";
import { NCRHeader } from "./ncrs/NCRHeader";
import { NCRDetailsSection } from "./ncrs/NCRDetailsSection";
import { NCRSignoffSection } from "./ncrs/NCRSignoffSection";
import { NCRActionsBar } from "./ncrs/NCRActionsBar";
import styles from "./NCRModal.module.css";

interface NCRModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingNCR?: NCR | null;
  upgradeFromDefect?: Defect | null;
  preselectedMachineId?: string;
  onSaved?: () => void;
  autoPrint?: boolean;
}

export function NCRModal({
  isOpen,
  onClose,
  editingNCR,
  upgradeFromDefect,
  preselectedMachineId,
  onSaved,
  autoPrint,
}: NCRModalProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sendNotification, setSendNotification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<NCRFormData>({
    machine_id: "",
    ncr_number: "",
    date: new Date().toISOString().split("T")[0],
    assembler: "",
    location: "",
    description: "",
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

  // Load managers and admins from database for Assigned Responsible Person selection
  useEffect(() => {
    if (!isOpen) return;
    fetchApi<User[]>("users?role=manager,admin")
      .then((data) => {
        const mgrs = data || [];
        setManagers(mgrs);
        const targetUserId = upgradeFromDefect?.assigned_user_id || editingNCR?.assigned_user_id;
        if (targetUserId) {
          const matchingMgr = mgrs.find((m) => m.id === targetUserId);
          if (matchingMgr) {
            const fullName =
              matchingMgr.first_name && matchingMgr.last_name
                ? `${matchingMgr.first_name} ${matchingMgr.last_name}`
                : matchingMgr.username;
            setFormData((prev) => ({
              ...prev,
              team_lead_signature: prev.team_lead_signature || fullName,
            }));
          }
        }
      })
      .catch((err) => console.error("Failed to fetch managers", err));
  }, [isOpen, upgradeFromDefect, editingNCR]);

  const targetIssueId = editingNCR?.id || upgradeFromDefect?.id;

  // Load attachments for viewing and printing
  const loadAttachments = useCallback(async () => {
    if (!targetIssueId) {
      setAttachments([]);
      return;
    }
    try {
      const data = await fetchApi<Attachment[]>(
        `issues/${targetIssueId}/attachments`
      );
      setAttachments(data || []);
    } catch (err) {
      console.error("Failed to load attachments", err);
    }
  }, [targetIssueId]);

  useEffect(() => {
    if (isOpen) {
      loadAttachments();
    }
  }, [isOpen, loadAttachments]);

  useSSE("attachment_added", () => loadAttachments());
  useSSE("attachment_deleted", () => loadAttachments());

  useEffect(() => {
    if (!isOpen) return;

    // Clear notification routing checkbox on review/edit so new notifications can be explicitly dispatched
    setSendNotification(false);

    fetchApi<Machine[]>("machines")
      .then((data) => {
        setMachines(data || []);
        if (!editingNCR && !upgradeFromDefect && data && data.length > 0 && !preselectedMachineId) {
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
        root_cause: editingNCR.root_cause || "",
        corrective_action: editingNCR.corrective_action || "",
        closeout_date: toCalendarDateInput(editingNCR.closeout_date),
        team_lead_signature: editingNCR.team_lead_signature || "",
        status: editingNCR.status || "open",
      });
    } else if (upgradeFromDefect) {
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
        machine_id: upgradeFromDefect.machine_id || preselectedMachineId || "",
        ncr_number: "",
        date: upgradeFromDefect.created_at
          ? toCalendarDateInput(upgradeFromDefect.created_at)
          : new Date().toISOString().split("T")[0],
        assembler: upgradeFromDefect.assembler || upgradeFromDefect.created_by_user_name || "",
        location: upgradeFromDefect.location || "",
        description: upgradeFromDefect.description || "",
        root_cause: upgradeFromDefect.root_cause || upgradeFromDefect.notes || "",
        corrective_action: upgradeFromDefect.corrective_action || "",
        closeout_date: toCalendarDateInput(upgradeFromDefect.closeout_date),
        team_lead_signature: upgradeFromDefect.team_lead_signature || "",
        status: upgradeFromDefect.status || "open",
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
        root_cause: "",
        corrective_action: "",
        closeout_date: "",
        team_lead_signature: "",
        status: "open",
      });
    }
  }, [isOpen, editingNCR, upgradeFromDefect, preselectedMachineId]);

  const selectedMachine = machines.find((m) => m.id === formData.machine_id);
  const selectedMachineDisplay = selectedMachine
    ? `${selectedMachine.order_number} (${selectedMachine.model_type})`
    : formData.machine_id || "—";

  const selectedManagerUser = managers.find(
    (m) =>
      ((m.first_name && m.last_name)
        ? `${m.first_name} ${m.last_name}`
        : m.username) === formData.team_lead_signature
  );

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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

    const resolvedAssignedUserId =
      selectedManagerUser?.id ||
      (formData.team_lead_signature
        ? editingNCR?.assigned_user_id || upgradeFromDefect?.assigned_user_id
        : undefined) ||
      undefined;

    const payload = {
      ...formData,
      assigned_user_id: resolvedAssignedUserId,
      severity: editingNCR?.severity || upgradeFromDefect?.severity || "moderate",
      source_department: editingNCR?.source_department || upgradeFromDefect?.source_department || "quality",
      assigned_department: editingNCR?.assigned_department || upgradeFromDefect?.assigned_department || "assembly",
      closeout_date: formData.closeout_date
        ? calendarDateToUtcNoon(formData.closeout_date)
        : undefined,
      send_notification: sendNotification,
      upgrade_from_defect_id: upgradeFromDefect?.id,
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
          toast.success(upgradeFromDefect ? "Issue upgraded to NCR successfully!" : "NCR created successfully!");
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
  }, [formData, selectedManagerUser, editingNCR, upgradeFromDefect, sendNotification, pendingFiles, onSaved, onClose]);

  const handleResetForm = useCallback(() => {
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
        root_cause: "",
        corrective_action: "",
        closeout_date: "",
        team_lead_signature: "",
        status: "open",
      });
      setSendNotification(false);
      fetchApi<NextNCRNumberResponse>("ncrs/next-number").then((resp) => {
        if (resp?.next_number) {
          setFormData((prev) => ({ ...prev, ncr_number: resp.next_number }));
        }
      });
    }
  }, [preselectedMachineId, machines]);

  const handleMarkClosed = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      status: "fixed",
      closeout_date: prev.closeout_date || new Date().toISOString().split("T")[0],
    }));
    toast.info("NCR marked as Fixed / Closed. Click 'Save Changes' to commit.");
  }, []);

  const handleVerify = useCallback(() => {
    if (!formData.team_lead_signature) {
      toast.error("Please select an Assigned Responsible Person before verifying.");
    }
    setFormData((prev) => ({
      ...prev,
      status: "verified",
      closeout_date: prev.closeout_date || new Date().toISOString().split("T")[0],
    }));
    toast.info("NCR marked as Verified & Cleared. Click 'Save Changes' to commit.");
  }, [formData.team_lead_signature]);

  const handleReopen = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      status: "open",
    }));
    toast.info("NCR re-opened. Click 'Save Changes' to commit.");
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    if (isOpen && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint]);

  useAppHotkeys(
    "ctrl+enter, meta+enter",
    () => {
      if (isOpen) {
        const submitEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSubmit(submitEvent);
      }
    },
    { enableOnFormTags: true },
    [isOpen, handleSubmit]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className={styles.formContainer} id="ncr-printable-report">
          {/* Form Header */}
          <NCRHeader status={formData.status} onClose={onClose} />

          <div className={styles.scrollableBody}>
            {/* Core Identification & Defect Details */}
            <NCRDetailsSection
              formData={formData}
              machines={machines}
              selectedMachineDisplay={selectedMachineDisplay}
              editingNCR={editingNCR}
              upgradeFromDefect={upgradeFromDefect}
              attachments={attachments}
              pendingFiles={pendingFiles}
              setFormData={setFormData}
              setPendingFiles={setPendingFiles}
            />

            {/* Close-out, Corrective Action & Responsible Sign-off */}
            <NCRSignoffSection
              formData={formData}
              managers={managers}
              selectedManagerUser={selectedManagerUser}
              sendNotification={sendNotification}
              setFormData={setFormData}
              setSendNotification={setSendNotification}
            />
          </div>

          {/* Form Action Controls */}
          <NCRActionsBar
            editingNCR={editingNCR}
            upgradeFromDefect={upgradeFromDefect}
            status={formData.status}
            isSubmitting={isSubmitting}
            onMarkClosed={handleMarkClosed}
            onVerify={handleVerify}
            onReopen={handleReopen}
            onResetForm={handleResetForm}
            onPrint={handlePrint}
            onClose={onClose}
          />
        </form>
      </div>
    </div>
  );
}
