package assemblies

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/vtrgo/flux/internal/models"
)

type BOMImporter interface {
	Parse(r io.Reader, machineID uuid.UUID) ([]models.ParsedBOMNode, error)
	Validate(nodes []models.ParsedBOMNode) (*models.BOMValidationReport, error)
}

type GenericCSVBOMImporter struct{}

func NewGenericCSVBOMImporter() BOMImporter {
	return &GenericCSVBOMImporter{}
}

func (i *GenericCSVBOMImporter) Parse(r io.Reader, machineID uuid.UUID) ([]models.ParsedBOMNode, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1 // flexible column count

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	colIdx := make(map[string]int)
	for idx, name := range header {
		clean := strings.ToLower(strings.TrimSpace(name))
		clean = strings.ReplaceAll(clean, "_", "")
		clean = strings.ReplaceAll(clean, " ", "")
		clean = strings.ReplaceAll(clean, "-", "")
		colIdx[clean] = idx
	}

	getVal := func(row []string, keys ...string) string {
		for _, k := range keys {
			if idx, ok := colIdx[k]; ok && idx < len(row) {
				return strings.TrimSpace(row[idx])
			}
		}
		return ""
	}

	var nodes []models.ParsedBOMNode
	nodeMap := make(map[string]*models.ParsedBOMNode)

	line := 1
	for {
		line++
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("CSV error on line %d: %w", line, err)
		}
		if len(row) == 0 {
			continue
		}

		asmCode := getVal(row, "assemblycode", "code", "assembly")
		name := getVal(row, "name", "assemblyname", "title")
		parentCode := getVal(row, "parentcode", "parent", "parentassembly")
		desc := getVal(row, "description", "desc")
		drawing := getVal(row, "drawingnumber", "drawing", "drawingnum")
		rev := getVal(row, "revision", "rev")
		dept := getVal(row, "department", "dept")
		quoteStr := getVal(row, "quotedhours", "quote", "hours")

		partNum := getVal(row, "partnumber", "part", "partnum", "itemnumber")
		partDesc := getVal(row, "partdescription", "partdesc")
		qtyStr := getVal(row, "qty", "quantity", "qtyrequired")

		if asmCode == "" && partNum == "" {
			continue // skip empty row
		}

		// If this is a new assembly node or row attaches to existing assembly
		if asmCode != "" {
			if existing, ok := nodeMap[asmCode]; ok {
				// Attach part to existing assembly node
				if partNum != "" {
					qty := 1
					if q, err := strconv.Atoi(qtyStr); err == nil && q > 0 {
						qty = q
					}
					existing.Parts = append(existing.Parts, models.ParsedBOMPart{
						PartNumber:  partNum,
						Description: partDesc,
						QtyRequired: qty,
					})
				}
				continue
			}

			quote := 0.0
			if q, err := strconv.ParseFloat(quoteStr, 64); err == nil && q >= 0 {
				quote = q
			}
			if rev == "" {
				rev = "A"
			}
			if dept == "" {
				dept = "assembly"
			}
			if name == "" {
				name = asmCode
			}

			node := models.ParsedBOMNode{
				AssemblyCode:  asmCode,
				ParentCode:    parentCode,
				Name:          name,
				Description:   desc,
				DrawingNumber: drawing,
				Revision:      rev,
				Department:    dept,
				QuotedHours:   quote,
				Parts:         []models.ParsedBOMPart{},
			}

			if partNum != "" {
				qty := 1
				if q, err := strconv.Atoi(qtyStr); err == nil && q > 0 {
					qty = q
				}
				node.Parts = append(node.Parts, models.ParsedBOMPart{
					PartNumber:  partNum,
					Description: partDesc,
					QtyRequired: qty,
				})
			}

			nodes = append(nodes, node)
			nodeMap[asmCode] = &nodes[len(nodes)-1]
		}
	}

	return nodes, nil
}

