package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

func TestMachineAssemblyHandlers(t *testing.T) {
	connStr := "host=/var/run/postgresql dbname=flux_test sslmode=disable"
	if err := db.InitDB(connStr); err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	mux := http.NewServeMux()
	server := NewServer(db.DB, Hub, nil)
	server.RegisterRoutes(mux)

	// Setup: create test sales order and machine
	var soID uuid.UUID
	err := db.DB.QueryRow(`
		INSERT INTO sales_orders (project_name, customer_name, po_number)
		VALUES ('Assembly Test Project', 'Assembly Client', 'PO-ASM-001')
		RETURNING id
	`).Scan(&soID)
	if err != nil {
		t.Fatalf("failed to insert test sales order: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM sales_orders WHERE id = $1", soID)
	}()

	var machineID uuid.UUID
	err = db.DB.QueryRow(`
		INSERT INTO machines (sales_order_id, order_number, model_type, status)
		VALUES ($1, 'ASM-MACH-01', 'Automation Cell', 'assembly')
		RETURNING id
	`, soID).Scan(&machineID)
	if err != nil {
		t.Fatalf("failed to insert test machine: %v", err)
	}
	defer func() {
		_, _ = db.DB.Exec("DELETE FROM machines WHERE id = $1", machineID)
	}()

	// 1. Create Master Assembly
	var masterID uuid.UUID
	t.Run("Create_Master_Assembly", func(t *testing.T) {
		payload := map[string]interface{}{
			"assembly_code": "ASM-01",
			"name":          "Main Feeder Bowl Drive",
			"description":   "Primary bowl drive and housing",
			"drawing_number": "VTR-1024-D01",
			"quoted_hours":  16.0,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/machines/%s/assemblies", machineID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created models.MachineAssembly
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("failed to unmarshal response: %v", err)
		}
		if created.AssemblyCode != "ASM-01" || created.QuotedHours != 16.0 {
			t.Fatalf("unexpected assembly: %+v", created)
		}
		masterID = created.ID
	})

	// 2. Create Child Sub-Assembly
	var subID uuid.UUID
	t.Run("Create_Sub_Assembly", func(t *testing.T) {
		payload := map[string]interface{}{
			"parent_assembly_id": masterID.String(),
			"assembly_code":      "SUB-01A",
			"name":               "Motor Mount Plate",
			"drawing_number":     "VTR-1024-D01-1",
			"quoted_hours":       4.0,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/machines/%s/assemblies", machineID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created models.MachineAssembly
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("failed to unmarshal response: %v", err)
		}
		if created.AssemblyCode != "SUB-01A" || created.ParentAssemblyID == nil || *created.ParentAssemblyID != masterID {
			t.Fatalf("unexpected sub-assembly: %+v", created)
		}
		subID = created.ID
	})

	// 3. Add Part to Sub-Assembly
	t.Run("Add_Part_To_Sub_Assembly", func(t *testing.T) {
		partPayload := map[string]interface{}{
			"part_number":  "MTR-100",
			"description":  "10HP AC Motor",
			"qty_required": 1,
		}
		body, _ := json.Marshal(partPayload)
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/assemblies/%s/parts", subID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 4. Fetch Hierarchy Tree
	t.Run("Get_Assembly_Hierarchy_Tree", func(t *testing.T) {
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/machines/%s/assemblies", machineID), nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var tree []models.MachineAssembly
		if err := json.Unmarshal(w.Body.Bytes(), &tree); err != nil {
			t.Fatalf("failed to unmarshal tree: %v", err)
		}

		if len(tree) != 1 {
			t.Fatalf("expected 1 root assembly, got %d", len(tree))
		}
		if tree[0].AssemblyCode != "ASM-01" {
			t.Fatalf("expected root to be ASM-01, got %s", tree[0].AssemblyCode)
		}
		if len(tree[0].SubAssemblies) != 1 {
			t.Fatalf("expected 1 sub-assembly, got %d", len(tree[0].SubAssemblies))
		}
		if tree[0].SubAssemblies[0].AssemblyCode != "SUB-01A" {
			t.Fatalf("expected sub-assembly SUB-01A, got %s", tree[0].SubAssemblies[0].AssemblyCode)
		}
		if len(tree[0].SubAssemblies[0].Parts) != 1 {
			t.Fatalf("expected 1 part on sub-assembly, got %d", len(tree[0].SubAssemblies[0].Parts))
		}
		if tree[0].SubAssemblies[0].Parts[0].PartNumber != "MTR-100" {
			t.Fatalf("expected part MTR-100, got %s", tree[0].SubAssemblies[0].Parts[0].PartNumber)
		}
	})

	// 5. Update Assembly
	t.Run("Update_Assembly", func(t *testing.T) {
		newQuote := 18.5
		payload := map[string]interface{}{
			"quoted_hours": newQuote,
			"name":         "Updated Bowl Drive",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("PUT", fmt.Sprintf("/api/assemblies/%s", masterID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 6. Preview BOM CSV
	t.Run("Preview_BOM_Import", func(t *testing.T) {
		csvContent := `AssemblyCode,ParentCode,Name,DrawingNumber,Rev,QuotedHours,PartNumber,PartDescription,Qty
BOM-01,,Infeed Track Unit,VTR-D10,A,12.0,TRK-01,Linear Track,1
BOM-01A,BOM-01,Slide Mechanism,VTR-D10-1,A,6.0,SLD-05,Pneumatic Slide,1
`
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/machines/%s/assemblies/import/preview", machineID), bytes.NewReader([]byte(csvContent)))
		req.Header.Set("Content-Type", "text/csv")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Report models.BOMValidationReport `json:"report"`
			Nodes  []models.ParsedBOMNode     `json:"nodes"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode preview: %v", err)
		}
		if !resp.Report.IsValid || len(resp.Nodes) != 2 {
			t.Fatalf("unexpected preview response: %+v", resp)
		}
	})

	// 7. Delete Assembly
	t.Run("Delete_Assembly", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/assemblies/%s", masterID), nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		// Verify deletion cascaded to child
		reqCheck := httptest.NewRequest("GET", fmt.Sprintf("/api/assemblies/%s", subID), nil)
		wCheck := httptest.NewRecorder()
		mux.ServeHTTP(wCheck, reqCheck)
		if wCheck.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for cascaded child, got %d", wCheck.Code)
		}
	})
}
