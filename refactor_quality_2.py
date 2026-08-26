import re

with open('internal/api/handlers_quality.go', 'r') as f:
    content = f.read()

# handleGetAllDefects SELECT
content = content.replace(
    'SELECT d.id, d.machine_id, m.order_number, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at',
    '''SELECT d.id, d.machine_id, m.order_number, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, 
              d.created_by_user_id, c.username as created_by_user_name, 
              d.fixed_by_user_id, f.username as fixed_by_user_name, 
              d.verified_by_user_id, v.username as verified_by_user_name,
              d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at'''
)

# handleGetAllDefects Scan
content = content.replace(
    '&d.ID, &d.MachineID, &d.OrderNumber, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.Description,',
    '&d.ID, &d.MachineID, &d.OrderNumber, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.CreatedByUserID, &d.CreatedByUserName, &d.FixedByUserID, &d.FixedByUserName, &d.VerifiedByUserID, &d.VerifiedByUserName, &d.Description,'
)

# handleUpdateDefect
content = content.replace(
    'var updatedDefect models.Defect',
    'authUserID := getAuthenticatedUserID(r)\n\tvar updatedDefect models.Defect'
)
content = content.replace(
    '''			        WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' 
			        WHEN $2 = 'open' THEN NULL 
			        ELSE resolved_by 
			    END
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at''',
    '''			        WHEN $2 IN ('fixed', 'verified') THEN 'user_quality_01' 
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
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at'''
)
content = content.replace(
    'req.Status, req.AssignedDepartment, req.Notes).Scan(',
    'req.Status, req.AssignedDepartment, req.Notes, authUserID).Scan('
)
content = content.replace(
    '&updatedDefect.ID, &updatedDefect.MachineID, &updatedDefect.SourceDepartment, &updatedDefect.AssignedDepartment, &updatedDefect.AssignedUserID,\n\t\t&updatedDefect.Description, &updatedDefect.Severity, &updatedDefect.Status, &updatedDefect.Notes,\n\t\t&updatedDefect.ResolvedBy, &updatedDefect.ResolvedAt, &updatedDefect.CreatedAt, &updatedDefect.AssignedUserName,',
    '&updatedDefect.ID, &updatedDefect.MachineID, &updatedDefect.SourceDepartment, &updatedDefect.AssignedDepartment, &updatedDefect.AssignedUserID, &updatedDefect.CreatedByUserID, &updatedDefect.FixedByUserID, &updatedDefect.VerifiedByUserID, &updatedDefect.Description, &updatedDefect.Severity, &updatedDefect.Status, &updatedDefect.Notes, &updatedDefect.ResolvedBy, &updatedDefect.ResolvedAt, &updatedDefect.CreatedAt, &updatedDefect.AssignedUserName, &updatedDefect.CreatedByUserName, &updatedDefect.FixedByUserName, &updatedDefect.VerifiedByUserName,'
)

# handleEditDefect
content = content.replace(
    '''			UPDATE defects 
			SET description = COALESCE(NULLIF($2, ''), description),
			    severity = COALESCE(NULLIF($3, ''), severity),
			    notes = COALESCE(NULLIF($4, ''), notes)
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at''',
    '''			UPDATE defects 
			SET description = COALESCE(NULLIF($2, ''), description),
			    severity = COALESCE(NULLIF($3, ''), severity),
			    notes = COALESCE(NULLIF($4, ''), notes)
			WHERE id = $1
			RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at'''
)

with open('internal/api/handlers_quality.go', 'w') as f:
    f.write(content)