func (i *GenericCSVBOMImporter) Validate(nodes []models.ParsedBOMNode) (*models.BOMValidationReport, error) {
	report := &models.BOMValidationReport{
		IsValid:     true,
		TotalNodes:  len(nodes),
		Errors:      []models.BOMValidationError{},
		Warnings:    []string{},
		PreviewTree: []models.MachineAssembly{},
	}

	seenCodes := make(map[string]bool)
	codeToParent := make(map[string]string)
	totalParts := 0

	for idx, n := range nodes {
		rowNum := idx + 2 // 1-based, accounting for header

		if strings.TrimSpace(n.AssemblyCode) == "" {
			report.IsValid = false
			report.Errors = append(report.Errors, models.BOMValidationError{
				Row:     rowNum,
				Code:    n.AssemblyCode,
				Message: "Assembly code cannot be empty",
			})
		}

		if seenCodes[n.AssemblyCode] {
			report.IsValid = false
			report.Errors = append(report.Errors, models.BOMValidationError{
				Row:     rowNum,
				Code:    n.AssemblyCode,
				Message: fmt.Sprintf("Duplicate assembly code '%s'", n.AssemblyCode),
			})
		}
		seenCodes[n.AssemblyCode] = true
		codeToParent[n.AssemblyCode] = n.ParentCode
		totalParts += len(n.Parts)
	}

	report.TotalParts = totalParts

	// Check parent validity and cycles
	for idx, n := range nodes {
		rowNum := idx + 2
		if n.ParentCode != "" {
			if !seenCodes[n.ParentCode] {
				report.IsValid = false
				report.Errors = append(report.Errors, models.BOMValidationError{
					Row:     rowNum,
					Code:    n.AssemblyCode,
					Message: fmt.Sprintf("Parent assembly code '%s' does not exist in BOM", n.ParentCode),
				})
			}

			// Cycle detection
			visited := make(map[string]bool)
			curr := n.AssemblyCode
			for curr != "" {
				if visited[curr] {
					report.IsValid = false
					report.Errors = append(report.Errors, models.BOMValidationError{
						Row:     rowNum,
						Code:    n.AssemblyCode,
						Message: fmt.Sprintf("Circular dependency detected involving '%s'", curr),
					})
					break
				}
				visited[curr] = true
				curr = codeToParent[curr]
			}
		}
	}

	// Build preview tree if valid
	if report.IsValid {
		idMap := make(map[string]*models.MachineAssembly)
		var previewRoots []models.MachineAssembly

		for _, n := range nodes {
			fakeID := uuid.New()
			asm := models.MachineAssembly{
				ID:            fakeID,
				AssemblyCode:  n.AssemblyCode,
				Name:          n.Name,
				Description:   n.Description,
				DrawingNumber: n.DrawingNumber,
				Revision:      n.Revision,
				Department:    n.Department,
				QuotedHours:   n.QuotedHours,
				Status:        models.AssemblyStatusDesignDraft,
				SubAssemblies: []models.MachineAssembly{},
				Parts:         make([]models.KittingPart, len(n.Parts)),
			}
			for pIdx, p := range n.Parts {
				asm.Parts[pIdx] = models.KittingPart{
					ID:          uuid.New(),
					PartNumber:  p.PartNumber,
					Description: p.Description,
					QtyRequired: p.QtyRequired,
					Status:      "pending",
				}
			}
			idMap[n.AssemblyCode] = &asm
		}

		// First pass: link parent-child
		for _, n := range nodes {
			if n.ParentCode != "" {
				if parent, ok := idMap[n.ParentCode]; ok {
					parent.SubAssemblies = append(parent.SubAssemblies, *idMap[n.AssemblyCode])
				}
			}
		}

		// Second pass: collect roots
		for _, n := range nodes {
			if n.ParentCode == "" {
				previewRoots = append(previewRoots, *idMap[n.AssemblyCode])
			}
		}
		report.PreviewTree = previewRoots
	}

	return report, nil
}
