"use client";

import React, { memo } from "react";
import styles from "../NCRModal.module.css";

interface NCRHeaderProps {
  status: string;
  onClose: () => void;
}

export const NCRHeader = memo(function NCRHeader({ status, onClose }: NCRHeaderProps) {
  return (
    <div className={styles.formHeader}>
      <div className={styles.logoArea}>
        <img
          src="/assets/VTR LOGO-Turquoise.png"
          alt="VTR Feeder Solutions Logo"
          className={styles.logoImage}
        />
      </div>
      <div className={styles.headerRightArea}>
        <div className={styles.headerText}>
          <h2 className={styles.headerTitle}>Fabricated Components</h2>
          <h3 className={styles.headerSubtitle}>Non-Conformance Report</h3>
          <div
            className={styles.printOnlyField}
            style={{ marginTop: "6px", fontWeight: 700, textTransform: "uppercase", color: "#006680" }}
          >
            STATUS:{" "}
            {status === "verified"
              ? "VERIFIED & CLEARED"
              : status === "fixed"
              ? "FIXED / PENDING VERIFICATION"
              : "OPEN"}
          </div>
        </div>
        <button
          type="button"
          className={`${styles.closeBtn} ${styles.screenOnlyField}`}
          onClick={onClose}
          aria-label="Close modal"
          title="Close (Esc)"
        >
          &times;
        </button>
      </div>
    </div>
  );
});
