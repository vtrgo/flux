"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkFormData, User } from "../../types";

interface ReworkManufacturingSectionProps {
  formData: ReworkFormData;
  setFormData: React.Dispatch<React.SetStateAction<ReworkFormData>>;
  users: User[];
}

export const ReworkManufacturingSection = memo(function ReworkManufacturingSection({
  formData,
  setFormData,
  users,
}: ReworkManufacturingSectionProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>3. Manufacturing Department Execution</h3>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_expected_completion_date">Expected Completion</label>
          <input
            id="rework_expected_completion_date"
            type="date"
            value={formData.expected_completion_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, expected_completion_date: e.target.value }))
            }
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_material_ordered_date">Material Ordered Date</label>
          <input
            id="rework_material_ordered_date"
            type="date"
            value={formData.material_ordered_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, material_ordered_date: e.target.value }))
            }
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_assigned_machinist_id">Assigned Machinist</label>
          <select
            id="rework_assigned_machinist_id"
            value={formData.assigned_machinist_id}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, assigned_machinist_id: e.target.value }))
            }
          >
            <option value="">Select Machinist</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.role || u.department || "Machinist"})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_date_mfg_completed">Date Mfg Completed</label>
          <input
            id="rework_date_mfg_completed"
            type="date"
            value={formData.date_mfg_completed}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, date_mfg_completed: e.target.value }))
            }
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_part_given_to_or_left_at">Part Given To / Left At</label>
          <input
            id="rework_part_given_to_or_left_at"
            type="text"
            value={formData.part_given_to_or_left_at}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, part_given_to_or_left_at: e.target.value }))
            }
            placeholder="e.g. PM Desk / Inspection Shelf"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_actual_hours">Actual Machining Hours</label>
          <input
            id="rework_actual_hours"
            type="number"
            step="0.5"
            value={formData.actual_hours}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                actual_hours: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </div>
      </div>
    </div>
  );
});
