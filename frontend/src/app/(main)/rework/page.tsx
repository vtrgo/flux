"use client";

import React, { useState, useMemo } from "react";
import styles from "./rework.module.css";
import { useReworkData } from "../../../hooks/useReworkData";
import { ReworkItem, ReworkPartType } from "../../../types";
import { ReworkModal } from "../../../components/ReworkModal";
import { ControlsSchematicTracker } from "../../../components/ControlsSchematicTracker";
import { FilterButtonGroup } from "../../../components/FilterButtonGroup";
import { fetchApi } from "../../../lib/api";
import { toast } from "sonner";

export default function ReworkHubPage() {
  const [activeTab, setActiveTab] = useState<"active" | "complete" | "controls">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReworkItem | null>(null);

  const { items, loading, refetch } = useReworkData({
    view: activeTab === "controls" ? "all" : activeTab,
  });

  // Calculate Metrics
  const metrics = useMemo(() => {
    const totalActive = items.filter((i) => i.status !== "complete" && i.status !== "cancelled").length;
    const inMfg = items.filter((i) => i.status === "in_machining" || i.status === "released_to_mfg").length;
    const outsidePP = items.filter((i) => i.requires_outside_processing && i.status !== "complete").length;
    const completed = items.filter((i) => i.status === "complete").length;
    const totalEstHours = items.reduce((acc, i) => acc + (i.estimated_hours || 0), 0);
    const totalActHours = items.reduce((acc, i) => acc + (i.actual_hours || 0), 0);

    return { totalActive, inMfg, outsidePP, completed, totalEstHours, totalActHours };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        i.part_number.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.project_number.toLowerCase().includes(q) ||
        (i.sub_assembly && i.sub_assembly.toLowerCase().includes(q));

      const matchesType = typeFilter === "All" || i.part_type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, typeFilter]);

  const handleRowClick = (item: ReworkItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleOpenNew = () => {
    setSelectedItem(null);
    setIsModalOpen(true);
  };

  const handleAfterHoursDropQuick = async (e: React.MouseEvent, item: ReworkItem) => {
    e.stopPropagation();
    try {
      await fetchApi(`rework/items/${item.id}/after-hours-drop`, {
        method: "POST",
        body: JSON.stringify({ part_given_to_or_left_at: "Manufacturing Desk" }),
      });
      toast.success(`Flagged after-hours drop for ${item.part_number}`);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record drop";
      toast.error(msg);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "design_draft":
      case "released_to_pm":
        return <span className={styles.badgeDraft}>Design / PM</span>;
      case "released_to_mfg":
      case "in_machining":
        return <span className={styles.badgeMfg}>In Mfg</span>;
      case "outside_processing":
        return <span className={styles.badgeOutside}>Outside PP</span>;
      case "complete":
        return <span className={styles.badgeComplete}>Complete</span>;
      default:
        return <span className={styles.badgeDraft}>{status}</span>;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Rework Operations Hub</h1>
          <p className={styles.subtitle}>SOP 1-003 Standard Operating Procedure for Rework & Part Tracking</p>
        </div>

        <div className={styles.headerActions}>
          <button className="vtr-btn vtr-btn-primary" onClick={handleOpenNew}>
            + Log Rework Item
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{metrics.totalActive}</span>
          <span className={styles.metricLabel}>Active Pipeline</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "#c084fc" }}>{metrics.inMfg}</span>
          <span className={styles.metricLabel}>In Manufacturing</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "#fb923c" }}>{metrics.outsidePP}</span>
          <span className={styles.metricLabel}>Outside Processing</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue} style={{ color: "#4ade80" }}>{metrics.completed}</span>
          <span className={styles.metricLabel}>Complete Archive</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricValue}>{metrics.totalActHours.toFixed(1)} / {metrics.totalEstHours.toFixed(1)}h</span>
          <span className={styles.metricLabel}>Actual / Est Hours</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "active" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active Rework Pipeline
        </button>
        <button
          className={`${styles.tab} ${activeTab === "complete" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("complete")}
        >
          COMPLETE Tab (SOP Archive)
        </button>
        <button
          className={`${styles.tab} ${activeTab === "controls" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("controls")}
        >
          Controls Schematics (Step 6)
        </button>
      </div>

      {activeTab === "controls" ? (
        <ControlsSchematicTracker />
      ) : (
        <>
          {/* Controls Bar */}
          <div className={styles.controls}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search part #, description, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <FilterButtonGroup
              options={["All", "NEW", "MOD"]}
              activeOption={typeFilter}
              onChange={(opt) => setTypeFilter(opt as ReworkPartType | "All")}
            />
          </div>

          {/* Rework High-Density Table */}
          <div className={styles.tableWrapper}>
            {loading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                Loading Rework Items...
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                No rework items found for this view.
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Part Number</th>
                    <th>Rev</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Material</th>
                    <th>Qty</th>
                    <th>Designer</th>
                    <th>Req&apos;d Date</th>
                    <th>Machinist</th>
                    <th>Exp Date</th>
                    <th>Outside Vendor</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} onClick={() => handleRowClick(item)}>
                      <td style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--vtr-theme-primary)" }}>
                        {item.project_number}
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                        {item.part_number}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        {item.revision}
                      </td>
                      <td>
                        <span className={item.part_type === "NEW" ? styles.badgeNew : styles.badgeMod}>
                          {item.part_type}
                        </span>
                      </td>
                      <td>{item.description}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{item.material}</td>
                      <td>{item.qty}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{item.mech_designer_name || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>
                        {item.requested_completion_date || "—"}
                      </td>
                      <td>{item.assigned_machinist_name || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>
                        {item.expected_completion_date || "—"}
                      </td>
                      <td>
                        {item.requires_outside_processing ? (
                          <span style={{ color: "#fb923c" }}>{item.outside_vendor || "Vendor Assigned"}</span>
                        ) : (
                          <span style={{ color: "#666" }}>Internal</span>
                        )}
                      </td>
                      <td>{renderStatusBadge(item.status)}</td>
                      <td style={{ textAlign: "right" }}>
                        {item.status !== "complete" && !item.is_after_hours_drop && (
                          <button
                            className="vtr-btn"
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.4rem" }}
                            onClick={(e) => handleAfterHoursDropQuick(e, item)}
                            title="Flag parts left on manufacturing desk after hours"
                          >
                            Desk Drop
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Rework Modal */}
      {isModalOpen && (
        <ReworkModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          editingItem={selectedItem}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
