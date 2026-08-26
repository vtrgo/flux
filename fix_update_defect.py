with open("internal/api/handlers_quality.go", "r") as f:
    c = f.read()

idx = c.find("func handleUpdateDefect")
end_idx = c.find("func handleEditDefect", idx)
block = c[idx:end_idx]

# I will replace the QueryRow args and the query entirely inside block.
old_query = """	err := db.DB.QueryRow(`
		WITH updated AS (
			UPDATE defects 
			SET status = COALESCE(NULLIF($2, ''), status),
			    assigned_department = COALESCE(NULLIF($3, ''), assigned_department),
			    notes = COALESCE(NULLIF($4, ''), notes),
			    resolved_at = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN NOW() 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_at 
			    END, 
			    resolved_by = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_by 
			    END
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at
		)
		SELECT u_tbl.*, u.username as assigned_user_name 
		FROM updated u_tbl 
		LEFT JOIN users u ON u_tbl.assigned_user_id = u.id
	`, defectID, req.Status, req.AssignedDepartment, req.Notes, authUserID).Scan("""

new_query = """	err := db.DB.QueryRow(`
		WITH updated AS (
			UPDATE defects 
			SET status = COALESCE(NULLIF($2, ''), status),
			    assigned_department = COALESCE(NULLIF($3, ''), assigned_department),
			    notes = COALESCE(NULLIF($4, ''), notes),
			    resolved_at = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN NOW() 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_at 
			    END, 
			    resolved_by = CASE 
			        WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_by 
			    END,
			    fixed_by_user_id = CASE
			        WHEN $2 = 'fixed' THEN NULLIF($5, '')::uuid
			        WHEN $2 = 'open' THEN NULL
			        ELSE fixed_by_user_id
			    END,
			    verified_by_user_id = CASE
			        WHEN $2 = 'verified' THEN NULLIF($5, '')::uuid
			        WHEN $2 = 'open' THEN NULL
			        ELSE verified_by_user_id
			    END
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at
		)
		SELECT u_tbl.*, u.username as assigned_user_name, c.username as created_by_user_name, f.username as fixed_by_user_name, v.username as verified_by_user_name 
		FROM updated u_tbl 
		LEFT JOIN users u ON u_tbl.assigned_user_id = u.id
		LEFT JOIN users c ON u_tbl.created_by_user_id = c.id
		LEFT JOIN users f ON u_tbl.fixed_by_user_id = f.id
		LEFT JOIN users v ON u_tbl.verified_by_user_id = v.id
	`, defectID, req.Status, req.AssignedDepartment, req.Notes, authUserID).Scan("""

if old_query in block:
    block = block.replace(old_query, new_query)
else:
    print("Could not find old query in handleUpdateDefect")

c = c[:idx] + block + c[end_idx:]
with open("internal/api/handlers_quality.go", "w") as f:
    f.write(c)
