import re

with open('internal/api/handlers_quality.go', 'r') as f:
    content = f.read()

# Replace SELECT in handleGetMachineDefects
content = content.replace(
    'SELECT d.id, d.machine_id, d.inspection_id, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at',
    '''SELECT d.id, d.machine_id, d.inspection_id, d.source_department, d.assigned_department, d.assigned_user_id, u.username as assigned_user_name, 
              d.created_by_user_id, c.username as created_by_user_name, 
              d.fixed_by_user_id, f.username as fixed_by_user_name, 
              d.verified_by_user_id, v.username as verified_by_user_name,
              d.description, d.severity, d.status, d.notes, d.resolved_by, d.resolved_at, d.created_at'''
)
content = content.replace(
    'LEFT JOIN users u ON d.assigned_user_id = u.id',
    '''LEFT JOIN users u ON d.assigned_user_id = u.id
		LEFT JOIN users c ON d.created_by_user_id = c.id
		LEFT JOIN users f ON d.fixed_by_user_id = f.id
		LEFT JOIN users v ON d.verified_by_user_id = v.id'''
)

# Update Scan in handleGetMachineDefects
content = content.replace(
    '&d.ID, &d.MachineID, &d.InspectionID, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.Description,',
    '&d.ID, &d.MachineID, &d.InspectionID, &d.SourceDepartment, &assigned, &d.AssignedUserID, &d.AssignedUserName, &d.CreatedByUserID, &d.CreatedByUserName, &d.FixedByUserID, &d.FixedByUserName, &d.VerifiedByUserID, &d.VerifiedByUserName, &d.Description,'
)

# Update handleAddDefect
content = content.replace(
    'var assignedUserID interface{}',
    'authUserID := getAuthenticatedUserID(r)\n\tvar assignedUserID interface{}'
)
content = content.replace(
    'INSERT INTO defects (machine_id, source_department, assigned_department, assigned_user_id, description, severity, status, notes)',
    'INSERT INTO defects (machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, description, severity, status, notes)'
)
content = content.replace(
    "VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)",
    "VALUES ($1, $2, $3, $4, NULLIF($8, '')::uuid, $5, $6, 'open', $7)"
)
content = content.replace(
    'RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at',
    'RETURNING id, machine_id, source_department, assigned_department, assigned_user_id, created_by_user_id, fixed_by_user_id, verified_by_user_id, description, severity, status, notes, resolved_by, resolved_at, created_at'
)
content = content.replace(
    'SELECT i.*, u.username as assigned_user_name \n\t\tFROM inserted i \n\t\tLEFT JOIN users u ON i.assigned_user_id = u.id',
    '''SELECT i.*, u.username as assigned_user_name, c.username as created_by_user_name, f.username as fixed_by_user_name, v.username as verified_by_user_name
		FROM inserted i 
		LEFT JOIN users u ON i.assigned_user_id = u.id
		LEFT JOIN users c ON i.created_by_user_id = c.id
		LEFT JOIN users f ON i.fixed_by_user_id = f.id
		LEFT JOIN users v ON i.verified_by_user_id = v.id'''
)
content = content.replace(
    'req.Severity, req.Notes).Scan(',
    'req.Severity, req.Notes, authUserID).Scan('
)
content = content.replace(
    '&newDefect.ID, &newDefect.MachineID, &newDefect.SourceDepartment, &newDefect.AssignedDepartment, &newDefect.AssignedUserID,\n\t\t&newDefect.Description, &newDefect.Severity, &newDefect.Status, &newDefect.Notes,\n\t\t&newDefect.ResolvedBy, &newDefect.ResolvedAt, &newDefect.CreatedAt, &newDefect.AssignedUserName,',
    '&newDefect.ID, &newDefect.MachineID, &newDefect.SourceDepartment, &newDefect.AssignedDepartment, &newDefect.AssignedUserID, &newDefect.CreatedByUserID, &newDefect.FixedByUserID, &newDefect.VerifiedByUserID, &newDefect.Description, &newDefect.Severity, &newDefect.Status, &newDefect.Notes, &newDefect.ResolvedBy, &newDefect.ResolvedAt, &newDefect.CreatedAt, &newDefect.AssignedUserName, &newDefect.CreatedByUserName, &newDefect.FixedByUserName, &newDefect.VerifiedByUserName,'
)

with open('internal/api/handlers_quality.go', 'w') as f:
    f.write(content)
