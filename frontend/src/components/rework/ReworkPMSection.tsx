"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkFormData } from "../../types";

interface ReworkPMSectionProps {
  formData: ReworkFormData;
  setFormData: React.Dispatch<React.SetStateAction<ReworkFormData>>;
}

export const ReworkPMSection = memo(function ReworkPMSection({
  formData,
  setFormData,
}: ReworkPMSectionProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>2. Project Management Review</h3>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_date_released_to_mfg">Date Released to Mfg</label>
          <input
            id="rework_date_released_to_mfg"
            type="date"
            value={formData.date_released_to_mfg}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, date_released_to_mfg: e.target.value }))
            }
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_requested_completion_date">Requested Completion (Mfg + PP)</label>
          <input
            id="rework_requested_completion_date"
            type="date"
            value={formData.requested_completion_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, requested_completion_date: e.target.value }))
            }
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_pm_delivered_to">Delivered To (Mfg Lead)</label>
          <input
            id="rework_pm_delivered_to"
            type="text"
            value={formData.pm_delivered_to}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, pm_delivered_to: e.target.value }))
            }
            placeholder="e.g. John Machining Lead"
          />
        </div>
      </div>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={formData.parts_collected_by_pm}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, parts_collected_by_pm: e.target.checked }))
          }
        />
        MOD parts removed/collected from Assembler and handed to Mfg with drawing
      </label>
    </div>
  );
});
