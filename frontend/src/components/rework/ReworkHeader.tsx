"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkItem } from "../../types";

interface ReworkHeaderProps {
  editingItem?: ReworkItem | null;
  onClose: () => void;
}

export const ReworkHeader = memo(function ReworkHeader({
  editingItem,
  onClose,
}: ReworkHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleArea}>
        <span className={styles.stampBadge}>REWORK SOP 1-003</span>
        <h2 className={styles.title}>
          {editingItem
            ? `Rework Part: ${editingItem.part_number} (Rev ${editingItem.revision})`
            : "Log Rework / Service Part"}
        </h2>
      </div>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
        &times;
      </button>
    </div>
  );
});
