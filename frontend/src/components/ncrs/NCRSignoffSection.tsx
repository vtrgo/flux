"use client";

import React, { memo } from "react";
import { NCRFormData, User } from "../../types";
import { NotificationRoutingCheckbox } from "../NotificationRoutingCheckbox";
import { formatDepartmentName } from "../../lib/departments";
import styles from "../NCRModal.module.css";

interface NCRSignoffSectionProps {
  formData: NCRFormData;
  managers: User[];
  selectedManagerUser?: User;
  sendNotification: boolean;
  setFormData: React.Dispatch<React.SetStateAction<NCRFormData>>;
  setSendNotification: (val: boolean) => void;
}

export const NCRSignoffSection = memo(function NCRSignoffSection({
  formData,
  managers,
  selectedManagerUser,
  sendNotification,
  setFormData,
  setSendNotification,
}: NCRSignoffSectionProps) {
  return (
    <>
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
              setFormData((prev) => ({ ...prev, root_cause: e.target.value }))
            }
            placeholder="Why did this occur?"
            className={`${styles.textareaField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyBox}>{formData.root_cause || "—"}</div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label htmlFor="corrective_action" className={styles.label}>
            Correction Taken / Action Items
          </label>
          <textarea
            id="corrective_action"
            value={formData.corrective_action}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                corrective_action: e.target.value,
              }))
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
              setFormData((prev) => ({ ...prev, closeout_date: e.target.value }))
            }
            className={`${styles.inputField} ${styles.screenOnlyField}`}
          />
          <div className={styles.printOnlyField}>
            {formData.closeout_date || "____ / ____ / ________"}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="signature" className={styles.label}>
            Assigned Responsible Person (Manager / Admin Sign-off)
          </label>
          <select
            id="signature"
            value={formData.team_lead_signature}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                team_lead_signature: e.target.value,
              }))
            }
            className={`${styles.selectField} ${styles.screenOnlyField}`}
          >
            <option value="">-- Select Assigned Responsible Person --</option>
            {managers.map((mgr) => {
              const fullName =
                mgr.first_name && mgr.last_name
                  ? `${mgr.first_name} ${mgr.last_name}`
                  : mgr.username;
              return (
                <option key={mgr.id} value={fullName}>
                  {fullName}{" "}
                  {mgr.department ? `(${formatDepartmentName(mgr.department)})` : ""}
                </option>
              );
            })}
          </select>
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

      {/* Notification Routing */}
      <div className="no-print" style={{ margin: "1rem 0 0.5rem" }}>
        <NotificationRoutingCheckbox
          checked={sendNotification}
          onChange={setSendNotification}
          assignedUser={selectedManagerUser}
        />
      </div>
    </>
  );
});
