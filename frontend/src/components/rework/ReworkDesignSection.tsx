"use client";

import React, { memo } from "react";
import styles from "../ReworkModal.module.css";
import { ReworkFormData, SalesOrder, Machine, ReworkPartType, User } from "../../types";

interface ReworkDesignSectionProps {
  formData: ReworkFormData;
  setFormData: React.Dispatch<React.SetStateAction<ReworkFormData>>;
  salesOrders: SalesOrder[];
  machines: Machine[];
  users: User[];
}

export const ReworkDesignSection = memo(function ReworkDesignSection({
  formData,
  setFormData,
  salesOrders,
  machines,
  users,
}: ReworkDesignSectionProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>1. Design Department Procedure</h3>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_sales_order_id">Project (Sales Order) *</label>
          <select
            id="rework_sales_order_id"
            value={formData.sales_order_id}
            onChange={(e) => {
              const so = salesOrders.find((s) => s.id === e.target.value);
              setFormData((prev) => ({
                ...prev,
                sales_order_id: e.target.value,
                project_number: so?.internal_project_number || so?.po_number || prev.project_number,
              }));
            }}
            required
          >
            <option value="">Select Project</option>
            {salesOrders.map((so) => (
              <option key={so.id} value={so.id}>
                {so.customer_name} - {so.project_name || so.internal_project_number || so.po_number}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_machine_id">Machine / Station (Optional)</label>
          <select
            id="rework_machine_id"
            value={formData.machine_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, machine_id: e.target.value }))}
          >
            <option value="">Select Station (or Project Shared)</option>
            {machines
              .filter((m) => !formData.sales_order_id || m.sales_order_id === formData.sales_order_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.order_number} ({m.model_type})
                </option>
              ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_project_number">Project Number & Letter *</label>
          <input
            id="rework_project_number"
            type="text"
            value={formData.project_number}
            onChange={(e) => setFormData((prev) => ({ ...prev, project_number: e.target.value }))}
            placeholder="e.g. 1024A"
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_part_number">Part Number *</label>
          <input
            id="rework_part_number"
            type="text"
            value={formData.part_number}
            onChange={(e) => setFormData((prev) => ({ ...prev, part_number: e.target.value }))}
            placeholder="e.g. VTR-1024-001"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_revision">Revision *</label>
          <input
            id="rework_revision"
            type="text"
            value={formData.revision}
            onChange={(e) => setFormData((prev) => ({ ...prev, revision: e.target.value }))}
            placeholder="e.g. B"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_part_type">Work Type (NEW or MOD) *</label>
          <select
            id="rework_part_type"
            value={formData.part_type}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, part_type: e.target.value as ReworkPartType }))
            }
          >
            <option value="NEW">NEW (Make from scratch)</option>
            <option value="MOD">MOD (Modify existing piece)</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_qty">Quantity *</label>
          <input
            id="rework_qty"
            type="number"
            min="1"
            value={formData.qty}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, qty: parseInt(e.target.value) || 1 }))
            }
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_description">Description *</label>
          <input
            id="rework_description"
            type="text"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Part description from drawing"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_material">Material *</label>
          <input
            id="rework_material"
            type="text"
            value={formData.material}
            onChange={(e) => setFormData((prev) => ({ ...prev, material: e.target.value }))}
            placeholder="e.g. 6061-T6 Aluminum, 304 SS, Delrin"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_sub_assembly">Sub-Assembly</label>
          <input
            id="rework_sub_assembly"
            type="text"
            value={formData.sub_assembly}
            onChange={(e) => setFormData((prev) => ({ ...prev, sub_assembly: e.target.value }))}
            placeholder="e.g. Sub-Assy 02 Escapement"
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="rework_mech_designer_id">Mechanical Designer</label>
          <select
            id="rework_mech_designer_id"
            value={formData.mech_designer_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, mech_designer_id: e.target.value }))}
          >
            <option value="">Select Designer</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.role || u.department || "User"})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_pm_released_to_id">Release To (PM or Plant Manager)</label>
          <select
            id="rework_pm_released_to_id"
            value={formData.pm_released_to_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, pm_released_to_id: e.target.value }))}
          >
            <option value="">Select PM</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.role || u.department || "PM"})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="rework_estimated_hours">Estimated Hours</label>
          <input
            id="rework_estimated_hours"
            type="number"
            step="0.5"
            value={formData.estimated_hours}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                estimated_hours: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="rework_reason_for_rework">Reason for Rework *</label>
        <textarea
          id="rework_reason_for_rework"
          rows={2}
          value={formData.reason_for_rework}
          onChange={(e) => setFormData((prev) => ({ ...prev, reason_for_rework: e.target.value }))}
          placeholder="Explain why rework is required"
          required
        />
      </div>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={formData.pdm_vault_released}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, pdm_vault_released: e.target.checked }))
          }
        />
        Checked into SolidWorks PDM Vault &amp; set to &quot;Released&quot; state for Machine Shop
      </label>
    </div>
  );
});
