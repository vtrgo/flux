"use client";

import React, { useState, useEffect, useMemo, useId } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../contexts/AuthContext";
import { useTimesheetData } from "../../../hooks/useTimesheetData";
import { WeeklyTimesheetGrid } from "../../../components/WeeklyTimesheetGrid";
import { TimesheetApprovalsTable } from "../../../components/TimesheetApprovalsTable";
import { Machine, CreateProjectTaskRequest, CreateDepartmentTaskRequest, ProjectTask, LaborCorrelationItem } from "../../../types";
import { fetchApi } from "../../../lib/api";
import styles from "./timesheet.module.css";

const DEPARTMENTS = [
  { id: "assembly", label: "Assembly" },
  { id: "controls", label: "Electrical / Controls" },
  { id: "machine-shop", label: "Machine Shop" },
  { id: "laser", label: "Laser" },
  { id: "design", label: "Design" },
  { id: "enclosures", label: "Enclosures" },
  { id: "kitting", label: "Kitting" },
  { id: "quality", label: "Quality / FAT" },
];

export default function TimesheetPage() {
  const customTaskNameId = useId();
  const customDeptId = useId();
  const customQuoteId = useId();
  const newDeptId = useId();
  const newCodeId = useId();
  const newNameId = useId();
  const newHoursId = useId();
  const tableFilterId = useId();
  const { user, isAdmin, hasRole } = useAuth();
  const isLeadOrManager = isAdmin || hasRole(["manager", "lead", "sales"]);

  const [activeTab, setActiveTab] = useState<"my_time" | "project_variance" | "dept_catalog" | "approvals">("my_time");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  // Unified Department Scope across Project Quoting View
  const [projectDept, setProjectDept] = useState<string>("all");
  const [targetQuotingDept, setTargetQuotingDept] = useState<string>("assembly");
  const effectiveQuotingDept = projectDept !== "all" ? projectDept : targetQuotingDept;

  const [selectedCatalogTaskId, setSelectedCatalogTaskId] = useState<string>("");
  const [customTaskName, setCustomTaskName] = useState("");
  const [taskQuotedHours, setTaskQuotedHours] = useState<string>("20.0");
  const [addingTask, setAddingTask] = useState(false);

  // Editing existing task quote state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editQuoteVal, setEditQuoteVal] = useState<string>("");

  // Department Catalog Management State
  const [selectedCatalogDept, setSelectedCatalogDept] = useState<string>("assembly");
  const [newDeptTaskCode, setNewDeptTaskCode] = useState("");
  const [newDeptTaskName, setNewDeptTaskName] = useState("");
  const [newDeptDescription, setNewDeptDescription] = useState("");
  const [newDeptDefaultQuote, setNewDeptDefaultQuote] = useState("10.0");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [addingDeptTask, setAddingDeptTask] = useState(false);
  const [editingDeptTaskId, setEditingDeptTaskId] = useState<string | null>(null);
  const [editDeptQuoteVal, setEditDeptQuoteVal] = useState<string>("");

  const {
    myEntries,
    machineSummary,
    correlationReport,
    departmentTasks,
    loading,
    deleteEntry,
    createOrUpdateTask,
    updateTaskQuote,
    fetchMachineLaborCorrelation,
    fetchDepartmentTasks,
    createDepartmentTask,
    updateDepartmentTask,
    deleteDepartmentTask,
  } = useTimesheetData(selectedMachineId);

  // Load machines
  useEffect(() => {
    fetchApi<Machine[]>("machines")
      .then((data) => {
        setMachines(data || []);
        if (data && data.length > 0 && !selectedMachineId) {
          setSelectedMachineId(data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load machines", err));
  }, [selectedMachineId]);

  // Load department catalog when tab is opened
  useEffect(() => {
    if (activeTab === "dept_catalog") {
      fetchDepartmentTasks();
      if (projectDept !== "all") {
        setSelectedCatalogDept(projectDept);
      }
    }
  }, [activeTab, fetchDepartmentTasks, projectDept]);

  // Sync selected catalog task default quote
  useEffect(() => {
    if (selectedCatalogTaskId && selectedCatalogTaskId !== "custom") {
      const found = departmentTasks.find(t => t.id === selectedCatalogTaskId);
      if (found) {
        setTaskQuotedHours(found.default_quoted_hours.toString());
      }
    }
  }, [selectedCatalogTaskId, departmentTasks]);

  // Distilled core tasks for the effective quoting department
  const distilledQuotingTasks = useMemo(() => {
    return departmentTasks.filter(t => t.department === effectiveQuotingDept && t.is_active);
  }, [departmentTasks, effectiveQuotingDept]);

  // Filtered machine tasks for the active machine's variance table based on project-level scope
  const filteredMachineTasks = useMemo(() => {
    if (!machineSummary || !machineSummary.tasks) return [];
    if (projectDept === "all") return machineSummary.tasks;
    return machineSummary.tasks.filter(t => t.department === projectDept);
  }, [machineSummary, projectDept]);

  // Correlated tasks for the active machine
  const correlatedTasks = useMemo(() => {
    if (!correlationReport || !correlationReport.tasks) return null;
    if (projectDept === "all") return correlationReport.tasks;
    return correlationReport.tasks.filter(t => t.department.toLowerCase() === projectDept.toLowerCase());
  }, [correlationReport, projectDept]);

  const hasAnyMachineTasks = useMemo(() => {
    return Boolean(
      (correlationReport?.tasks && correlationReport.tasks.length > 0) ||
      (machineSummary?.tasks && machineSummary.tasks.length > 0)
    );
  }, [correlationReport, machineSummary]);

  // Filtered department tasks for catalog view with search filter
  const filteredDeptTasks = useMemo(() => {
    return departmentTasks.filter(t => {
      const matchesDept = t.department === selectedCatalogDept;
      if (!matchesDept) return false;
      if (!catalogSearchQuery.trim()) return true;
      const q = catalogSearchQuery.toLowerCase();
      return (
        t.task_name.toLowerCase().includes(q) ||
        t.task_code.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    });
  }, [departmentTasks, selectedCatalogDept, catalogSearchQuery]);

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineId) {
      toast.error("Please select a machine first");
      return;
    }

    const hours = parseFloat(taskQuotedHours);
    if (isNaN(hours) || hours < 0) {
      toast.error("Quoted hours cannot be negative");
      return;
    }

    let code = "";
    let name = "";
    const dept = effectiveQuotingDept;

    if (selectedCatalogTaskId === "custom") {
      if (!customTaskName.trim()) {
        toast.error("Please enter a custom task name");
        return;
      }
      name = customTaskName.trim();
      code = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    } else {
      const item = departmentTasks.find(t => t.id === selectedCatalogTaskId);
      if (item) {
        code = item.task_code;
        name = item.task_name;
      } else {
        toast.error("Please select a task from the distilled catalog or choose custom");
        return;
      }
    }

    try {
      setAddingTask(true);
      const req: CreateProjectTaskRequest = {
        task_id: selectedCatalogTaskId !== "custom" ? selectedCatalogTaskId : undefined,
        task_code: code,
        task_name: name,
        department: dept,
        quoted_hours: hours,
      };
      await createOrUpdateTask(selectedMachineId, req);
      await fetchMachineLaborCorrelation(selectedMachineId);
      toast.success(`Task "${name}" added to ${dept} with ${hours} quoted hours!`);
      setIsAddTaskOpen(false);
      setCustomTaskName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add task";
      toast.error(message);
    } finally {
      setAddingTask(false);
    }
  };

  const handlePopulateDeptDefaults = async (dept: string) => {
    if (!selectedMachineId) {
      toast.error("Please select a machine first");
      return;
    }
    const deptItems = departmentTasks.filter(t => t.department === dept && t.is_active);
    if (deptItems.length === 0) {
      toast.error(`No core tasks found for department ${dept}`);
      return;
    }

    try {
      for (const t of deptItems) {
        await createOrUpdateTask(selectedMachineId, {
          task_id: t.id,
          task_code: t.task_code,
          task_name: t.task_name,
          department: t.department,
          quoted_hours: t.default_quoted_hours,
        });
      }
      await fetchMachineLaborCorrelation(selectedMachineId);
      toast.success(`Populated ${deptItems.length} default tasks for ${dept}!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to populate default tasks";
      toast.error(message);
    }
  };

  const handleSaveQuoteEdit = async (taskId: string) => {
    const hours = parseFloat(editQuoteVal);
    if (isNaN(hours) || hours < 0) {
      toast.error("Quoted hours must be 0 or greater");
      return;
    }

    try {
      await updateTaskQuote(taskId, { quoted_hours: hours });
      await fetchMachineLaborCorrelation(selectedMachineId);
      toast.success("Quoted hours updated");
      setEditingTaskId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update quote";
      toast.error(message);
    }
  };

  const handleAddDeptTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = parseFloat(newDeptDefaultQuote);
    if (isNaN(hours) || hours < 0) {
      toast.error("Default quoted hours cannot be negative");
      return;
    }
    if (!newDeptTaskCode.trim() || !newDeptTaskName.trim()) {
      toast.error("Task code and task name are required");
      return;
    }

    try {
      setAddingDeptTask(true);
      const req: CreateDepartmentTaskRequest = {
        department: selectedCatalogDept,
        task_code: newDeptTaskCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "_"),
        task_name: newDeptTaskName.trim(),
        description: newDeptDescription.trim() || undefined,
        default_quoted_hours: hours,
      };
      await createDepartmentTask(req);
      toast.success(`Core task "${req.task_name}" added to ${selectedCatalogDept}`);
      setNewDeptTaskCode("");
      setNewDeptTaskName("");
      setNewDeptDescription("");
      setNewDeptDefaultQuote("10.0");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add department task";
      toast.error(message);
    } finally {
      setAddingDeptTask(false);
    }
  };

  const handleRetireDeptTask = async (id: string, name: string) => {
    if (!window.confirm(`Retire core task "${name}"? It will no longer appear for future quotes, but historical records will be preserved.`)) {
      return;
    }
    try {
      await deleteDepartmentTask(id);
      toast.success(`Task "${name}" retired from catalog`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retire task";
      toast.error(message);
    }
  };

  const handleSaveDeptQuoteEdit = async (deptTaskId: string) => {
    const hours = parseFloat(editDeptQuoteVal);
    if (isNaN(hours) || hours < 0) {
      toast.error("Default quoted hours must be 0 or greater");
      return;
    }

    try {
      await updateDepartmentTask(deptTaskId, { default_quoted_hours: hours });
      toast.success("Default quoted hours updated");
      setEditingDeptTaskId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update default quote";
      toast.error(message);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1>
            <span>⏱️</span> Timesheet & Quoting Hub
          </h1>
          <p>Universal labor tracking connecting Production Quoting, SOP 1-003 Rework, and Defect Resolution</p>
        </div>

        <div className={styles.actions}>
          {/* View Mode Toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${activeTab === "my_time" ? styles.toggleBtnActive : ""}`}
              onClick={() => setActiveTab("my_time")}
            >
              👤 Weekly Timesheet
            </button>
            <button
              className={`${styles.toggleBtn} ${activeTab === "project_variance" ? styles.toggleBtnActive : ""}`}
              onClick={() => setActiveTab("project_variance")}
            >
              📊 Quoting & Variance
            </button>
            {isLeadOrManager && (
              <>
                <button
                  className={`${styles.toggleBtn} ${activeTab === "dept_catalog" ? styles.toggleBtnActive : ""}`}
                  onClick={() => setActiveTab("dept_catalog")}
                >
                  🏢 Department Tasks
                </button>
                <button
                  className={`${styles.toggleBtn} ${activeTab === "approvals" ? styles.toggleBtnActive : ""}`}
                  onClick={() => setActiveTab("approvals")}
                >
                  ✅ Approvals
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: WEEKLY TIMESHEET (Worker View) */}
      {activeTab === "my_time" && (
        <WeeklyTimesheetGrid
          machines={machines}
          departmentTasks={departmentTasks}
          userDepartment={user?.department}
        />
      )}

      {/* TAB 2: PROJECT QUOTING & VARIANCE (Lead / PM View) */}
      {activeTab === "project_variance" && (
        <>
          {/* Machine & Department Scope Project Bar */}
          <div className={styles.cardHeader} style={{ background: "var(--vtr-theme-surface, #1e1e1e)", borderRadius: "8px", border: "1px solid var(--border-color, #333)", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="activeMachineSelect" style={{ fontWeight: 700, fontSize: "0.95rem" }}>Active Machine:</label>
                <select
                  id="activeMachineSelect"
                  style={{ padding: "0.5rem 0.85rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff", minWidth: "240px" }}
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.order_number} ({m.model_type})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="projectDeptSelect" style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>Department Scope:</label>
                <select
                  id="projectDeptSelect"
                  style={{ padding: "0.5rem 0.85rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff", minWidth: "220px" }}
                  value={projectDept}
                  onChange={(e) => {
                    const next = e.target.value;
                    setProjectDept(next);
                    if (next !== "all") {
                      setTargetQuotingDept(next);
                      setSelectedCatalogDept(next);
                    }
                  }}
                >
                  <option value="all">All Departments ({machineSummary?.tasks?.length || 0})</option>
                  {DEPARTMENTS.map((d) => {
                    const count = machineSummary?.tasks?.filter((t) => t.department === d.id).length || 0;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.label} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {isLeadOrManager && (
              <button
                className="vtr-btn vtr-btn-secondary"
                onClick={() => setIsAddTaskOpen(!isAddTaskOpen)}
              >
                {isAddTaskOpen ? "Close Task Form" : "+ Assign Task to Project"}
              </button>
            )}
          </div>

          {/* KPI Dashboard from Labor Correlation */}
          {(() => {
            const isCorrelationValid = Boolean(
              correlationReport &&
              !Array.isArray(correlationReport) &&
              Array.isArray(correlationReport.tasks)
            );
            const totalAssigned = isCorrelationValid ? (correlationReport?.total_assigned_hours ?? 0) : (machineSummary?.total_quoted_hours ?? 0);
            const totalConsumed = isCorrelationValid ? (correlationReport?.total_consumed_hours ?? 0) : (machineSummary?.total_actual_hours ?? 0);
            const variance = isCorrelationValid ? (correlationReport?.net_variance ?? (totalConsumed - totalAssigned)) : (totalConsumed - totalAssigned);
            const pct = totalAssigned > 0 ? (totalConsumed / totalAssigned) * 100 : (totalConsumed > 0 ? 100 : 0);
            const unbudgetedTasks = isCorrelationValid ? (correlationReport?.tasks ?? []).filter(t => t.status === "unbudgeted") : [];
            const unbudgetedHours = unbudgetedTasks.reduce((sum, t) => sum + (t.consumed_hours ?? 0), 0);

            return (
              <>
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Hours Assigned (Budget)</span>
                    <span className={styles.kpiValue}>
                      {totalAssigned.toFixed(1)}h
                    </span>
                    <span className={styles.kpiSub}>Independent Quoting Target</span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Hours Consumed (Actual)</span>
                    <span className={styles.kpiValue} style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>
                      {totalConsumed.toFixed(1)}h
                    </span>
                    <span className={styles.kpiSub}>Captured from Timesheets</span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Labor Variance</span>
                    <span className={`${styles.kpiValue} ${variance > 0 ? styles.variancePositive : styles.varianceNegative}`}>
                      {variance > 0 ? `+${variance.toFixed(1)}h` : `${variance.toFixed(1)}h`}
                    </span>
                    <span className={styles.kpiSub}>
                      {variance > 0 ? "Over Quoted Hours" : "Within Quoted Budget"}
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Budget Burn Rate</span>
                    <span className={styles.kpiValue}>{pct.toFixed(0)}%</span>
                    <div className={styles.progressBarBg}>
                      <div
                        className={`${styles.progressBarFill} ${
                          pct > 100 ? styles.progressRed : pct >= 85 ? styles.progressYellow : styles.progressGreen
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Unbudgeted Labor Alert Banner */}
                {unbudgetedTasks.length > 0 && (
                  <div style={{
                    background: "rgba(255, 112, 67, 0.12)",
                    border: "1px solid rgba(255, 112, 67, 0.4)",
                    borderRadius: "8px",
                    padding: "0.85rem 1.25rem",
                    color: "#ff7043",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.75rem"
                  }}>
                    <span>
                      ⚠️ <strong>Unbudgeted Labor Detected:</strong>{" "}
                      {unbudgetedHours.toFixed(1)} hours logged across {unbudgetedTasks.length} tasks without assigned project budgets.
                    </span>
                    {isLeadOrManager && (
                      <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                        Click &ldquo;+ Assign Budget&rdquo; in the table below to allocate budgeted hours.
                      </span>
                    )}
                  </div>
                )}

                {/* Department Breakdown Rollup Cards */}
                {projectDept === "all" && isCorrelationValid && correlationReport?.department_breakdown && Object.keys(correlationReport.department_breakdown).length > 0 && (
                  <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
                    {Object.values(correlationReport.department_breakdown).map((dept) => (
                      <div
                        key={dept.department}
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid #333",
                          borderRadius: "6px",
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.8rem",
                          minWidth: "155px"
                        }}
                      >
                        <div style={{ fontWeight: 700, textTransform: "capitalize", color: "var(--vtr-theme-primary, #00e5ff)", marginBottom: "0.2rem" }}>
                          {dept.department}
                        </div>
                        <div style={{ color: "#aaa" }}>Budget: <strong style={{ color: "#fff" }}>{(dept.assigned_hours ?? 0).toFixed(1)}h</strong></div>
                        <div style={{ color: "#aaa" }}>Actual: <strong style={{ color: "#00e5ff" }}>{(dept.consumed_hours ?? 0).toFixed(1)}h</strong></div>
                        <div style={{ color: (dept.variance ?? 0) > 0 ? "var(--accent-red, #ff4444)" : "var(--accent-green, #00e676)", fontWeight: 700 }}>
                          Variance: {(dept.variance ?? 0) > 0 ? `+${(dept.variance ?? 0).toFixed(1)}h` : `${(dept.variance ?? 0).toFixed(1)}h`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* Add Quoted Task Sub-panel */}
          {isAddTaskOpen && isLeadOrManager && (
            <div className={styles.contentCard} style={{ border: "1px solid var(--vtr-theme-primary, #00e5ff)", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
                  Assign Tasks to Machine {machineSummary?.order_number}
                </h3>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                  Target Department: <strong style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>
                    {DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label || effectiveQuotingDept}
                  </strong>
                </span>
              </div>

              <form onSubmit={handleAddTaskSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
                {projectDept === "all" ? (
                  <div>
                    <label htmlFor={customDeptId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                      Target Department *
                    </label>
                    <select
                      id={customDeptId}
                      style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                      value={targetQuotingDept}
                      onChange={(e) => {
                        const nextDept = e.target.value;
                        setTargetQuotingDept(nextDept);
                        const tasksInNextDept = departmentTasks.filter(t => t.department === nextDept && t.is_active);
                        if (tasksInNextDept.length > 0) {
                          setSelectedCatalogTaskId(tasksInNextDept[0].id);
                          setTaskQuotedHours(tasksInNextDept[0].default_quoted_hours.toString());
                        } else {
                          setSelectedCatalogTaskId("");
                          setTaskQuotedHours("10.0");
                        }
                        setCustomTaskName("");
                      }}
                    >
                      {DEPARTMENTS.map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                      Target Department
                    </label>
                    <div style={{ padding: "0.5rem", background: "rgba(255,255,255,0.05)", border: "1px solid #444", borderRadius: "4px", color: "var(--vtr-theme-primary, #00e5ff)", fontWeight: 700, fontSize: "0.9rem" }}>
                      {DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label}
                    </div>
                  </div>
                )}

                {/* Distilled Tasks for the Selected Department */}
                <div>
                  <label htmlFor="distilledTaskSelect" style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                    Distilled {DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label} Tasks *
                  </label>
                  <select
                    id="distilledTaskSelect"
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={selectedCatalogTaskId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCatalogTaskId(val);
                      if (val && val !== "custom") {
                        const found = departmentTasks.find(t => t.id === val);
                        if (found) setTaskQuotedHours(found.default_quoted_hours.toString());
                      }
                    }}
                    required
                  >
                    <option value="">-- Choose a {DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label} Task --</option>
                    {distilledQuotingTasks.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.task_name} (Default: {cat.default_quoted_hours}h)
                      </option>
                    ))}
                    <option value="custom">-- Custom One-Off Task --</option>
                  </select>
                </div>

                {selectedCatalogTaskId === "custom" && (
                  <div>
                    <label htmlFor={customTaskNameId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                      Custom Task Name *
                    </label>
                    <input
                      id={customTaskNameId}
                      type="text"
                      placeholder="e.g. Special Fitment Operation"
                      style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                      value={customTaskName}
                      onChange={(e) => setCustomTaskName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor={customQuoteId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem", fontWeight: 700 }}>
                    Quoted Hours *
                  </label>
                  <input
                    id={customQuoteId}
                    type="number"
                    step="0.5"
                    min="0"
                    style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                    value={taskQuotedHours}
                    onChange={(e) => setTaskQuotedHours(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="vtr-btn vtr-btn-primary" disabled={addingTask} style={{ flex: 1 }}>
                    {addingTask ? "Saving..." : "Save Quoted Task"}
                  </button>
                  <button
                    type="button"
                    className="vtr-btn vtr-btn-secondary"
                    onClick={() => handlePopulateDeptDefaults(effectiveQuotingDept)}
                    title={`Add all active core tasks from ${DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label} to machine`}
                  >
                    + Add All {DEPARTMENTS.find(d => d.id === effectiveQuotingDept)?.label} Tasks
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quoted Tasks vs Actuals Table */}
          <div className={styles.contentCard}>
            <div className={styles.cardHeader} style={{ flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 className={styles.cardTitle}>
                  <span>⚙️</span> Task Allocation & Variance Breakdown: {machineSummary?.order_number}
                </h2>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                  Model: <strong>{machineSummary?.model_type}</strong> | Department Scope:{" "}
                  <strong style={{ color: "var(--vtr-theme-primary, #00e5ff)" }}>
                    {projectDept === "all"
                      ? `All Departments (${(correlatedTasks || filteredMachineTasks).length} tasks)`
                      : `${DEPARTMENTS.find((d) => d.id === projectDept)?.label} (${(correlatedTasks || filteredMachineTasks).length} tasks)`}
                  </strong>
                </span>
              </div>
              {projectDept !== "all" && (
                <button
                  className="vtr-btn vtr-btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                  onClick={() => setProjectDept("all")}
                >
                  Show All Departments
                </button>
              )}
            </div>

            <div className={styles.tableWrapper}>
              {!hasAnyMachineTasks ? (
                <div className={styles.emptyState}>
                  <p>No tasks quoted or logged for this machine yet.</p>
                  {isLeadOrManager && (
                    <button className="vtr-btn vtr-btn-primary" onClick={() => setIsAddTaskOpen(true)}>
                      + Establish Quoted Tasks for this Machine
                    </button>
                  )}
                </div>
              ) : (correlatedTasks ? correlatedTasks.length === 0 : filteredMachineTasks.length === 0) ? (
                <div className={styles.emptyState}>
                  <p>No tasks quoted for {DEPARTMENTS.find((d) => d.id === projectDept)?.label || projectDept}.</p>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
                    {isLeadOrManager && (
                      <button
                        className="vtr-btn vtr-btn-primary"
                        onClick={() => handlePopulateDeptDefaults(projectDept)}
                      >
                        + Add All {DEPARTMENTS.find((d) => d.id === projectDept)?.label} Tasks
                      </button>
                    )}
                    <button className="vtr-btn vtr-btn-secondary" onClick={() => setProjectDept("all")}>
                      Show All Departments
                    </button>
                  </div>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Task Name</th>
                      <th>Department</th>
                      <th>Assigned Hours</th>
                      <th>Consumed Hours</th>
                      <th>Variance (+/-)</th>
                      <th>Budget Progress</th>
                      <th>Status</th>
                      {isLeadOrManager && <th>Quote Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(correlatedTasks || filteredMachineTasks).map((taskItem) => {
                      const isCorrelated = "assigned_hours" in taskItem;
                      const correlationItem = isCorrelated ? (taskItem as LaborCorrelationItem) : null;
                      const projectTask = !isCorrelated ? (taskItem as ProjectTask) : null;
                      const projectTaskId = correlationItem ? correlationItem.project_task_id : projectTask?.id;
                      const taskId = projectTaskId || (correlationItem ? correlationItem.task_code : projectTask?.task_code);
                      const taskName = taskItem.task_name;
                      const taskCode = taskItem.task_code;
                      const department = taskItem.department;
                      const assignedHours = correlationItem ? (correlationItem.assigned_hours ?? 0) : (projectTask?.quoted_hours ?? 0);
                      const consumedHours = correlationItem ? (correlationItem.consumed_hours ?? 0) : (projectTask?.actual_hours ?? 0);
                      const variance = correlationItem ? (correlationItem.variance ?? 0) : (projectTask?.variance ?? 0);
                      const burnPct = correlationItem ? (correlationItem.burn_percentage ?? 0) : (assignedHours > 0 ? (consumedHours / assignedHours) * 100 : 0);
                      const status = correlationItem ? correlationItem.status : (projectTask?.status || "open");

                      let progressClass = styles.progressGreen;
                      if (burnPct >= 100) progressClass = styles.progressRed;
                      else if (burnPct >= 85) progressClass = styles.progressYellow;

                      const isEditing = editingTaskId === taskId;

                      return (
                        <tr key={taskId || taskCode}>
                          <td>
                            <strong>{taskName}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>{taskCode}</div>
                          </td>
                          <td style={{ textTransform: "capitalize" }}>{department}</td>
                          <td>
                            {isEditing && projectTaskId ? (
                              <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  style={{ width: "80px", padding: "0.25rem", background: "#000", border: "1px solid #00e5ff", color: "#fff" }}
                                  value={editQuoteVal}
                                  onChange={(e) => setEditQuoteVal(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  className="vtr-btn vtr-btn-primary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => handleSaveQuoteEdit(projectTaskId)}
                                >
                                  Save
                                </button>
                                <button
                                  className="vtr-btn"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                  onClick={() => setEditingTaskId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, fontSize: "1rem" }}>{assignedHours.toFixed(1)}h</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: "1rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
                            {consumedHours.toFixed(2)}h
                          </td>
                          <td style={{ fontWeight: 800 }}>
                            <span className={variance > 0 ? styles.variancePositive : styles.varianceNegative}>
                              {variance > 0 ? `+${variance.toFixed(2)}h` : `${variance.toFixed(2)}h`}
                            </span>
                          </td>
                          <td style={{ minWidth: "150px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "2px" }}>
                              <span>{burnPct.toFixed(0)}%</span>
                              <span>{consumedHours.toFixed(1)} / {assignedHours.toFixed(1)}h</span>
                            </div>
                            <div className={styles.progressBarBg}>
                              <div
                                className={`${styles.progressBarFill} ${progressClass}`}
                                style={{ width: `${Math.min(burnPct, 100)}%` }}
                              />
                            </div>
                          </td>
                          <td>
                            {status === "unbudgeted" ? (
                              <span className={`${styles.categoryBadge} ${styles.badgeRework}`} title="Hours logged without pre-allocated project budget">
                                ⚠️ UNBUDGETED
                              </span>
                            ) : status === "over_budget" ? (
                              <span className={`${styles.categoryBadge} ${styles.badgeRework}`}>
                                OVER BUDGET
                              </span>
                            ) : status === "nearing_limit" ? (
                              <span className={`${styles.categoryBadge} ${styles.badgeIssueFix}`}>
                                NEARING LIMIT
                              </span>
                            ) : status === "budgeted_unstarted" ? (
                              <span className={`${styles.categoryBadge} ${styles.badgeIndirect}`}>
                                NOT STARTED
                              </span>
                            ) : (
                              <span className={`${styles.categoryBadge} ${styles.badgeProduction}`}>
                                ON TRACK
                              </span>
                            )}
                          </td>
                          {isLeadOrManager && (
                            <td>
                              {!isEditing && (
                                isCorrelated && taskItem.status === "unbudgeted" ? (
                                  <button
                                    className="vtr-btn vtr-btn-primary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => {
                                      const matchingDeptTask = departmentTasks.find(
                                        dt => (taskItem.task_id && dt.id === taskItem.task_id) || dt.task_code === taskItem.task_code || dt.task_name === taskItem.task_name
                                      );
                                      if (matchingDeptTask) {
                                        setSelectedCatalogTaskId(matchingDeptTask.id);
                                        setTaskQuotedHours(matchingDeptTask.default_quoted_hours.toString());
                                      } else {
                                        setSelectedCatalogTaskId("custom");
                                        setCustomTaskName(taskItem.task_name);
                                        setTaskQuotedHours("10.0");
                                      }
                                      setTargetQuotingDept(taskItem.department);
                                      setIsAddTaskOpen(true);
                                    }}
                                  >
                                    + Assign Budget
                                  </button>
                                ) : (
                                  projectTaskId ? (
                                    <button
                                      className="vtr-btn vtr-btn-secondary"
                                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                      onClick={() => {
                                        setEditingTaskId(projectTaskId);
                                        setEditQuoteVal(assignedHours.toString());
                                      }}
                                    >
                                      Edit Quote
                                    </button>
                                  ) : null
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 3: DEPARTMENT TASK CATALOG (Lead / Manager View) */}
      {activeTab === "dept_catalog" && isLeadOrManager && (
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>
                <span>🏢</span> Core Department Tasks Library
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #aaa)" }}>
                Define core tasks and baseline quoting standards per department. Retiring tasks removes them from future machine quotes while protecting historical data.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>Department:</label>
                <select
                  style={{ padding: "0.5rem 0.85rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={selectedCatalogDept}
                  onChange={(e) => setSelectedCatalogDept(e.target.value)}
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="text"
                  placeholder="Search catalog tasks..."
                  value={catalogSearchQuery}
                  onChange={(e) => setCatalogSearchQuery(e.target.value)}
                  style={{ padding: "0.45rem 0.75rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff", fontSize: "0.85rem", width: "200px" }}
                />
                {catalogSearchQuery && (
                  <button
                    type="button"
                    className="vtr-btn"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => setCatalogSearchQuery("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Add New Core Department Task Form */}
          <div style={{ padding: "1.25rem", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--border-color, #333)" }}>
            <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "var(--vtr-theme-primary, #00e5ff)" }}>
              + Add New Core Task to {DEPARTMENTS.find(d => d.id === selectedCatalogDept)?.label}
            </h4>
            <form onSubmit={handleAddDeptTaskSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
              <div>
                <label htmlFor={newDeptId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Department</label>
                <input
                  id={newDeptId}
                  type="text"
                  value={DEPARTMENTS.find(d => d.id === selectedCatalogDept)?.label || selectedCatalogDept}
                  disabled
                  style={{ width: "100%", padding: "0.5rem", background: "rgba(255,255,255,0.05)", border: "1px solid #333", color: "#888", borderRadius: "4px" }}
                />
              </div>
              <div>
                <label htmlFor={newCodeId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Task Identifier Code *</label>
                <input
                  id={newCodeId}
                  type="text"
                  placeholder="e.g. sensor_bracket_mount"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptTaskCode}
                  onChange={(e) => setNewDeptTaskCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor={newNameId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Display Task Name *</label>
                <input
                  id={newNameId}
                  type="text"
                  placeholder="e.g. Sensor Bracket Mount & Test"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptTaskName}
                  onChange={(e) => setNewDeptTaskName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor={newHoursId} style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Default Quoted Hours *</label>
                <input
                  id={newHoursId}
                  type="number"
                  step="0.5"
                  min="0"
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptDefaultQuote}
                  onChange={(e) => setNewDeptDefaultQuote(e.target.value)}
                  required
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.3rem" }}>Task Scope & Benchmark Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Standard mounting procedures, wiring schematics, and pinout verification benchmarks..."
                  style={{ width: "100%", padding: "0.5rem", background: "#000", border: "1px solid #444", borderRadius: "4px", color: "#fff" }}
                  value={newDeptDescription}
                  onChange={(e) => setNewDeptDescription(e.target.value)}
                />
              </div>
              <div>
                <button type="submit" className="vtr-btn vtr-btn-primary" disabled={addingDeptTask} style={{ width: "100%" }}>
                  {addingDeptTask ? "Adding..." : "+ Add to Catalog"}
                </button>
              </div>
            </form>
          </div>

          {/* Department Tasks Table */}
          <div className={styles.tableWrapper}>
            {filteredDeptTasks.length === 0 ? (
              <div className={styles.emptyState}>No core tasks matching your filters.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Task Code</th>
                    <th>Task Name & Benchmark Scope</th>
                    <th>Department</th>
                    <th>Default Quoted Hours</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeptTasks.map((task) => {
                    const isEditingDeptQuote = editingDeptTaskId === task.id;

                    return (
                      <tr key={task.id}>
                        <td>
                          <code>{task.task_code}</code>
                        </td>
                        <td>
                          <strong>{task.task_name}</strong>
                          {task.description && (
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #aaa)", marginTop: "0.25rem" }}>
                              {task.description}
                            </div>
                          )}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{task.department}</td>
                        <td>
                          {isEditingDeptQuote ? (
                            <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                style={{ width: "80px", padding: "0.25rem", background: "#000", border: "1px solid #00e5ff", color: "#fff" }}
                                value={editDeptQuoteVal}
                                onChange={(e) => setEditDeptQuoteVal(e.target.value)}
                                autoFocus
                              />
                              <button
                                className="vtr-btn vtr-btn-primary"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                onClick={() => handleSaveDeptQuoteEdit(task.id)}
                              >
                                Save
                              </button>
                              <button
                                className="vtr-btn"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                onClick={() => setEditingDeptTaskId(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: "1rem" }}>{task.default_quoted_hours.toFixed(1)}h</span>
                          )}
                        </td>
                        <td>
                          <span className={`${styles.categoryBadge} ${task.is_active ? styles.badgeProduction : styles.badgeIndirect}`}>
                            {task.is_active ? "ACTIVE" : "RETIRED"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            {isLeadOrManager && task.is_active && !isEditingDeptQuote && (
                              <button
                                className="vtr-btn vtr-btn-secondary"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                onClick={() => {
                                  setEditingDeptTaskId(task.id);
                                  setEditDeptQuoteVal(task.default_quoted_hours.toString());
                                }}
                              >
                                Edit Default Quote
                              </button>
                            )}
                            {isLeadOrManager && task.is_active && (
                              <button
                                className="vtr-btn vtr-btn-danger"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                onClick={() => handleRetireDeptTask(task.id, task.task_name)}
                              >
                                Retire Task
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TIMESHEET APPROVALS DESK (Lead / Management View) */}
      {activeTab === "approvals" && (
        <TimesheetApprovalsTable
          userDepartment={user?.department}
          isManagerOrAdmin={isAdmin || hasRole(["manager"])}
          isAdmin={isAdmin}
          machines={machines}
          departmentTasks={departmentTasks}
        />
      )}
    </div>
  );
}
