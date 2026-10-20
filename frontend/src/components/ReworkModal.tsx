"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import styles from "./ReworkModal.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";
import { ReworkItem, SalesOrder, Machine, ReworkPartType, ReworkStatus, Defect } from "../types";
import { useUsers } from "../hooks/useUsers";

interface ReworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem?: ReworkItem | null;
  onSaved?: () => void;
  preselectedSalesOrderId?: string;
  preselectedMachineId?: string;
  preselectedDefectId?: string;
  initialDefect?: Defect | null;
}

export function ReworkModal({
  isOpen,
  onClose,
  editingItem,
  onSaved,
  preselectedSalesOrderId,
  preselectedMachineId,
  preselectedDefectId,
  initialDefect,
}: ReworkModalProps) {
  const { users } = useUsers();
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    sales_order_id: "",
    machine_id: "",
    defect_id: "",
    project_number: "",
    sub_assembly: "",
    part_number: "",
    description: "",
    revision: "A",
    material: "",
    qty: 1,
    part_type: "NEW" as ReworkPartType,
    mech_designer_id: "",
    pm_released_to_id: "",
    pdm_vault_released: false,
    reason_for_rework: "",
    date_released_to_mfg: "",
    requested_completion_date: "",
    pm_delivered_to: "",
    expected_completion_date: "",
    material_ordered_date: "",
    assigned_machinist_id: "",
    date_mfg_completed: "",
    part_given_to_or_left_at: "",
    estimated_hours: 0,
    actual_hours: 0,
    requires_outside_processing: false,
    outside_vendor: "",
    date_sent_for_processing: "",
    date_expected_from_processing: "",
    date_received_from_processing: "",
    kitting_delivered_to: "",
    status: "design_draft" as ReworkStatus,
    parts_collected_by_pm: false,
    assembler_id: "",
  });

  useAppHotkeys(
    "escape",
    () => {
      if (isOpen) onClose();
    },
    { enableOnFormTags: true },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    fetchApi<SalesOrder[]>("sales_orders")
      .then((data) => setSalesOrders(data || []))
      .catch((err) => console.error("Failed to load sales orders", err));

    fetchApi<Machine[]>("machines")
      .then((data) => setMachines(data || []))
      .catch((err) => console.error("Failed to load machines", err));

    if (editingItem) {
      setFormData({
        sales_order_id: editingItem.sales_order_id || "",
        machine_id: editingItem.machine_id || "",
        defect_id: editingItem.defect_id || "",
        project_number: editingItem.project_number || "",
        sub_assembly: editingItem.sub_assembly || "",
        part_number: editingItem.part_number || "",
        description: editingItem.description || "",
        revision: editingItem.revision || "A",
        material: editingItem.material || "",
        qty: editingItem.qty || 1,
        part_type: editingItem.part_type || "NEW",
        mech_designer_id: editingItem.mech_designer_id || "",
        pm_released_to_id: editingItem.pm_released_to_id || "",
        pdm_vault_released: editingItem.pdm_vault_released || false,
        reason_for_rework: editingItem.reason_for_rework || "",
        date_released_to_mfg: editingItem.date_released_to_mfg ? editingItem.date_released_to_mfg.split("T")[0] : "",
        requested_completion_date: editingItem.requested_completion_date || "",
        pm_delivered_to: editingItem.pm_delivered_to || "",
        expected_completion_date: editingItem.expected_completion_date || "",
        material_ordered_date: editingItem.material_ordered_date || "",
        assigned_machinist_id: editingItem.assigned_machinist_id || "",
        date_mfg_completed: editingItem.date_mfg_completed ? editingItem.date_mfg_completed.split("T")[0] : "",
        part_given_to_or_left_at: editingItem.part_given_to_or_left_at || "",
        estimated_hours: editingItem.estimated_hours || 0,
        actual_hours: editingItem.actual_hours || 0,
        requires_outside_processing: editingItem.requires_outside_processing || false,
        outside_vendor: editingItem.outside_vendor || "",
        date_sent_for_processing: editingItem.date_sent_for_processing || "",
        date_expected_from_processing: editingItem.date_expected_from_processing || "",
        date_received_from_processing: editingItem.date_received_from_processing || "",
        kitting_delivered_to: editingItem.kitting_delivered_to || "",
        status: editingItem.status || "design_draft",
        parts_collected_by_pm: editingItem.parts_collected_by_pm || false,
        assembler_id: editingItem.assembler_id || "",
      });
    } else {
      setFormData({
        sales_order_id: preselectedSalesOrderId || (initialDefect?.machine_id ? machines.find(m => m.id === initialDefect.machine_id)?.sales_order_id || "" : ""),
        machine_id: preselectedMachineId || initialDefect?.machine_id || "",
        defect_id: preselectedDefectId || initialDefect?.id || "",
        project_number: "",
        sub_assembly: "",
        part_number: "",
        description: initialDefect?.description ? `Rework: ${initialDefect.description}` : "",
        revision: "A",
        material: "",
        qty: 1,
        part_type: "NEW",
        mech_designer_id: "",
        pm_released_to_id: "",
        pdm_vault_released: false,
        reason_for_rework: initialDefect?.description ? `Escalated from Quality Issue: ${initialDefect.description}` : "",
        date_released_to_mfg: "",
        requested_completion_date: "",
        pm_delivered_to: "",
        expected_completion_date: "",
        material_ordered_date: "",
        assigned_machinist_id: "",
        date_mfg_completed: "",
        part_given_to_or_left_at: "",
        estimated_hours: 0,
        actual_hours: 0,
        requires_outside_processing: false,
        outside_vendor: "",
        date_sent_for_processing: "",
        date_expected_from_processing: "",
        date_received_from_processing: "",
        kitting_delivered_to: "",
        status: "design_draft",
        parts_collected_by_pm: false,
        assembler_id: "",
      });
    }
  }, [isOpen, editingItem, preselectedSalesOrderId, preselectedMachineId, preselectedDefectId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.part_number || !formData.description || !formData.material || !formData.reason_for_rework) {
      toast.error("Please fill in all required fields (Part Number, Description, Material, Reason for Rework)");
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingItem) {
        await fetchApi(`rework/items/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
        });
        toast.success("Rework item updated successfully");
      } else {
        await fetchApi("rework/items", {
          method: "POST",
          body: JSON.stringify(formData),
        });
        toast.success("Rework item logged successfully per SOP 1-003");
      }
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save rework item";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickStatus = async (targetStatus: ReworkStatus) => {
    if (!editingItem) return;
    try {
      setIsSubmitting(true);
      await fetchApi(`rework/items/${editingItem.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: targetStatus }),
      });
      toast.success(`Rework transitioned to ${targetStatus}`);
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <span className={styles.stampBadge}>REWORK SOP 1-003</span>
            <h2 className={styles.title}>
              {editingItem ? `Rework Part: ${editingItem.part_number} (Rev ${editingItem.revision})` : "Log Rework / Service Part"}
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className={styles.content}>
            {/* Step 1: Design Department */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>1. Design Department Procedure</h3>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Project (Sales Order) *</label>
                  <select
                    value={formData.sales_order_id}
                    onChange={(e) => {
                      const so = salesOrders.find((s) => s.id === e.target.value);
                      setFormData({
                        ...formData,
                        sales_order_id: e.target.value,
                        project_number: so?.internal_project_number || so?.po_number || formData.project_number,
                      });
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
                  <label>Machine / Station (Optional)</label>
                  <select
                    value={formData.machine_id}
                    onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
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
                  <label>Project Number & Letter *</label>
                  <input
                    type="text"
                    value={formData.project_number}
                    onChange={(e) => setFormData({ ...formData, project_number: e.target.value })}
                    placeholder="e.g. 1024A"
                    required
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Part Number *</label>
                  <input
                    type="text"
                    value={formData.part_number}
                    onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                    placeholder="e.g. VTR-1024-001"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>Revision *</label>
                  <input
                    type="text"
                    value={formData.revision}
                    onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                    placeholder="e.g. B"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>Work Type (NEW or MOD) *</label>
                  <select
                    value={formData.part_type}
                    onChange={(e) => setFormData({ ...formData, part_type: e.target.value as ReworkPartType })}
                  >
                    <option value="NEW">NEW (Make from scratch)</option>
                    <option value="MOD">MOD (Modify existing piece)</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.qty}
                    onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) || 1 })}
                    required
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Description *</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Part description from drawing"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>Material *</label>
                  <input
                    type="text"
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="e.g. 6061-T6 Aluminum, 304 SS, Delrin"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>Sub-Assembly</label>
                  <input
                    type="text"
                    value={formData.sub_assembly}
                    onChange={(e) => setFormData({ ...formData, sub_assembly: e.target.value })}
                    placeholder="e.g. Sub-Assy 02 Escapement"
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Mechanical Designer</label>
                  <select
                    value={formData.mech_designer_id}
                    onChange={(e) => setFormData({ ...formData, mech_designer_id: e.target.value })}
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
                  <label>Release To (PM or Plant Manager)</label>
                  <select
                    value={formData.pm_released_to_id}
                    onChange={(e) => setFormData({ ...formData, pm_released_to_id: e.target.value })}
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
                  <label>Estimated Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.estimated_hours}
                    onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>Reason for Rework *</label>
                <textarea
                  rows={2}
                  value={formData.reason_for_rework}
                  onChange={(e) => setFormData({ ...formData, reason_for_rework: e.target.value })}
                  placeholder="Explain why rework is required"
                  required
                />
              </div>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={formData.pdm_vault_released}
                  onChange={(e) => setFormData({ ...formData, pdm_vault_released: e.target.checked })}
                />
                Checked into SolidWorks PDM Vault & set to &quot;Released&quot; state for Machine Shop
              </label>
            </div>

            {/* Step 2: Project Management Procedure */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>2. Project Management Review</h3>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Date Released to Mfg</label>
                  <input
                    type="date"
                    value={formData.date_released_to_mfg}
                    onChange={(e) => setFormData({ ...formData, date_released_to_mfg: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label>Requested Completion (Mfg + PP)</label>
                  <input
                    type="date"
                    value={formData.requested_completion_date}
                    onChange={(e) => setFormData({ ...formData, requested_completion_date: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label>Delivered To (Mfg Lead)</label>
                  <input
                    type="text"
                    value={formData.pm_delivered_to}
                    onChange={(e) => setFormData({ ...formData, pm_delivered_to: e.target.value })}
                    placeholder="e.g. John Machining Lead"
                  />
                </div>
              </div>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={formData.parts_collected_by_pm}
                  onChange={(e) => setFormData({ ...formData, parts_collected_by_pm: e.target.checked })}
                />
                MOD parts removed/collected from Assembler and handed to Mfg with drawing
              </label>
            </div>

            {/* Step 3: Manufacturing Department Procedure */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>3. Manufacturing Department Execution</h3>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Expected Completion</label>
                  <input
                    type="date"
                    value={formData.expected_completion_date}
                    onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label>Material Ordered Date</label>
                  <input
                    type="date"
                    value={formData.material_ordered_date}
                    onChange={(e) => setFormData({ ...formData, material_ordered_date: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label>Assigned Machinist</label>
                  <select
                    value={formData.assigned_machinist_id}
                    onChange={(e) => setFormData({ ...formData, assigned_machinist_id: e.target.value })}
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
                  <label>Date Mfg Completed</label>
                  <input
                    type="date"
                    value={formData.date_mfg_completed}
                    onChange={(e) => setFormData({ ...formData, date_mfg_completed: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label>Part Given To / Left At</label>
                  <input
                    type="text"
                    value={formData.part_given_to_or_left_at}
                    onChange={(e) => setFormData({ ...formData, part_given_to_or_left_at: e.target.value })}
                    placeholder="e.g. PM Desk / Inspection Shelf"
                  />
                </div>

                <div className={styles.field}>
                  <label>Actual Machining Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.actual_hours}
                    onChange={(e) => setFormData({ ...formData, actual_hours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            {/* Step 4: Kitting & Outside Processing */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>4. Kitting / Outside Processing Procedure</h3>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={formData.requires_outside_processing}
                  onChange={(e) => setFormData({ ...formData, requires_outside_processing: e.target.checked })}
                />
                Requires Outside Processing (Anodize, Heat Treat, Black Oxide, Electropolish)
              </label>

              {formData.requires_outside_processing && (
                <div className={styles.row} style={{ marginTop: "0.5rem" }}>
                  <div className={styles.field}>
                    <label>Outside Vendor</label>
                    <input
                      type="text"
                      value={formData.outside_vendor}
                      onChange={(e) => setFormData({ ...formData, outside_vendor: e.target.value })}
                      placeholder="e.g. Apex Anodizing"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Date Sent</label>
                    <input
                      type="date"
                      value={formData.date_sent_for_processing}
                      onChange={(e) => setFormData({ ...formData, date_sent_for_processing: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Date Expected</label>
                    <input
                      type="date"
                      value={formData.date_expected_from_processing}
                      onChange={(e) => setFormData({ ...formData, date_expected_from_processing: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Date Received</label>
                    <input
                      type="date"
                      value={formData.date_received_from_processing}
                      onChange={(e) => setFormData({ ...formData, date_received_from_processing: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {editingItem && editingItem.status !== "complete" && (
                <>
                  <button
                    type="button"
                    className="vtr-btn"
                    onClick={() => handleQuickStatus("released_to_mfg")}
                    disabled={isSubmitting}
                  >
                    Release to Mfg
                  </button>
                  <button
                    type="button"
                    className="vtr-btn"
                    style={{ borderColor: "var(--vtr-theme-primary)", color: "var(--vtr-theme-primary)" }}
                    onClick={() => handleQuickStatus("complete")}
                    disabled={isSubmitting}
                  >
                    Move to COMPLETE Tab
                  </button>
                </>
              )}
            </div>

            <div className={styles.footerActions}>
              <button type="button" className="vtr-btn" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="vtr-btn vtr-btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : editingItem ? "Update Rework Item" : "Create Rework Item"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
