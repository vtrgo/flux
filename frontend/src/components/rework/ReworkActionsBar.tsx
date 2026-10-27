"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkStatus } from "../../types";

interface ReworkActionsBarProps {
  isEditing: boolean;
  editingStatus?: ReworkStatus;
  isSubmitting: boolean;
  onClose: () => void;
  onQuickStatus: (status: ReworkStatus) => void;
}

export const ReworkActionsBar = memo(function ReworkActionsBar({
  isEditing,
  editingStatus,
  isSubmitting,
  onClose,
  onQuickStatus,
}: ReworkActionsBarProps) {
  return (
    <div className={styles.footer}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {isEditing && editingStatus !== "complete" && (
          <>
            <button
              type="button"
              className="vtr-btn"
              onClick={() => onQuickStatus("released_to_mfg")}
              disabled={isSubmitting}
            >
              Release to Mfg
            </button>
            <button
              type="button"
              className="vtr-btn"
              style={{
                borderColor: "var(--vtr-theme-primary)",
                color: "var(--vtr-theme-primary)",
              }}
              onClick={() => onQuickStatus("complete")}
              disabled={isSubmitting}
            >
              Move to COMPLETE Tab
            </button>
          </>
        )}
      </div>

      <div className={styles.footerActions}>
        <button
          type="button"
          className="vtr-btn"
          onClick={onClose}
          disabled={isSubmitting}
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
            : isEditing
            ? "Update Rework Item"
            : "Create Rework Item"}
        </button>
      </div>
    </div>
  );
});
