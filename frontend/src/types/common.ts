export interface User {
  id: string;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  role?: string;
  auth_provider?: string;
  external_id?: string;
}


export interface TimezoneOption {
  id: string;
  name: string;
  region: string;
  offset: string;
}


export interface InAppAlert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  department?: string;
  machine_id?: string;
  machine_number?: string;
  recipient_email?: string;
  opened_by?: string;
  created_at: string;
  read: boolean;
}

