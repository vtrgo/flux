"use client";

import React, { memo } from "react";
import { NCR, Defect } from "../../types";
import { Authorize } from "../Authorize";
import { PrinterIcon } from "../ui/Icons";
import styles from "../NCRModal.module.css";

interface NCRActionsBarProps {
  editingNCR?: NCR | null;
  upgradeFromDefect?: Defect | null;
  status: string;
  isSubmitting: boolean;
  onMarkClosed: () => void;
  onVerify: () => void;
  onReopen: () => void;
  onResetForm: () => void;
  onPrint: () => void;
  onClose: () => void;
}

export const NCRActionsBar = memo(function NCRActionsBar({
  editingNCR,
  upgradeFromDefect,
  status,
  isSubmitting,
  onMarkClosed,
  onVerify,
  onReopen,
  onResetForm,
  onPrint,
  onClose,
}: NCRActionsBarProps) {
  return (
    <div className={`${styles.actions} ${styles.screenOnlyField} no-print`}>
      <div className={styles.leftActions}>
        <Authorize roles={["admin", "manager"]}>
          {editingNCR && status !== "fixed" && status !== "verified" && (
            <button
              type="button"
              className="vtr-btn"
              onClick={onMarkClosed}
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b",
                borderColor: "#f59e0b",
              }}
              title="Mark rework completed and set to Fixed"
            >
              Mark Fixed / Closed
            </button>
          )}
          {editingNCR && status !== "verified" && (
            <button
              type="button"
              className="vtr-btn"
              onClick={onVerify}
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                borderColor: "#10b981",
              }}
              title="Verify resolution and close out NCR"
            >
              Verify &amp; Sign Off
            </button>
          )}
        </Authorize>
        {editingNCR && status !== "open" && (
          <button
            type="button"
            className="vtr-btn vtr-btn-secondary"
            onClick={onReopen}
            title="Re-open this NCR"
          >
            Re-Open NCR
          </button>
        )}
      </div>

      <div className={styles.rightActions}>
        <button
          type="button"
          className="vtr-btn vtr-btn-secondary"
          onClick={onResetForm}
        >
          Reset Form
        </button>
        <button
          type="button"
          className="vtr-btn"
          onClick={onPrint}
          title="Print standard PDF report"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
        >
          <PrinterIcon size={14} /> Print / Save to PDF
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
            : upgradeFromDefect
            ? "Upgrade to NCR"
            : "Create NCR"}
        </button>
      </div>
    </div>
  );
});
