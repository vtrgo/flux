"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import styles from "./ReworkModal.module.css";
import { useAppHotkeys } from "../hooks/useAppHotkeys";
import { toast } from "sonner";
import {
  ReworkItem,
  SalesOrder,
  Machine,
  ReworkFormData,
  ReworkStatus,
  Defect,
} from "../types";
import { useUsers } from "../hooks/useUsers";
import {
  ReworkHeader,
  ReworkDesignSection,
  ReworkPMSection,
  ReworkManufacturingSection,
  ReworkProcessingSection,
  ReworkActionsBar,
} from "./rework";

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

const defaultFormData: ReworkFormData = {
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
  part_type: "NEW",
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
  status: "design_draft",
  parts_collected_by_pm: false,
  assembler_id: "",
};

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
  const [formData, setFormData] = useState<ReworkFormData>(defaultFormData);

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
        date_released_to_mfg: editingItem.date_released_to_mfg
          ? editingItem.date_released_to_mfg.split("T")[0]
          : "",
        requested_completion_date: editingItem.requested_completion_date || "",
        pm_delivered_to: editingItem.pm_delivered_to || "",
        expected_completion_date: editingItem.expected_completion_date || "",
        material_ordered_date: editingItem.material_ordered_date || "",
        assigned_machinist_id: editingItem.assigned_machinist_id || "",
        date_mfg_completed: editingItem.date_mfg_completed
          ? editingItem.date_mfg_completed.split("T")[0]
          : "",
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
        ...defaultFormData,
        sales_order_id:
          preselectedSalesOrderId ||
          (initialDefect?.machine_id
            ? machines.find((m) => m.id === initialDefect.machine_id)?.sales_order_id || ""
            : ""),
        machine_id: preselectedMachineId || initialDefect?.machine_id || "",
        defect_id: preselectedDefectId || initialDefect?.id || "",
        description: initialDefect?.description
          ? `Rework: ${initialDefect.description}`
          : "",
        reason_for_rework: initialDefect?.description
          ? `Escalated from Quality Issue: ${initialDefect.description}`
          : "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingItem, preselectedSalesOrderId, preselectedMachineId, preselectedDefectId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        !formData.part_number ||
        !formData.description ||
        !formData.material ||
        !formData.reason_for_rework
      ) {
        toast.error(
          "Please fill in all required fields (Part Number, Description, Material, Reason for Rework)"
        );
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
    },
    [editingItem, formData, onClose, onSaved]
  );

  const handleQuickStatus = useCallback(
    async (targetStatus: ReworkStatus) => {
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
    },
    [editingItem, onClose, onSaved]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <ReworkHeader editingItem={editingItem} onClose={onClose} />

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          <div className={styles.content}>
            <ReworkDesignSection
              formData={formData}
              setFormData={setFormData}
              salesOrders={salesOrders}
              machines={machines}
              users={users}
            />

            <ReworkPMSection formData={formData} setFormData={setFormData} />

            <ReworkManufacturingSection
              formData={formData}
              setFormData={setFormData}
              users={users}
            />

            <ReworkProcessingSection formData={formData} setFormData={setFormData} />
          </div>

          <ReworkActionsBar
            isEditing={Boolean(editingItem)}
            editingStatus={editingItem?.status}
            isSubmitting={isSubmitting}
            onClose={onClose}
            onQuickStatus={handleQuickStatus}
          />
        </form>
      </div>
    </div>
  );
}
