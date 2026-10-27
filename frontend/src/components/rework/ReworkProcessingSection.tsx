"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkFormData } from "../../types";

interface ReworkProcessingSectionProps {
  formData: ReworkFormData;
  setFormData: React.Dispatch<React.SetStateAction<ReworkFormData>>;
}

export const ReworkProcessingSection = memo(function ReworkProcessingSection({
  formData,
  setFormData,
}: ReworkProcessingSectionProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>4. Kitting / Outside Processing Procedure</h3>
      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={formData.requires_outside_processing}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              requires_outside_processing: e.target.checked,
            }))
          }
        />
        Requires Outside Processing (Anodize, Heat Treat, Black Oxide, Electropolish)
      </label>

      {formData.requires_outside_processing && (
        <div className={styles.row} style={{ marginTop: "0.5rem" }}>
          <div className={styles.field}>
            <label htmlFor="rework_outside_vendor">Outside Vendor</label>
            <input
              id="rework_outside_vendor"
              type="text"
              value={formData.outside_vendor}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, outside_vendor: e.target.value }))
              }
              placeholder="e.g. Apex Anodizing"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rework_date_sent_for_processing">Date Sent</label>
            <input
              id="rework_date_sent_for_processing"
              type="date"
              value={formData.date_sent_for_processing}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, date_sent_for_processing: e.target.value }))
              }
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rework_date_expected_from_processing">Date Expected</label>
            <input
              id="rework_date_expected_from_processing"
              type="date"
              value={formData.date_expected_from_processing}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  date_expected_from_processing: e.target.value,
                }))
              }
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rework_date_received_from_processing">Date Received</label>
            <input
              id="rework_date_received_from_processing"
              type="date"
              value={formData.date_received_from_processing}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  date_received_from_processing: e.target.value,
                }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
});
