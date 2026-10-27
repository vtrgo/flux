"use client";

import { useState } from "react";
import { DepartmentHub } from "../../../components/DepartmentHub";
import { AssemblyShopHubView } from "../../../components/assembly";
import styles from "./assembly.module.css";

export default function AssemblyHub() {
  const [activeTab, setActiveTab] = useState<"assemblies" | "issues">("assemblies");

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mechanical Assembly Hub</h1>
          <p className={styles.subtitle}>
            Shop Floor Machine Assemblies, Drawing Packages & FAT Gating
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Assembly Sections">
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "assemblies" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("assemblies")}
        >
          ⚙️ Assemblies & Drawing Packages
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "issues" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          ⚠️ Assembly Quality Issues
        </button>
      </nav>

      {activeTab === "assemblies" ? (
        <AssemblyShopHubView />
      ) : (
        <DepartmentHub title="Assembly Quality Hub" departmentKey="assembly" />
      )}
    </main>
  );
}
