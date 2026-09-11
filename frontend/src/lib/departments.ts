export const DEPARTMENT_LABELS: Record<string, string> = {
  design: 'Design',
  kitting: 'Kitting',
  machine_shop: 'Machine Shop',
  laser: 'Laser',
  assembly: 'Assembly',
  electrical_controls: 'Controls',
  controls: 'Controls', // alias
  enclosures: 'Enclosures',
  quality: 'Quality',
  project_management: 'Project Management',
};

export const ACTIVE_DEPARTMENTS = [
  { key: 'design', label: DEPARTMENT_LABELS['design'] },
  { key: 'kitting', label: DEPARTMENT_LABELS['kitting'] },
  { key: 'machine_shop', label: DEPARTMENT_LABELS['machine_shop'] },
  { key: 'laser', label: DEPARTMENT_LABELS['laser'] },
  { key: 'assembly', label: DEPARTMENT_LABELS['assembly'] },
  { key: 'electrical_controls', label: DEPARTMENT_LABELS['electrical_controls'] },
  { key: 'enclosures', label: DEPARTMENT_LABELS['enclosures'] },
  { key: 'project_management', label: DEPARTMENT_LABELS['project_management'] },
];

export function formatDepartmentName(key: string): string {
  return DEPARTMENT_LABELS[key] || key;
}
